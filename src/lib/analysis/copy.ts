/**
 * Turning statistics into sentences.
 *
 * Kept out of the components so the wording is testable and consistent, and so the
 * one rule that matters is enforced in a single place: this app reports associations
 * in a personal log. It never says a food causes anything, never diagnoses, and never
 * tells anyone what to eat. "Tracks with", "on days you ate", "looks clear" — not
 * "you are intolerant to".
 */
import type { Confidence, DataQuality, Finding, Lag, SuggestedChallenge } from './types';

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  strong: 'Strong signal',
  possible: 'Possible',
  none: 'No signal',
  insufficient: 'Collecting',
};

export const CONFIDENCE_SHORT: Record<Confidence, string> = {
  strong: 'Strong',
  possible: 'Possible',
  none: 'No signal',
  insufficient: 'Collecting',
};

export function lagLabel(lag: Lag): string {
  return lag === 0 ? 'same day' : 'next day';
}

/** One-line headline for the strongest finding, or null when there isn't one. */
export function headline(finding: Finding | undefined, tagName: string): string | null {
  if (!finding || finding.direction !== 'worse') return null;
  if (finding.confidence === 'strong') return `It looks like ${tagName.toLowerCase()}.`;
  if (finding.confidence === 'possible') return `${tagName} is the current suspect.`;
  return null;
}

/** The evidence behind a finding, in plain numbers. */
export function explain(finding: Finding, tagName: string, symptomName: string): string {
  const symptom = symptomName.toLowerCase();
  const food = tagName.toLowerCase();
  const when = finding.lag === 0 ? 'on days you ate' : 'the day after you ate';
  const withValue = finding.meanExposed.toFixed(1);
  const withoutValue = finding.meanUnexposed.toFixed(1);

  return `Your ${symptom} averages ${withValue} out of 5 ${when} ${food}, against ${withoutValue} when you didn't. That's across ${finding.nExposed} days with and ${finding.nUnexposed} without.`;
}

/** How much to trust it, phrased as the question a user is actually asking. */
export function confidenceExplainer(finding: Finding): string {
  switch (finding.confidence) {
    case 'strong':
      return `A gap this size came up by chance in fewer than ${formatChance(finding.pValue)} of reshuffles of your own data, and it survives the correction for testing many foods at once.`;
    case 'possible':
      return `The gap is real enough to notice, but not yet large enough to rule out coincidence once every other food you track is accounted for. More days will settle it.`;
    case 'none':
      return `Nothing here yet. The difference is within what your normal day-to-day variation produces on its own.`;
    case 'insufficient':
      return finding.daysNeeded > 0
        ? `Not enough to compare yet — about ${finding.daysNeeded} more day${finding.daysNeeded === 1 ? '' : 's'} eating this would make it testable.`
        : `Not enough days with and without this to compare.`;
  }
}

function formatChance(pValue: number): string {
  if (pValue <= 0.001) return '1 in 1,000';
  if (pValue <= 0.01) return '1 in 100';
  if (pValue <= 0.05) return '1 in 20';
  return `${Math.round(pValue * 100)}%`;
}

export function entanglementSentence(tagName: string, otherName: string, overlap: number): string {
  const percent = Math.round(overlap * 100);
  return `${otherName} was on the plate for ${percent}% of your ${tagName.toLowerCase()} days, so your log can't yet tell which of the two matters.`;
}

export function challengeTitle(
  challenge: SuggestedChallenge,
  tagName: string,
  excludeName: string | null
): string {
  switch (challenge.reason) {
    case 'entangled':
      return `${tagName} without ${excludeName}, ×${challenge.targetExposures}`;
    case 'confirm':
      return `Put ${tagName.toLowerCase()} to the test`;
    case 'more-data':
      return `Eat ${tagName.toLowerCase()} a few more times`;
    default:
      return tagName;
  }
}

export function challengeBody(
  challenge: SuggestedChallenge,
  tagName: string,
  excludeName: string | null
): string {
  switch (challenge.reason) {
    case 'entangled':
      return `These two almost always turn up together, and no amount of extra logging will separate them on its own. ${challenge.targetExposures} meals with ${tagName.toLowerCase()} but no ${excludeName?.toLowerCase()} will.`;
    case 'confirm':
      return `Cut it out for a few days, then bring it back deliberately. A reaction you can predict in advance is worth far more than one spotted in hindsight.`;
    case 'more-data':
      return `You haven't eaten this on enough separate days for a fair comparison. About ${challenge.targetExposures} more would do it.`;
    default:
      return '';
  }
}

/** Status line for the top of the insights screen. */
export function qualitySummary(quality: DataQuality): string {
  if (quality.observedDays === 0) return 'Nothing logged yet';
  const days = `${quality.observedDays} day${quality.observedDays === 1 ? '' : 's'}`;
  const meals = `${quality.totalMeals} meal${quality.totalMeals === 1 ? '' : 's'}`;
  return `${days} · ${meals}`;
}

/** Bar width as a percentage, with ±2.5 points on the 0–5 scale as full scale. */
export function effectWidth(effect: number): number {
  return Math.min(100, (Math.abs(effect) / 2.5) * 100);
}
