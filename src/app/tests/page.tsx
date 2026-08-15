'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardLabel, EmptyState, Spinner, Toast, cx } from '@/components/ui';
import { buildObservations } from '@/lib/analysis/observations';
import {
  challengeProgress,
  provisionalVerdict,
  type ChallengeProgress,
} from '@/lib/analysis/challenge-progress';
import { friendlyDay, today } from '@/lib/dates';
import { useStore } from '@/lib/store/provider';
import type { Challenge, ChallengeVerdict, Meal, SymptomLog } from '@/lib/types';

const VERDICT_COPY: Record<ChallengeVerdict, { label: string; className: string }> = {
  confirmed: { label: 'Reacted', className: 'bg-hot/16 text-hot' },
  cleared: { label: 'No reaction', className: 'bg-cool/14 text-cool' },
  inconclusive: { label: 'Inconclusive', className: 'bg-surface-3 text-faint' },
};

export default function TestsPage() {
  const { ready, store, foodTags, symptomTypes } = useStore();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const tagName = useCallback(
    (id: string | null) => (id ? (foodTags.find((t) => t.id === id)?.name ?? 'Unknown') : null),
    [foodTags]
  );
  const symptomName = useCallback(
    (id: string) => symptomTypes.find((s) => s.id === id)?.name ?? 'Symptom',
    [symptomTypes]
  );

  const load = useCallback(async () => {
    if (!store) return;
    const [list, allMeals, allLogs] = await Promise.all([
      store.listChallenges(),
      store.listMeals(),
      store.listSymptomLogs(),
    ]);
    setChallenges(list);
    setMeals(allMeals);
    setLogs(allLogs);
    setLoading(false);
  }, [store]);

  useEffect(() => {
    // Reading the user's log from IndexedDB or Supabase on mount is a genuine
    // external-system sync. The lint rule can't see that every setState inside
    // happens after an await, so it is silenced here rather than restructured.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) void load();
  }, [ready, load]);

  const observations = useMemo(() => buildObservations(meals, logs), [meals, logs]);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  };

  const finish = async (challenge: Challenge, verdict: ChallengeVerdict) => {
    if (!store) return;
    await store.saveChallenge({
      ...challenge,
      status: 'completed',
      endedOn: today(),
      verdict,
    });
    flash('Result recorded');
    await load();
  };

  const abandon = async (challenge: Challenge) => {
    if (!store) return;
    await store.saveChallenge({ ...challenge, status: 'abandoned', endedOn: today() });
    await load();
  };

  const remove = async (challenge: Challenge) => {
    if (!store) return;
    await store.deleteChallenge(challenge.id);
    await load();
  };

  if (!ready || !store || loading) return <Spinner label="Loading tests" />;

  const active = challenges.filter((c) => c.status === 'active');
  const finished = challenges.filter((c) => c.status !== 'active');

  return (
    <main className="pb-6">
      <header className="mb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.03em]">Tests</h1>
        <div className="mt-0.5 text-xs font-medium text-faint">
          Deliberate experiments, where watching isn&apos;t enough
        </div>
      </header>

      {active.length === 0 && finished.length === 0 && (
        <EmptyState
          title="No tests running"
          body={
            <>
              When your log can&apos;t separate two foods, the Insights tab will suggest the
              one experiment that can. <Link className="text-lime underline" href="/insights">Have a look</Link>.
            </>
          }
        />
      )}

      {active.map((challenge) => {
        const progress = challengeProgress(observations, challenge);
        const suggestion = provisionalVerdict(progress);
        const food = tagName(challenge.tagId)!;
        const exclude = tagName(challenge.excludeTagId);

        return (
          <Card key={challenge.id} className="mb-4">
            <CardLabel>Running since {friendlyDay(challenge.startedOn)}</CardLabel>

            <h2 className="text-[17px] font-bold tracking-[-0.02em]">
              {food}
              {exclude ? ` without ${exclude}` : ''}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Watching <b className="font-semibold text-ink">{symptomName(challenge.symptomTypeId)}</b>.
              Log {challenge.targetExposures} separate days with {food.toLowerCase()}
              {exclude ? ` and no ${exclude.toLowerCase()}` : ''}.
            </p>

            <ProgressDots progress={progress} />

            {progress.difference !== null && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  {
                    label: 'On test days',
                    value: progress.severityOnExposure!.toFixed(1),
                  },
                  {
                    label: 'Other days',
                    value: progress.severityOtherwise!.toFixed(1),
                  },
                  {
                    label: 'Difference',
                    value: `${progress.difference >= 0 ? '+' : '−'}${Math.abs(progress.difference).toFixed(1)}`,
                    accent: progress.difference >= 1,
                  },
                ].map(({ label, value, accent }) => (
                  <div key={label} className="rounded-[var(--radius-field)] bg-surface-2 px-3 py-2.5">
                    <div
                      className="text-lg font-bold tabular-nums"
                      style={accent ? { color: 'var(--color-hot)' } : undefined}
                    >
                      {value}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-faint">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {progress.complete ? (
              <div className="mt-4">
                <p className="text-[12.5px] leading-relaxed text-muted">
                  {progress.difference === null
                    ? 'Enough test days logged, but there are no comparison days yet.'
                    : suggestion === 'confirmed'
                      ? `Your ${symptomName(challenge.symptomTypeId).toLowerCase()} was clearly worse on the test days. Three days is a small sample — but it points the same way as your log.`
                      : suggestion === 'cleared'
                        ? `No real difference on the test days. On this evidence, ${food.toLowerCase()} is not the driver.`
                        : 'The test days landed somewhere in the middle. Running a few more would help.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => finish(challenge, 'confirmed')}>
                    Reacted
                  </Button>
                  <Button variant="secondary" onClick={() => finish(challenge, 'cleared')}>
                    No reaction
                  </Button>
                  <Button variant="ghost" onClick={() => finish(challenge, 'inconclusive')}>
                    Not sure
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12px] text-faint">
                  {progress.target - progress.exposures} more qualifying day
                  {progress.target - progress.exposures === 1 ? '' : 's'} to go
                </span>
                <button
                  type="button"
                  onClick={() => abandon(challenge)}
                  className="text-[12px] font-semibold text-faint hover:text-hot"
                >
                  Stop
                </button>
              </div>
            )}
          </Card>
        );
      })}

      {finished.length > 0 && (
        <Card>
          <CardLabel>Finished</CardLabel>
          <ul className="divide-y divide-line">
            {finished.map((challenge) => {
              const food = tagName(challenge.tagId)!;
              const exclude = tagName(challenge.excludeTagId);
              const verdict = challenge.verdict ? VERDICT_COPY[challenge.verdict] : null;
              return (
                <li key={challenge.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {food}
                      {exclude ? ` without ${exclude}` : ''}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-faint">
                      {symptomName(challenge.symptomTypeId)} ·{' '}
                      {challenge.endedOn ? friendlyDay(challenge.endedOn) : 'stopped'}
                    </span>
                  </span>
                  {verdict ? (
                    <span
                      className={cx(
                        'shrink-0 rounded px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.07em]',
                        verdict.className
                      )}
                    >
                      {verdict.label}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-faint">stopped</span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(challenge)}
                    className="shrink-0 text-[11px] text-faint hover:text-hot"
                    aria-label="Delete test"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Toast message={toast} />
    </main>
  );
}

function ProgressDots({ progress }: { progress: ChallengeProgress }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        {Array.from({ length: progress.target }, (_, i) => (
          <span
            key={i}
            className={cx(
              'size-2.5 rounded-full',
              i < progress.exposures ? 'bg-lime' : 'bg-surface-3'
            )}
          />
        ))}
      </div>
      <span className="text-[12px] font-semibold tabular-nums text-faint">
        {progress.exposures} / {progress.target}
      </span>
    </div>
  );
}
