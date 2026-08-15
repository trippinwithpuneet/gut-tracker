'use client';

import { useMemo } from 'react';
import { clockTime } from '@/lib/dates';
import type { FoodTag, Meal, SymptomLog, SymptomType } from '@/lib/types';
import { EmptyState, SEVERITY_COLORS, cx } from './ui';

type Entry =
  | { kind: 'meal'; at: string | null; meal: Meal }
  | { kind: 'symptom'; at: string | null; log: SymptomLog };

/** Merged meal-and-symptom timeline for one day, earliest first. */
export function DayFeed({
  meals,
  logs,
  tags,
  symptomTypes,
  onEditMeal,
  onEditLog,
}: {
  meals: Meal[];
  logs: SymptomLog[];
  tags: FoodTag[];
  symptomTypes: SymptomType[];
  onEditMeal?: (meal: Meal) => void;
  onEditLog?: (log: SymptomLog) => void;
}) {
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const symptomById = useMemo(() => new Map(symptomTypes.map((s) => [s.id, s])), [symptomTypes]);

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [
      ...meals.map((meal) => ({ kind: 'meal' as const, at: meal.occurredAt, meal })),
      ...logs.map((log) => ({ kind: 'symptom' as const, at: log.occurredAt, log })),
    ];
    // Untimed entries sort last: they carry less information, so they read as a footnote.
    return all.sort((a, b) => {
      if (a.at && b.at) return a.at.localeCompare(b.at);
      if (a.at) return -1;
      if (b.at) return 1;
      return 0;
    });
  }, [meals, logs]);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing logged yet"
        body="Add a meal or a symptom above. Even a half-filled day is useful."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {entries.map((entry) => {
        const time = clockTime(entry.at);

        if (entry.kind === 'meal') {
          const { meal } = entry;
          const names = meal.tagIds
            .map((id) => tagById.get(id)?.name)
            .filter(Boolean) as string[];
          return (
            <li key={meal.id}>
              <button
                type="button"
                onClick={() => onEditMeal?.(meal)}
                className="flex w-full items-start gap-3 py-3 text-left"
              >
                <span className="w-11 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-faint">
                  {time ?? '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tracking-[-0.01em]">
                    {meal.description || 'Meal'}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-faint">
                    {meal.isOutside && <span className="text-warm">ate out · </span>}
                    {names.length > 0 ? names.join(' · ') : 'no tags'}
                  </span>
                </span>
              </button>
            </li>
          );
        }

        const { log } = entry;
        const symptom = symptomById.get(log.symptomTypeId);
        const binary = symptom?.scale === 'binary';
        return (
          <li key={log.id}>
            <button
              type="button"
              onClick={() => onEditLog?.(log)}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <span className="w-11 shrink-0 text-[11px] font-semibold tabular-nums text-faint">
                {time ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-[-0.01em]">
                  {symptom?.name ?? 'Symptom'}
                </span>
                {log.notes ? (
                  <span className="mt-0.5 block truncate text-[11.5px] italic text-faint">
                    {log.notes}
                  </span>
                ) : null}
              </span>
              <span
                className={cx(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                  binary && 'border border-hot/40'
                )}
                style={
                  binary
                    ? { color: 'var(--color-hot)' }
                    : {
                        color: SEVERITY_COLORS[log.severity],
                        background: `color-mix(in srgb, ${SEVERITY_COLORS[log.severity]} 16%, transparent)`,
                      }
                }
              >
                {binary ? 'yes' : `${log.severity}/5`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
