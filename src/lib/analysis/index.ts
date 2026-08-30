/**
 * The analysis engine.
 *
 * Given a log, returns per symptom: which foods track with it, how confident that is,
 * which foods look safe, what can't be told apart yet, and the single experiment that
 * would settle the biggest open question.
 *
 * Pipeline, per symptom:
 *   1. Build one observation per logged day (observations.ts).
 *   2. For every (tag, lag) pair, split days into exposed and unexposed and take the
 *      difference in mean severity.
 *   3. Permutation-test each difference (stats.ts).
 *   4. Benjamini-Hochberg across the whole family of tests for that symptom, so
 *      testing fifteen foods doesn't manufacture a culprit.
 *   5. Keep the better lag per tag, rank, and attach entanglement warnings.
 *
 * Everything is deterministic: the same log always produces the same verdicts.
 */
import { daysBetween } from '../dates';
import { findEntanglements, separatingDays } from './confounds';
import {
  buildObservations,
  coverage,
  exposedDays,
  observedDays,
  outcomeFor,
  type Observations,
} from './observations';
import { benjaminiHochberg, hashString, mean, permutationTest } from './stats';
import {
  DEFAULT_OPTIONS,
  MIN_USEFUL_DAYS,
  type AnalysisInput,
  type AnalysisOptions,
  type AnalysisReport,
  type Confidence,
  type DataQuality,
  type Direction,
  type Finding,
  type Lag,
  type SuggestedChallenge,
  type SymptomReport,
} from './types';

const LAGS: Lag[] = [0, 1];

export function runAnalysis(input: AnalysisInput): AnalysisReport {
  const options: AnalysisOptions = { ...DEFAULT_OPTIONS, ...input.options };
  const observations = buildObservations(input.meals, input.symptomLogs);
  const days = observedDays(observations);

  const symptoms = input.symptomTypeIds.map((symptomTypeId) =>
    analyseSymptom(observations, days, symptomTypeId, input.tagIds, options)
  );

  return {
    symptoms,
    quality: assessQuality(observations, days, input, options),
  };
}

function analyseSymptom(
  observations: Observations,
  days: string[],
  symptomTypeId: string,
  tagIds: string[],
  options: AnalysisOptions
): SymptomReport {
  // Every (tag, lag) combination is one hypothesis. All of them go into the
  // correction together — testing two lags is two chances to be fooled, not one.
  interface Candidate {
    tagId: string;
    lag: Lag;
    effect: number;
    pValue: number;
    meanExposed: number;
    meanUnexposed: number;
    nExposed: number;
    nUnexposed: number;
  }

  const candidates: Candidate[] = [];
  const underPowered = new Map<string, number>();

  for (const tagId of tagIds) {
    const exposed = exposedDays(observations, tagId);

    for (const lag of LAGS) {
      const withTag: number[] = [];
      const withoutTag: number[] = [];

      for (const day of days) {
        const outcome = outcomeFor(observations, day, symptomTypeId, lag, tagId);
        // Null means the outcome day was never logged. Dropping it is the whole
        // reason a two-week gap in logging doesn't read as a fortnight of relief.
        if (outcome === null) continue;
        if (exposed.has(day)) withTag.push(outcome);
        else withoutTag.push(outcome);
      }

      if (withTag.length < options.minExposedDays || withoutTag.length < options.minUnexposedDays) {
        if (lag === 0) {
          underPowered.set(tagId, Math.max(0, options.minExposedDays - withTag.length));
        }
        continue;
      }

      const result = permutationTest(withTag, withoutTag, {
        iterations: options.iterations,
        seed: hashString(`${symptomTypeId}|${tagId}|${lag}`),
      });

      candidates.push({ tagId, lag, ...result });
    }
  }

  const qValues = benjaminiHochberg(candidates.map((c) => c.pValue));

  const entanglements = findEntanglements(
    observations,
    tagIds,
    options.entanglementThreshold,
    options.minExposedDays
  );
  const entangledByTag = new Map<string, string[]>();
  for (const { tagId, otherTagId } of entanglements) {
    entangledByTag.set(tagId, [...(entangledByTag.get(tagId) ?? []), otherTagId]);
  }

  const scored: Finding[] = candidates.map((candidate, index) => {
    const qValue = qValues[index];
    return {
      tagId: candidate.tagId,
      symptomTypeId,
      lag: candidate.lag,
      effect: candidate.effect,
      meanExposed: candidate.meanExposed,
      meanUnexposed: candidate.meanUnexposed,
      nExposed: candidate.nExposed,
      nUnexposed: candidate.nUnexposed,
      pValue: candidate.pValue,
      qValue,
      confidence: classify(candidate.effect, candidate.pValue, qValue, options),
      direction: direction(candidate.effect, options.minEffect),
      entangledWith: entangledByTag.get(candidate.tagId) ?? [],
      daysNeeded: 0,
    };
  });

  // One row per tag: keep the lag that made the strongest case for itself.
  const bestByTag = new Map<string, Finding>();
  for (const finding of scored) {
    const current = bestByTag.get(finding.tagId);
    if (!current || better(finding, current)) bestByTag.set(finding.tagId, finding);
  }

  // Tags that never reached the threshold still deserve a row, so the user can see
  // what is close and what is being ignored.
  for (const [tagId, needed] of underPowered) {
    if (bestByTag.has(tagId)) continue;
    bestByTag.set(tagId, {
      tagId,
      symptomTypeId,
      lag: 0,
      effect: 0,
      meanExposed: 0,
      meanUnexposed: 0,
      nExposed: exposedDays(observations, tagId).size,
      nUnexposed: days.length - exposedDays(observations, tagId).size,
      pValue: 1,
      qValue: 1,
      confidence: 'insufficient',
      direction: 'flat',
      entangledWith: entangledByTag.get(tagId) ?? [],
      daysNeeded: needed,
    });
  }

  const all = [...bestByTag.values()];

  // "Looks safe" is a claim, so it needs evidence behind it. A tag that merely
  // drifted below zero without reaching significance is not safe, it is untested —
  // it belongs in the main list showing "no signal", where it reads honestly.
  const safe = new Set(
    all.filter(
      (f) =>
        f.direction === 'better' && (f.confidence === 'strong' || f.confidence === 'possible')
    )
  );

  const findings = all.filter((f) => !safe.has(f)).sort(rank);
  const safeFindings = [...safe].sort((a, b) => a.effect - b.effect);

  const severities = days
    .map((day) => outcomeFor(observations, day, symptomTypeId, 0, null))
    .filter((value): value is number => value !== null);

  return {
    symptomTypeId,
    findings,
    safeFindings,
    entanglements,
    suggestedChallenge: suggestChallenge(observations, symptomTypeId, findings, entanglements),
    baseline: mean(severities),
    observedDays: days.length,
    daysWithSymptom: severities.filter((value) => value > 0).length,
    hypothesesTested: candidates.length,
  };
}

