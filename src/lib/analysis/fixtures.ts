/**
 * Synthetic log generator for tests.
 *
 * The point is to plant a known answer and check the engine recovers it — and, just
 * as importantly, that it does NOT find answers in data that has none.
 *
 * Symptom logs are only emitted on days with a non-zero score, which is how real
 * people log. That means the tests also exercise the rule that a logged day with no
 * symptom entry is a genuine zero, rather than missing data.
 */
import { addDays } from '../dates';
import type { Meal, SymptomLog } from '../types';
import { mulberry32 } from './stats';

export interface GeneratorOptions {
  days: number;
  tagIds: string[];
  /** Probability a tag appears on any given day. Defaults to 0.4 for every tag. */
  presence?: Record<string, number>;
  symptomTypeId: string;
  /** Severity floor before any effect or noise. */
  baseline?: number;
  /** Uniform noise amplitude added to every day. */
  noise?: number;
  /** Severity added on the same day the tag appears. */
  sameDayEffects?: Record<string, number>;
  /** Severity added on the day AFTER the tag appears. */
  nextDayEffects?: Record<string, number>;
  /** Pairs [a, b] where b appears whenever a does — manufactured entanglement. */
  coOccur?: Array<[string, string]>;
  /** Days to skip entirely: no meal, no symptom, nothing logged. */
  skipDays?: number[];
  startDay?: string;
  seed?: number;
}

export interface GeneratedLog {
  meals: Meal[];
  symptomLogs: SymptomLog[];
  days: string[];
}

export function generateLog(options: GeneratorOptions): GeneratedLog {
  const {
    days,
    tagIds,
    presence = {},
    symptomTypeId,
    baseline = 1,
    noise = 0.6,
    sameDayEffects = {},
    nextDayEffects = {},
    coOccur = [],
    skipDays = [],
    startDay = '2026-01-01',
    seed = 42,
  } = options;

  const random = mulberry32(seed);
  const skip = new Set(skipDays);

  // Decide tag presence for every day first, so next-day effects can look back.
  const presenceByDay: Array<Set<string>> = [];
  for (let i = 0; i < days; i++) {
    const present = new Set<string>();
    for (const tagId of tagIds) {
      if (random() < (presence[tagId] ?? 0.4)) present.add(tagId);
    }
    for (const [a, b] of coOccur) {
      if (present.has(a)) present.add(b);
    }
    presenceByDay.push(present);
  }

  const meals: Meal[] = [];
  const symptomLogs: SymptomLog[] = [];
  const observed: string[] = [];

  for (let i = 0; i < days; i++) {
    if (skip.has(i)) continue;

    const day = addDays(startDay, i);
    observed.push(day);
    const present = presenceByDay[i];

    meals.push({
      id: `meal-${i}`,
      occurredOn: day,
      occurredAt: null,
      slot: null,
      description: `day ${i}`,
      isOutside: false,
      notes: null,
      tagIds: [...present],
    });

    let severity = baseline + (random() * 2 - 1) * noise;
    for (const tagId of present) severity += sameDayEffects[tagId] ?? 0;
    if (i > 0) {
      for (const tagId of presenceByDay[i - 1]) severity += nextDayEffects[tagId] ?? 0;
    }

    const score = Math.max(0, Math.min(5, Math.round(severity)));
    // Real logs only contain entries for symptoms that actually happened.
    if (score > 0) {
      symptomLogs.push({
        id: `log-${i}`,
        symptomTypeId,
        occurredOn: day,
        occurredAt: null,
        severity: score,
        notes: null,
      });
    }
  }

  return { meals, symptomLogs, days: observed };
}
