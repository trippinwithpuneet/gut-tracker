'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DayFeed } from '@/components/day-feed';
import { MealComposer } from '@/components/meal-composer';
import { SymptomComposer } from '@/components/symptom-composer';
import { Button, Card, CardLabel, PageHeader, Spinner, Toast, cx } from '@/components/ui';
import { MIN_USEFUL_DAYS } from '@/lib/analysis';
import { addDays, daysBetween, friendlyDay, fromDayString, today } from '@/lib/dates';
import { useStore } from '@/lib/store/provider';
import type { Meal, SymptomLog } from '@/lib/types';

type Composer = { kind: 'meal'; meal?: Meal } | { kind: 'symptom'; log?: SymptomLog } | null;

const STREAK_DAYS = 7;

export default function LogPage() {
  const router = useRouter();
  const { ready, store, foodTags, symptomTypes, reloadLibrary, user } = useStore();

  const [day, setDay] = useState(today);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [recentMeals, setRecentMeals] = useState<Meal[]>([]);
  const [trackedTagIds, setTrackedTagIds] = useState<string[]>([]);
  const [trackedSymptomIds, setTrackedSymptomIds] = useState<string[]>([]);
  const [composer, setComposer] = useState<Composer>(null);
  const [observedDays, setObservedDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // Send first-time users through setup; without a tracked symptom there is
  // nothing to correlate against and the insights screen would be empty forever.
  useEffect(() => {
    if (!ready || !store) return;
    void store.getProfile().then((profile) => {
      if (!profile.onboardedAt) router.replace('/onboarding');
    });
  }, [ready, store, router]);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const [dayMeals, dayLogs, recent, tags, symptoms] = await Promise.all([
        store.listMeals({ from: day, to: day }),
        store.listSymptomLogs({ from: day, to: day }),
        // A month of history: enough to rank quick-pick tags by how often they're used.
        store.listMeals({ from: addDays(today(), -30) }),
        store.listTrackedTags(),
        store.listTrackedSymptoms(),
      ]);
      setMeals(dayMeals);
      setLogs(dayLogs);
      setRecentMeals(recent);
      setTrackedTagIds(tags.filter((t) => t.isActive).map((t) => t.tagId));
      setTrackedSymptomIds(symptoms.filter((s) => s.isActive).map((s) => s.symptomTypeId));
    } finally {
      setLoading(false);
    }
  }, [store, day]);

  useEffect(() => {
    // Reading the user's log from IndexedDB or Supabase on mount is a genuine
    // external-system sync. The lint rule can't see that every setState inside
    // happens after an await, so it is silenced here rather than restructured.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) void load();
  }, [ready, load]);

  // How many distinct days have anything logged — the same count the analysis engine
  // uses to decide whether results are worth reading. Counted over the whole log
  // rather than a recent window so the number shown matches the number applied.
  useEffect(() => {
    if (!ready || !store) return;
    let cancelled = false;
    void (async () => {
      const [allMeals, allLogs] = await Promise.all([
        store.listMeals(),
        store.listSymptomLogs(),
      ]);
      if (cancelled) return;
      const days = new Set<string>([
        ...allMeals.map((m) => m.occurredOn),
        ...allLogs.map((l) => l.occurredOn),
      ]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObservedDays(days.size);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, store, meals.length, logs.length]);

  /**
   * Quick-pick order: the tags you chose to track, then whatever you actually reach
   * for most, then the rest. Frequency beats alphabetical for a screen used nightly.
   */
  const quickTagIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const meal of recentMeals) {
      for (const id of meal.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const tracked = trackedTagIds.filter((id) => foodTags.some((t) => t.id === id));
    const used = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .filter((id) => !tracked.includes(id));
    return [...tracked, ...used].slice(0, 12);
  }, [recentMeals, trackedTagIds, foodTags]);

  const streak = useMemo(() => {
    const logged = new Set(recentMeals.map((m) => m.occurredOn));
    return Array.from({ length: STREAK_DAYS }, (_, i) => {
      const d = addDays(today(), -(STREAK_DAYS - 1 - i));
      return { day: d, logged: logged.has(d) };
    });
  }, [recentMeals]);

  const saveMeal = async (input: Omit<Meal, 'id'> & { id?: string }) => {
    if (!store) return;
    await store.saveMeal(input);
    setComposer(null);
    flash(input.id ? 'Meal updated' : 'Meal saved');
    await load();
  };

  const saveLog = async (input: Omit<SymptomLog, 'id'> & { id?: string }) => {
    if (!store) return;
    await store.saveSymptomLog(input);
    setComposer(null);
    flash(input.id ? 'Updated' : 'Logged');
    await load();
  };

  const createTag = async (name: string) => {
    if (!store) return null;
    const tag = await store.createFoodTag({ name });
    await reloadLibrary();
    return tag;
  };

  const deleteCurrent = async () => {
    if (!store || !composer) return;
    if (composer.kind === 'meal' && composer.meal) await store.deleteMeal(composer.meal.id);
    if (composer.kind === 'symptom' && composer.log) await store.deleteSymptomLog(composer.log.id);
    setComposer(null);
    flash('Deleted');
    await load();
  };

  if (!ready || !store) return <Spinner label="Starting up" />;

  const dayOffset = daysBetween(day, today());

  return (
    <main className="pb-6">
      <PageHeader
        title={friendlyDay(day)}
        subtitle={
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDay((d) => addDays(d, -1))}
              className="rounded px-1 hover:text-ink"
              aria-label="Previous day"
            >
              ←
            </button>
            <span>
              {fromDayString(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
            <button
              type="button"
              onClick={() => setDay((d) => addDays(d, 1))}
              disabled={dayOffset <= 0}
              className="rounded px-1 hover:text-ink disabled:opacity-30"
              aria-label="Next day"
            >
              →
            </button>
            {dayOffset !== 0 && (
              <button
                type="button"
                onClick={() => setDay(today())}
                className="text-lime hover:underline"
              >
                today
              </button>
            )}
          </span>
        }
        right={
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[11px] font-bold text-muted"
            title={user ? (user.email ?? 'Signed in') : 'Saved on this device only'}
          >
            {user?.email?.[0]?.toUpperCase() ?? '·'}
          </span>
        }
      />

      <div className="mb-5 flex gap-1" aria-hidden>
        {streak.map(({ day: d, logged }) => (
          <span
            key={d}
            className={cx('h-1.5 flex-1 rounded-full', logged ? 'bg-lime' : 'bg-surface-3')}
          />
        ))}
      </div>

      {observedDays !== null && observedDays < MIN_USEFUL_DAYS && (
        <Card className="mb-4">
          <CardLabel>Working towards your first verdict</CardLabel>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums">{observedDays}</span>
            <span className="text-[13px] text-faint">
              of {MIN_USEFUL_DAYS} days logged
            </span>
          </div>
          <div
            className="mt-2.5 flex gap-1"
            role="progressbar"
            aria-valuenow={observedDays}
            aria-valuemin={0}
            aria-valuemax={MIN_USEFUL_DAYS}
            aria-label="Days logged towards a first result"
          >
            {Array.from({ length: MIN_USEFUL_DAYS }, (_, i) => (
              <span
                key={i}
                className={cx(
                  'h-1.5 flex-1 rounded-full',
                  i < observedDays ? 'bg-lime' : 'bg-surface-3'
                )}
              />
            ))}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
            {observedDays === 0
              ? 'Insights stay empty until there is something to compare. A day counts once it has a meal or a symptom on it.'
              : `${MIN_USEFUL_DAYS - observedDays} more ${
                  MIN_USEFUL_DAYS - observedDays === 1 ? 'day' : 'days'
                } before results mean much. Days you skip are ignored, not counted as good ones.`}
          </p>
        </Card>
      )}

      {composer === null ? (
        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setComposer({ kind: 'meal' })}
            className="rounded-[var(--radius-card)] bg-lime px-4 pb-4 pt-4 text-left transition-transform active:scale-[0.98]"
          >
            <span className="block text-xl">🍽</span>
            <span className="mt-2 block text-[15px] font-bold text-lime-ink">Log a meal</span>
            <span className="mt-0.5 block text-[11.5px] font-medium text-lime-dim">
              two taps
            </span>
          </button>
          <button
            type="button"
            onClick={() => setComposer({ kind: 'symptom' })}
            className="rounded-[var(--radius-card)] border border-line bg-surface px-4 pb-4 pt-4 text-left transition-transform active:scale-[0.98]"
          >
            <span className="block text-xl">📉</span>
            <span className="mt-2 block text-[15px] font-bold">Log a symptom</span>
            <span className="mt-0.5 block text-[11.5px] font-medium text-faint">
              how are you now?
            </span>
          </button>
        </div>
      ) : (
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <CardLabel>
              {composer.kind === 'meal'
                ? composer.meal
                  ? 'Edit meal'
                  : 'New meal'
                : composer.log
                  ? 'Edit symptom'
                  : 'New symptom'}
            </CardLabel>
            {(composer.kind === 'meal' ? composer.meal : composer.log) && (
              <button
                type="button"
                onClick={deleteCurrent}
                className="text-[12px] font-semibold text-hot hover:underline"
              >
                Delete
              </button>
            )}
          </div>

          {composer.kind === 'meal' ? (
            <MealComposer
              day={day}
              tags={foodTags}
              quickTagIds={quickTagIds}
              existing={composer.meal}
              onSave={saveMeal}
              onCancel={() => setComposer(null)}
              onCreateTag={createTag}
            />
          ) : (
            <SymptomComposer
              day={day}
              symptomTypes={symptomTypes}
              trackedIds={trackedSymptomIds}
              existing={composer.log}
              onSave={saveLog}
              onCancel={() => setComposer(null)}
            />
          )}
        </Card>
      )}

      <Card>
        <CardLabel>
          {friendlyDay(day)} · {meals.length} meal{meals.length === 1 ? '' : 's'} ·{' '}
          {logs.length} symptom{logs.length === 1 ? '' : 's'}
        </CardLabel>
        {loading ? (
          <Spinner label="Loading day" />
        ) : (
          <DayFeed
            meals={meals}
            logs={logs}
            tags={foodTags}
            symptomTypes={symptomTypes}
            onEditMeal={(meal) => setComposer({ kind: 'meal', meal })}
            onEditLog={(log) => setComposer({ kind: 'symptom', log })}
          />
        )}
      </Card>

      {composer === null && meals.length === 0 && logs.length === 0 && dayOffset > 0 && (
        <div className="mt-3 text-center">
          <Button variant="ghost" onClick={() => setDay(today())}>
            Back to today
          </Button>
        </div>
      )}

      <Toast message={toast} />
    </main>
  );
}
