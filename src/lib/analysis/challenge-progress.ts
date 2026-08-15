/**
 * Progress on a deliberate food challenge.
 *
 * A challenge is the answer to a question observational data cannot settle: eat the
 * suspect food on its own, several times, and watch. A qualifying day is one since
 * the challenge began where the food appeared and the entangled partner did not —
 * days where both showed up teach nothing and are not counted.
 */
import type { Challenge } from '../types';
import { buildObservations, outcomeFor, type Observations } from './observations';
import { mean } from './stats';

export interface ChallengeProgress {
  /** Days that satisfied the challenge conditions. */
  qualifyingDays: string[];
  exposures: number;
  target: number;
  complete: boolean;
  /** Worst symptom severity on qualifying days and the day after. */
  severityOnExposure: number | null;
  /** The same symptom on days since the challenge began that did not qualify. */
  severityOtherwise: number | null;
  /** Difference between the two. Positive means the food looked bad. */
  difference: number | null;
}

export function challengeProgress(
  observations: Observations,
  challenge: Challenge
): ChallengeProgress {
  const qualifyingDays: string[] = [];
  const exposureScores: number[] = [];
  const otherScores: number[] = [];

  for (const [day, entry] of observations) {
    if (day < challenge.startedOn) continue;
    if (challenge.endedOn && day > challenge.endedOn) continue;

    const hasTag = entry.tagIds.has(challenge.tagId);
    const hasExcluded = challenge.excludeTagId ? entry.tagIds.has(challenge.excludeTagId) : false;

    // Worst of the same day and the next, since reactions are often delayed.
    const sameDay = outcomeFor(observations, day, challenge.symptomTypeId, 0, challenge.tagId);
    const nextDay = outcomeFor(observations, day, challenge.symptomTypeId, 1, challenge.tagId);
    const score = Math.max(sameDay ?? 0, nextDay ?? 0);

    if (hasTag && !hasExcluded) {
      qualifyingDays.push(day);
      exposureScores.push(score);
    } else if (!hasTag) {
      // Days with neither the food nor a confusing partner are the comparison.
      otherScores.push(score);
    }
  }

  qualifyingDays.sort();

  const severityOnExposure = exposureScores.length > 0 ? mean(exposureScores) : null;
  const severityOtherwise = otherScores.length > 0 ? mean(otherScores) : null;

  return {
    qualifyingDays,
    exposures: qualifyingDays.length,
    target: challenge.targetExposures,
    complete: qualifyingDays.length >= challenge.targetExposures,
    severityOnExposure,
    severityOtherwise,
    difference:
      severityOnExposure !== null && severityOtherwise !== null
        ? severityOnExposure - severityOtherwise
        : null,
  };
}

/**
 * A provisional read on a finished challenge.
 *
 * Three exposures is far too few for a significance test, and pretending otherwise
 * would undo the care taken everywhere else. This is an eyeball verdict, labelled as
 * one — the user makes the call and the app records it.
 */
export function provisionalVerdict(
  progress: ChallengeProgress
): 'confirmed' | 'cleared' | 'inconclusive' {
  if (progress.difference === null || !progress.complete) return 'inconclusive';
  if (progress.difference >= 1) return 'confirmed';
  if (progress.difference <= 0.3) return 'cleared';
  return 'inconclusive';
}

export { buildObservations };
export type { Observations };
