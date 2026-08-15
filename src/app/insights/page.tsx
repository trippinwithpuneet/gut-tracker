'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FindingRow } from '@/components/finding-row';
import { Card, CardLabel, Chip, EmptyState, Spinner, Toast } from '@/components/ui';
import { runAnalysis } from '@/lib/analysis';
import {
  challengeBody,
  challengeTitle,
  entanglementSentence,
  explain,
  headline,
  qualitySummary,
} from '@/lib/analysis/copy';
import type { AnalysisReport, SymptomReport } from '@/lib/analysis/types';
import { today } from '@/lib/dates';
import { useStore } from '@/lib/store/provider';
import type { Challenge, Meal, SymptomLog } from '@/lib/types';

export default function InsightsPage() {
  const { ready, store, foodTags, symptomTypes } = useStore();

  const [meals, setMeals] = useState<Meal[]>([]);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [trackedTagIds, setTrackedTagIds] = useState<string[]>([]);
  const [trackedSymptomIds, setTrackedSymptomIds] = useState<string[]>([]);
  const [activeSymptom, setActiveSymptom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const tagName = useCallback(
    (id: string) => foodTags.find((t) => t.id === id)?.name ?? 'Unknown',
    [foodTags]
  );
  const symptomName = useCallback(
    (id: string) => symptomTypes.find((s) => s.id === id)?.name ?? 'Symptom',
    [symptomTypes]
  );

  useEffect(() => {
    if (!ready || !store) return;
    let cancelled = false;

    void (async () => {
      const [allMeals, allLogs, tags, symptoms] = await Promise.all([
        store.listMeals(),
        store.listSymptomLogs(),
        store.listTrackedTags(),
        store.listTrackedSymptoms(),
      ]);
      if (cancelled) return;
      setMeals(allMeals);
      setLogs(allLogs);
      setTrackedTagIds(tags.filter((t) => t.isActive).map((t) => t.tagId));
      setTrackedSymptomIds(symptoms.filter((s) => s.isActive).map((s) => s.symptomTypeId));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, store]);

  /**
   * The whole analysis runs here, in the browser, on every data change.
   *
   * A year of logging is a few thousand rows and the permutation tests take
   * milliseconds, so there is no server round-trip and no cache to invalidate.
   */
  const report: AnalysisReport | null = useMemo(() => {
    if (loading || trackedSymptomIds.length === 0) return null;
    return runAnalysis({
      meals,
      symptomLogs: logs,
      tagIds: trackedTagIds,
      symptomTypeIds: trackedSymptomIds,
    });
  }, [loading, meals, logs, trackedTagIds, trackedSymptomIds]);

  const current: SymptomReport | null = useMemo(() => {
    if (!report) return null;
    return (
      report.symptoms.find((s) => s.symptomTypeId === activeSymptom) ?? report.symptoms[0] ?? null
    );
  }, [report, activeSymptom]);

  const startChallenge = async () => {
    if (!store || !current?.suggestedChallenge) return;
    const suggestion = current.suggestedChallenge;
    const challenge: Omit<Challenge, 'id'> = {
      tagId: suggestion.tagId,
      excludeTagId: suggestion.excludeTagId,
      symptomTypeId: suggestion.symptomTypeId,
      status: 'active',
      targetExposures: suggestion.targetExposures,
      startedOn: today(),
      endedOn: null,
      verdict: null,
      notes: null,
    };
    await store.saveChallenge(challenge);
    setToast('Test started — find it in the Tests tab');
    setTimeout(() => setToast(null), 2600);
  };

  if (!ready || !store || loading) return <Spinner label="Crunching your log" />;

  if (!report || !current) {
    return (
      <main className="pb-6">
        <h1 className="mb-5 text-[26px] font-bold tracking-[-0.03em]">Insights</h1>
        <EmptyState
          title="Nothing to analyse yet"
          body="Pick at least one symptom to track, then log a few days of meals."
        />
      </main>
    );
  }

  const top = current.findings.find(
    (f) => f.direction === 'worse' && (f.confidence === 'strong' || f.confidence === 'possible')
  );
  const heroLine = top ? headline(top, tagName(top.tagId)) : null;
  const relevantEntanglements = current.entanglements.filter((e) =>
    current.findings.some(
      (f) => f.tagId === e.tagId && f.confidence !== 'insufficient' && f.direction === 'worse'
    )
  );

  return (
    <main className="pb-6">
      <header className="mb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.03em]">Insights</h1>
        <div className="mt-0.5 text-xs font-medium text-faint">
          {qualitySummary(report.quality)}
        </div>
      </header>

      {trackedSymptomIds.length > 1 && (
        <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-0.5">
          {report.symptoms.map((symptom) => (
            <Chip
              key={symptom.symptomTypeId}
              label={symptomName(symptom.symptomTypeId)}
              selected={symptom.symptomTypeId === current.symptomTypeId}
              onToggle={() => setActiveSymptom(symptom.symptomTypeId)}
            />
          ))}
        </div>
      )}

      {report.quality.notes.length > 0 && (
        <Card className="mb-4 border-warm/25 bg-warm/8">
          <CardLabel>Before you read too much into this</CardLabel>
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
            {report.quality.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      )}

      {heroLine && top ? (
        <section className="relative mb-4 overflow-hidden rounded-[20px] border border-[#2c3a2f] bg-gradient-to-br from-[#1e2a21] to-[#182119] p-5">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(159,232,112,.16), transparent 70%)',
            }}
          />
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-lime">
            {top.confidence === 'strong' ? 'Strongest signal' : 'Leading suspect'}
          </div>
          <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.03em]">
            {heroLine}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {explain(top, tagName(top.tagId), symptomName(current.symptomTypeId))}
          </p>
          <div className="mt-4 flex gap-6 border-t border-[#2c3a2f] pt-3.5">
            {[
              { label: 'Severity', value: `+${top.effect.toFixed(1)}`, hot: true },
              { label: 'Days with', value: String(top.nExposed) },
              { label: 'Days without', value: String(top.nUnexposed) },
            ].map(({ label, value, hot }) => (
              <div key={label}>
                <div
                  className="text-xl font-bold tabular-nums tracking-[-0.02em]"
                  style={hot ? { color: 'var(--color-hot)' } : undefined}
                >
                  {value}
                </div>
                <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <Card className="mb-4">
          <CardLabel>
            {current.daysWithSymptom === 0 ? 'Nothing logged for this yet' : 'No clear signal yet'}
          </CardLabel>
          <p className="text-[13px] leading-relaxed text-muted">
            {current.daysWithSymptom === 0
              ? `You're tracking ${symptomName(current.symptomTypeId).toLowerCase()} but haven't logged it on any day yet. Log it when it happens and this fills in — or drop it from your tracked list in the You tab if it isn't a problem for you.`
              : current.observedDays < 14
                ? `${current.observedDays} day${current.observedDays === 1 ? '' : 's'} in. Most foods need two to three weeks of logging before a real pattern can be told apart from an ordinary bad week.`
                : 'Nothing you track stands out above your normal variation. That is a genuine result — it may mean the trigger is something you are not tagging yet, or that timing, portion size or stress matter more than any single ingredient.'}
          </p>
        </Card>
      )}

      {/* A wall of "+0.0 · no signal" rows for a symptom that was never logged reads
          as a finding. It isn't one, so the list is withheld until there is data. */}
      {current.daysWithSymptom > 0 && (
        <Card className="mb-4">
          <CardLabel>Every food, ranked</CardLabel>
          {current.findings.length === 0 ? (
            <div className="py-2 text-[13px] text-faint">
              No foods tracked yet. Add some in the You tab.
            </div>
          ) : (
            <ul>
              {current.findings.map((finding) => (
                <FindingRow
                  key={finding.tagId}
                  finding={finding}
                  tagName={tagName(finding.tagId)}
                  symptomName={symptomName(current.symptomTypeId)}
                  entangledNames={finding.entangledWith.map(tagName)}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {current.safeFindings.length > 0 && (
        <Card className="mb-4">
          <CardLabel>Looks clear</CardLabel>
          <p className="mb-2 text-[12.5px] leading-relaxed text-faint">
            These track with <em className="not-italic text-cool">better</em> days than average.
          </p>
          <ul>
            {current.safeFindings.map((finding) => (
              <FindingRow
                key={finding.tagId}
                finding={finding}
                tagName={tagName(finding.tagId)}
                symptomName={symptomName(current.symptomTypeId)}
                entangledNames={[]}
              />
            ))}
          </ul>
        </Card>
      )}

      {relevantEntanglements.length > 0 && (
        <Card className="mb-4 border-warm/25 bg-warm/8">
          <CardLabel>Can&apos;t be told apart yet</CardLabel>
          <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted">
            {relevantEntanglements.slice(0, 3).map((tangle) => (
              <li key={`${tangle.tagId}-${tangle.otherTagId}`}>
                {entanglementSentence(
                  tagName(tangle.tagId),
                  tagName(tangle.otherTagId),
                  tangle.overlap
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {current.suggestedChallenge && (
        <div className="rounded-[var(--radius-card)] bg-lime p-4 text-lime-ink">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] opacity-60">
            Next test
          </div>
          <h3 className="mt-1.5 text-[17px] font-bold tracking-[-0.02em]">
            {challengeTitle(
              current.suggestedChallenge,
              tagName(current.suggestedChallenge.tagId),
              current.suggestedChallenge.excludeTagId
                ? tagName(current.suggestedChallenge.excludeTagId)
                : null
            )}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed opacity-75">
            {challengeBody(
              current.suggestedChallenge,
              tagName(current.suggestedChallenge.tagId),
              current.suggestedChallenge.excludeTagId
                ? tagName(current.suggestedChallenge.excludeTagId)
                : null
            )}
          </p>
          {/* Plain button rather than <Button>: this one sits on the lime card and
              needs the inverse palette, which would collide with the variant's own
              background and text classes. */}
          <button
            type="button"
            onClick={startChallenge}
            className="mt-3 w-full rounded-[var(--radius-field)] bg-lime-ink px-4 py-3 text-[15px] font-bold tracking-[-0.01em] text-lime transition-colors hover:bg-[#0a2412]"
          >
            Start this test
          </button>
        </div>
      )}

      <p className="mt-5 px-2 text-center text-[11px] leading-relaxed text-faint">
        These are associations in your own log, not causes and not a diagnosis.
        <br />
        {current.hypothesesTested > 0 &&
          `${current.hypothesesTested} comparisons were run and corrected for. `}
        Persistent or worsening symptoms deserve a doctor.
      </p>

      <Toast message={toast} />
    </main>
  );
}
