/**
 * Entanglement detection.
 *
 * The hardest honest problem in a food diary: onion and garlic go in the same pan.
 * If they appear together on 80% of days, no amount of statistics on observational
 * data can separate them — the data simply does not contain the answer.
 *
 * Rather than silently reporting both as culprits, the app names the entanglement
 * and proposes the one meal that would resolve it. Saying "we can't tell these apart
 * yet" is more useful, and more honest, than a confident wrong answer.
 */
import type { Observations } from './observations';
import { exposedDays } from './observations';
import type { Entanglement } from './types';

/**
 * For each tag, the other tags it cannot currently be told apart from.
 *
 * Deliberately asymmetric: rice appearing on 90% of dal days matters when judging
 * dal, while dal on 30% of rice days does not muddy rice much. Each direction is
 * reported separately for that reason.
 *
 * Two conditions must both hold, and the second is the one that does the real work:
 *
 *   1. The other tag appears on at least `threshold` of this tag's days.
 *   2. There are fewer than `minSeparatingDays` days with this tag and NOT the other.
 *
 * Condition 1 alone is not enough, because a tag that is simply common looks
 * entangled with everything — someone who eats rice daily would be told rice is
 * inseparable from every food they own. Condition 2 asks the question that actually
 * matters: is there enough evidence in this log to estimate one without the other?
 * If separating days exist, the maths can do its job and no warning is warranted.
 */
export function findEntanglements(
  observations: Observations,
  tagIds: string[],
  threshold: number,
  minSeparatingDays = 3
): Entanglement[] {
  const daysByTag = new Map(tagIds.map((id) => [id, exposedDays(observations, id)]));
  const results: Entanglement[] = [];

  for (const tagId of tagIds) {
    const days = daysByTag.get(tagId);
    if (!days || days.size === 0) continue;

    // A tag seen once or twice is trivially "inseparable" from everything eaten
    // alongside it. Warning about that on day one is noise, not insight — wait
    // until the tag has enough days for the claim to mean something.
    if (days.size < minSeparatingDays) continue;

    for (const otherTagId of tagIds) {
      if (otherTagId === tagId) continue;
      const otherDays = daysByTag.get(otherTagId);
      if (!otherDays || otherDays.size === 0) continue;

      let shared = 0;
      for (const day of days) if (otherDays.has(day)) shared++;

      const overlap = shared / days.size;
      const separating = days.size - shared;
      if (overlap >= threshold && separating < minSeparatingDays) {
        results.push({ tagId, otherTagId, overlap });
      }
    }
  }

  return results.sort((a, b) => b.overlap - a.overlap);
}

/** How many days had `tagId` but not `otherTagId` — the evidence that separates them. */
export function separatingDays(
  observations: Observations,
  tagId: string,
  otherTagId: string
): number {
  const days = exposedDays(observations, tagId);
  const otherDays = exposedDays(observations, otherTagId);
  let count = 0;
  for (const day of days) if (!otherDays.has(day)) count++;
  return count;
}
