'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardLabel, Spinner, Toast, cx } from '@/components/ui';
import { importLegacyExport, isLegacyExport } from '@/lib/legacy-import';
import { useStore } from '@/lib/store/provider';
import type { Snapshot } from '@/lib/types';

export default function YouPage() {
  const router = useRouter();
  const {
    ready,
    store,
    mode,
    user,
    authAvailable,
    authError,
    signInWithGoogle,
    signOut,
    pendingLocalMigration,
    migrateLocalData,
    dismissMigration,
    reloadLibrary,
    symptomTypes,
    foodTags,
    sync,
    flushSync,
  } = useStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const [counts, setCounts] = useState<{ meals: number; logs: number; days: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    if (!store) return;
    const [meals, logs] = await Promise.all([store.listMeals(), store.listSymptomLogs()]);
    const days = new Set([...meals.map((m) => m.occurredOn), ...logs.map((l) => l.occurredOn)]);
    setCounts({ meals: meals.length, logs: logs.length, days: days.size });
  }, [store]);

  useEffect(() => {
    // Reading the user's log from IndexedDB or Supabase on mount is a genuine
    // external-system sync. The lint rule can't see that every setState inside
    // happens after an await, so it is silenced here rather than restructured.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) void refresh();
  }, [ready, refresh]);

  const handleExport = async () => {
    if (!store) return;
    const snapshot = await store.exportAll();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gut-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flash('Exported');
  };

  const handleImportFile = async (file: File) => {
    if (!store) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());

      // Files from the original single-file tracker have a different shape.
      const snapshot: Snapshot = isLegacyExport(parsed)
        ? importLegacyExport(parsed)
        : (parsed as Snapshot);

      if (snapshot.app !== 'gut-tracker') throw new Error('Not a Gut Tracker export');

      const result = await store.importAll(snapshot, 'merge');
      await reloadLibrary();
      await refresh();
      flash(`Imported ${result.meals} meals and ${result.symptomLogs} symptom entries`);
    } catch (err) {
      flash(err instanceof Error ? `Import failed: ${err.message}` : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  };

  const handleMigrate = async () => {
    setBusy(true);
    try {
      const result = await migrateLocalData();
      if (result) {
        await refresh();
        flash(`Moved ${result.meals} meals and ${result.symptomLogs} symptoms to your account`);
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not move your data');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!store) return;
    const confirmed = window.confirm(
      'Delete every meal, symptom and setting? This cannot be undone. Export first if you want a copy.'
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await store.clearAll();
      await refresh();
      flash('All data deleted');
      router.replace('/onboarding');
    } finally {
      setBusy(false);
    }
  };

  const handleRedoSetup = async () => {
    if (!store) return;
    await store.updateProfile({ onboardedAt: null });
    router.replace('/onboarding');
  };

  if (!ready || !store) return <Spinner label="Loading" />;

  return (
    <main className="pb-6">
      <h1 className="mb-5 text-[26px] font-bold tracking-[-0.03em]">You</h1>

      {pendingLocalMigration && (
        <Card className="mb-4 border-lime/40 bg-lime/10">
          <CardLabel>Data on this device</CardLabel>
          <p className="text-[13px] leading-relaxed text-ink">
            You logged some entries before signing in. Move them into your account so they
            sync and get analysed together?
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={handleMigrate} disabled={busy} className="flex-[2]">
              {busy ? 'Moving…' : 'Move to my account'}
            </Button>
            <Button variant="secondary" onClick={dismissMigration} className="flex-1">
              Not now
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <CardLabel>Account</CardLabel>
        {user ? (
          <>
            <div className="text-sm font-semibold">{user.email}</div>
            <div className="mt-1 text-[12.5px] text-faint">
              {sync.pending > 0
                ? `${sync.pending} ${sync.pending === 1 ? 'change is' : 'changes are'} saved on this device and waiting to reach your account.`
                : 'Synced to your account. Available on any device you sign in on.'}
            </div>

            {sync.pending > 0 && (
              <Button variant="secondary" full className="mt-3" onClick={() => void flushSync()}>
                Try syncing now
              </Button>
            )}

            {sync.abandoned > 0 && (
              <div className="mt-2 text-[12px] leading-relaxed text-hot">
                {sync.abandoned} {sync.abandoned === 1 ? 'change' : 'changes'} could not be saved
                to your account after several tries. {"They're"} still on this device — export a
                backup before clearing site data.
              </div>
            )}

            <Button variant="secondary" full className="mt-3" onClick={signOut}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold">Saved on this device only</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-faint">
              Nothing has left this browser. Clearing site data would erase it, and it
              won&apos;t appear on your other devices.
            </div>
            {authAvailable ? (
              <Button full className="mt-3" onClick={signInWithGoogle}>
                Continue with Google
              </Button>
            ) : (
              <div className="mt-3 rounded-[var(--radius-field)] border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] text-faint">
                This instance has no backend configured, so sign-in is unavailable. Local
                mode works fully — use Export to keep a backup.
              </div>
            )}
            {authError && (
              <div className="mt-2 text-[12px] text-hot">{authError}</div>
            )}
          </>
        )}
      </Card>

      <Card className="mb-4">
        <CardLabel>Your log</CardLabel>
        {counts ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Days', value: counts.days },
              { label: 'Meals', value: counts.meals },
              { label: 'Symptoms', value: counts.logs },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-[var(--radius-field)] bg-surface-2 px-3 py-2.5">
                <div className="text-xl font-bold tabular-nums">{value}</div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">
                  {label}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[13px] text-faint">Counting…</div>
        )}
        <div className="mt-3 text-[12px] text-faint">
          Storage: {mode === 'cloud' ? 'your account' : 'this device'}
          {mode === 'cloud' && sync.pending > 0 && ' · syncing'}
          {mode === 'cloud' && sync.pending === 0 && sync.offline && ' · offline'}
        </div>
      </Card>

      <Card className="mb-4">
        <CardLabel>Tracking</CardLabel>
        <div className="text-[13px] leading-relaxed text-muted">
          {symptomTypes.length} symptoms and {foodTags.length} food groups available. Change
          which ones you actively track by running setup again — your logged entries are kept.
        </div>
        <Button variant="secondary" full className="mt-3" onClick={handleRedoSetup}>
          Change what I track
        </Button>
      </Card>

      <Card className="mb-4">
        <CardLabel>Backup</CardLabel>
        <div className="text-[12.5px] leading-relaxed text-muted">
          Export gives you a JSON file with everything in it. Import accepts that file, or an
          export from the original single-file Gut Reset tracker.
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={handleExport} className="flex-1">
            Export
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex-1"
          >
            {busy ? 'Working…' : 'Import'}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
      </Card>

      <Card className={cx('mb-4')}>
        <CardLabel>Danger zone</CardLabel>
        <div className="text-[12.5px] leading-relaxed text-muted">
          Deletes every meal, symptom and setting from {mode === 'cloud' ? 'your account' : 'this device'}.
        </div>
        <Button variant="danger" full className="mt-3" onClick={handleDeleteAll} disabled={busy}>
          Delete all my data
        </Button>
      </Card>

      <footer className="px-2 pb-4 text-center text-[11.5px] leading-relaxed text-faint">
        Gut Tracker finds associations in your own log. It is not a diagnosis.
        <br />
        Persistent or worsening symptoms deserve a doctor.
        <br />
        <a
          className="text-muted underline"
          href="https://github.com/trippinwithpuneet/gut-tracker"
          target="_blank"
          rel="noreferrer"
        >
          Open source
        </a>{' '}
        ·{' '}
        <a className="text-muted underline" href="/privacy">
          Privacy
        </a>
      </footer>

      <Toast message={toast} />
    </main>
  );
}
