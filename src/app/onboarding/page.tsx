'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Chip, Spinner, cx } from '@/components/ui';
import { DEFAULT_TAG_SLUGS, SYMPTOM_CATEGORY_LABELS, TAG_CATEGORY_LABELS } from '@/lib/library';
import { useStore } from '@/lib/store/provider';
import type { SymptomCategory, TagCategory } from '@/lib/types';

/**
 * First-run setup — the step that makes this app generic rather than one person's tool.
 *
 * Two choices only: which symptoms matter to you, and which food groups to watch.
 * Everything downstream (quick-pick chips, the insights tabs, what gets tested for
 * significance) reads from these two sets.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { ready, store, symptomTypes, foodTags, user, authAvailable, signInWithGoogle } = useStore();

  const [step, setStep] = useState(0);
  const [symptomIds, setSymptomIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Preselect the groups implicated most often, so a user can accept the defaults
  // and start logging in under a minute.
  //
  // Derived, not copied into state by an effect: the library arrives asynchronously,
  // and an effect that seeds state once it lands would either race the first render
  // or quietly re-apply the defaults over a choice the user already made. `null`
  // means "untouched, use the defaults"; any Set means the user has taken over.
  const [chosenTagIds, setChosenTagIds] = useState<Set<string> | null>(null);

  const defaultTagIds = useMemo(
    () => new Set(foodTags.filter((t) => DEFAULT_TAG_SLUGS.includes(t.slug)).map((t) => t.id)),
    [foodTags]
  );

  const tagIds = chosenTagIds ?? defaultTagIds;
  const setTagIds = setChosenTagIds;

  const symptomGroups = useMemo(() => {
    const groups = new Map<SymptomCategory, typeof symptomTypes>();
    for (const symptom of symptomTypes) {
      const list = groups.get(symptom.category) ?? [];
      list.push(symptom);
      groups.set(symptom.category, list);
    }
    return [...groups.entries()];
  }, [symptomTypes]);

  const tagGroups = useMemo(() => {
    const groups = new Map<TagCategory, typeof foodTags>();
    for (const tag of foodTags) {
      const list = groups.get(tag.category) ?? [];
      list.push(tag);
      groups.set(tag.category, list);
    }
    return [...groups.entries()];
  }, [foodTags]);

  const toggle = (set: Set<string>, id: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const finish = async () => {
    if (!store || saving) return;
    setSaving(true);
    try {
      await store.setTrackedSymptoms([...symptomIds]);
      await store.setTrackedTags([...tagIds]);
      await store.updateProfile({ onboardedAt: new Date().toISOString() });
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  if (!ready || !store) return <Spinner label="Starting up" />;

  return (
    <main className="pb-10">
      <div className="mb-6 flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cx('h-1 flex-1 rounded-full', i <= step ? 'bg-lime' : 'bg-surface-3')}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Find out what your gut actually reacts to.
            </h1>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              Log what you eat and how you feel. After a few weeks this app compares the
              days you ate something against the days you didn&apos;t, and tells you which
              foods genuinely track with your symptoms — and, just as usefully, which ones
              are in the clear.
            </p>
          </div>

          <Card className="space-y-3 text-[13px] leading-relaxed text-muted">
            <p>
              <b className="font-semibold text-ink">It won&apos;t guess.</b> Nothing gets called
              a trigger until there is enough data to rule out coincidence, and the app
              tells you how confident it is every time.
            </p>
            <p>
              <b className="font-semibold text-ink">Your data stays yours.</b> Everything
              works without an account, stored on this device. Sign in only if you want it
              on more than one phone. Export it any time.
            </p>
          </Card>

          {authAvailable && !user && (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <div className="text-[13px] text-muted">
                Want it synced across devices from the start?
              </div>
              <Button variant="secondary" full className="mt-3" onClick={signInWithGoogle}>
                Continue with Google
              </Button>
              <div className="mt-2 text-center text-[11.5px] text-faint">
                Optional — you can do this later from the You tab.
              </div>
            </div>
          )}

          <Button full onClick={() => setStep(1)}>
            Get started
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">
              What bothers you?
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Pick the symptoms you want to track. Each one gets analysed separately —
              the food behind your bloating may not be the food behind your constipation.
            </p>
          </div>

          <div className="space-y-4">
            {symptomGroups.map(([category, list]) => (
              <div key={category}>
                <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-faint">
                  {SYMPTOM_CATEGORY_LABELS[category]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((symptom) => (
                    <Chip
                      key={symptom.id}
                      label={symptom.name}
                      title={symptom.description ?? undefined}
                      selected={symptomIds.has(symptom.id)}
                      onToggle={() => toggle(symptomIds, symptom.id, setSymptomIds)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">
              Back
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={symptomIds.size === 0}
              className="flex-[2]"
            >
              {symptomIds.size === 0 ? 'Pick at least one' : `Next · ${symptomIds.size} chosen`}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">
              What should we watch?
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              These become your quick-tap tags when logging a meal. We&apos;ve preselected
              the usual suspects — add or remove anything, and you can change this later.
            </p>
          </div>

          <div className="space-y-4">
            {tagGroups.map(([category, list]) => (
              <div key={category}>
                <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-faint">
                  {TAG_CATEGORY_LABELS[category]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((tag) => (
                    <Chip
                      key={tag.id}
                      label={tag.name}
                      title={tag.description ?? undefined}
                      selected={tagIds.has(tag.id)}
                      onToggle={() => toggle(tagIds, tag.id, setTagIds)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Card className="text-[12.5px] leading-relaxed text-faint">
            More tags is not better. Every extra group you track is another thing the maths
            has to rule out, which means more days of logging before anything is
            conclusive. Ten to fifteen is a good place to start.
          </Card>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
              Back
            </Button>
            <Button onClick={finish} disabled={tagIds.size === 0 || saving} className="flex-[2]">
              {saving ? 'Setting up…' : 'Start logging'}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