function classify(
  effect: number,
  pValue: number,
  qValue: number,
  options: AnalysisOptions
): Confidence {
  // A statistically clean but tiny difference is not worth changing a diet over.
  if (Math.abs(effect) < options.minEffect) return 'none';
  if (qValue <= options.strongQ) return 'strong';
  if (pValue <= options.possibleP) return 'possible';
  return 'none';
}

function direction(effect: number, minEffect: number): Direction {
  if (effect >= minEffect) return 'worse';
  if (effect <= -minEffect) return 'better';
  return 'flat';
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  strong: 0,
  possible: 1,
  none: 2,
  insufficient: 3,
};

function better(a: Finding, b: Finding): boolean {
  if (a.qValue !== b.qValue) return a.qValue < b.qValue;
  return Math.abs(a.effect) > Math.abs(b.effect);
}

function rank(a: Finding, b: Finding): number {
  const byConfidence = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
  if (byConfidence !== 0) return byConfidence;
  return b.effect - a.effect;
}

/**
 * The single most informative thing the user could do next.
 *
 * Priority order: break the entanglement blocking the top suspect, otherwise run a
 * deliberate challenge on the top suspect, otherwise get more exposures for whatever
 * is closest to being testable. Only one is ever suggested — a list of experiments
 * is a list nobody runs.
 */
function suggestChallenge(
  observations: Observations,
  symptomTypeId: string,
  findings: Finding[],
  entanglements: { tagId: string; otherTagId: string; overlap: number }[]
): SuggestedChallenge | null {
  const credible = findings.filter(
    (f) => f.direction === 'worse' && (f.confidence === 'strong' || f.confidence === 'possible')
  );

  for (const finding of credible) {
    const tangle = entanglements.find((e) => e.tagId === finding.tagId);
    if (!tangle) continue;
    const separators = separatingDays(observations, finding.tagId, tangle.otherTagId);
    if (separators >= 5) continue; // Already enough evidence to tell them apart.
    return {
      tagId: finding.tagId,
      excludeTagId: tangle.otherTagId,
      symptomTypeId,
      targetExposures: 3,
      reason: 'entangled',
    };
  }

  if (credible.length > 0) {
    return {
      tagId: credible[0].tagId,
      excludeTagId: null,
      symptomTypeId,
      targetExposures: 3,
      reason: 'confirm',
    };
  }

  const closest = findings
    .filter((f) => f.confidence === 'insufficient' && f.daysNeeded > 0)
    .sort((a, b) => a.daysNeeded - b.daysNeeded)[0];

  if (closest) {
    return {
      tagId: closest.tagId,
      excludeTagId: null,
      symptomTypeId,
      targetExposures: closest.daysNeeded,
      reason: 'more-data',
    };
  }

  return null;
}

function assessQuality(
  observations: Observations,
  days: string[],
  input: AnalysisInput,
  options: AnalysisOptions
): DataQuality {
  const untestableTagIds: string[] = [];
  for (const tagId of input.tagIds) {
    const exposed = exposedDays(observations, tagId).size;
    if (exposed < options.minExposedDays || days.length - exposed < options.minUnexposedDays) {
      untestableTagIds.push(tagId);
    }
  }

  const notes: string[] = [];
  if (days.length === 0) {
    notes.push('Log a few days to get started.');
  } else if (days.length < MIN_USEFUL_DAYS) {
    notes.push(
      `Log ${MIN_USEFUL_DAYS - days.length} more days before the first results mean much.`
    );
  }

  if (input.symptomLogs.length === 0 && days.length > 0) {
    notes.push('No symptoms logged yet — there is nothing to correlate meals against.');
  }

  const cover = coverage(observations);
  if (days.length >= 7 && cover < 0.6) {
    notes.push('Gaps in your log weaken the comparison — skipped days are ignored, not assumed good.');
  }

  if (untestableTagIds.length > 0 && untestableTagIds.length === input.tagIds.length) {
    notes.push('No food has appeared on enough days yet to compare against days without it.');
  }

  return {
    observedDays: days.length,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    totalMeals: input.meals.length,
    totalSymptomLogs: input.symptomLogs.length,
    coverage: cover,
    untestableTagIds,
    notes,
  };
}

/** Days between the first and last entry, inclusive. Used for headline copy. */
export function loggedSpan(report: AnalysisReport): number {
  const { firstDay, lastDay } = report.quality;
  if (!firstDay || !lastDay) return 0;
  return daysBetween(firstDay, lastDay) + 1;
}

export * from './types';
export { buildObservations, observedDays } from './observations';
export { benjaminiHochberg, permutationTest } from './stats';
