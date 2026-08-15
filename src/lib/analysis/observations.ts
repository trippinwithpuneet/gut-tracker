/**
 * Turns raw meals and symptom logs into the units the tests run on.
 *
 * The unit is a **day**, not a meal, and that is a deliberate statistical choice.
 * Three meals on one day share a single evening of symptoms; treating each as an
 * independent observation is pseudo-replication, and it inflates significance until
 * everything looks like a trigger. One day, one observation.
 *
 * Timestamps are still used where they carry real information: a symptom logged at
 * 11am cannot have been caused by dinner at 8pm, so same-day outcomes are restricted
 * to logs that came after the meal whenever both have a time.
 *
 * The other load-bearing rule is what counts as a zero. A day the user did not open
 * the app is missing data, not a symptom-free day. Only days with at least one entry
 * are observed; on those, a symptom with no log recorded is a genuine zero.
 */
import { addDays } from '../dates';
import type { Meal, SymptomLog } from '../types';
import type { Lag } from './types';

export interface DayObservation {
  day: string;
  /** Every tag appearing in any meal that day. */
  tagIds: Set<string>;
  /** Earliest meal time per tag, when known. Used to order same-day symptoms. */
  firstMealAtByTag: Map<string, string>;
  logs: SymptomLog[];
  mealCount: number;
}

export type Observations = Map<string, DayObservation>;

export function buildObservations(meals: Meal[], symptomLogs: SymptomLog[]): Observations {
  const days: Observations = new Map();

  const ensure = (day: string): DayObservation => {
    let entry = days.get(day);
    if (!entry) {
      entry = { day, tagIds: new Set(), firstMealAtByTag: new Map(), logs: [], mealCount: 0 };
      days.set(day, entry);
    }
    return entry;
  };

  for (const meal of meals) {
    const entry = ensure(meal.occurredOn);
    entry.mealCount++;
    for (const tagId of meal.tagIds) {
      entry.tagIds.add(tagId);
      if (meal.occurredAt) {
        const current = entry.firstMealAtByTag.get(tagId);
        if (!current || meal.occurredAt < current) {
          entry.firstMealAtByTag.set(tagId, meal.occurredAt);
        }
      }
    }
  }

  for (const log of symptomLogs) {
    ensure(log.occurredOn).logs.push(log);
  }

  return days;
}

/** Observed days in chronological order. */
export function observedDays(observations: Observations): string[] {
  return [...observations.keys()].sort();
}

/**
 * Worst severity of `symptomTypeId` attributable to `tagId` on `day` at the given lag.
 *
 * Returns null when the outcome day was never observed — that is missing data and
 * must be dropped rather than counted as zero.
 */
export function outcomeFor(
  observations: Observations,
  day: string,
  symptomTypeId: string,
  lag: Lag,
  tagId: string | null
): number | null {
  const outcomeDay = lag === 0 ? day : addDays(day, lag);
  const target = observations.get(outcomeDay);
  if (!target) return null;

  // Only same-day outcomes can be ordered against the meal; a next-day symptom
  // follows every meal from the day before by definition.
  const after =
    lag === 0 && tagId ? observations.get(day)?.firstMealAtByTag.get(tagId) : undefined;

  let worst = 0;
  for (const log of target.logs) {
    if (log.symptomTypeId !== symptomTypeId) continue;
    // An untimed symptom log still counts: we cannot rule it out, and dropping it
    // would quietly discard the data of anyone who never sets a time.
    if (after && log.occurredAt && log.occurredAt < after) continue;
    if (log.severity > worst) worst = log.severity;
  }
  return worst;
}

/** Days on which any meal carried this tag. */
export function exposedDays(observations: Observations, tagId: string): Set<string> {
  const days = new Set<string>();
  for (const [day, entry] of observations) {
    if (entry.tagIds.has(tagId)) days.add(day);
  }
  return days;
}

/** Share of calendar days between first and last entry that were actually logged. */
export function coverage(observations: Observations): number {
  const days = observedDays(observations);
  if (days.length < 2) return days.length;
  const first = new Date(days[0]).getTime();
  const last = new Date(days[days.length - 1]).getTime();
  const span = Math.round((last - first) / 86_400_000) + 1;
  return span > 0 ? days.length / span : 1;
}
