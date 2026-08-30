'use client';

/**
 * Daily reminder settings.
 *
 * Reminders are the one signed-in-only feature in the app. Push has to be sent by a
 * server and local mode has none, so rather than offer a switch that cannot work,
 * this says why. See AGENTS.md — that exception is deliberate and documented.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardLabel, inputClass } from '@/components/ui';
import {
  disablePush,
  enablePush,
  hasPushSubscription,
  isPushConfigured,
  permissionState,
  pushSupport,
} from '@/lib/push/subscribe';
import {
  DEFAULT_REMINDER_HOUR,
  getReminderSettings,
  hourLabel,
  saveReminderSettings,
} from '@/lib/push/reminders';
import { useStore } from '@/lib/store/provider';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** A short explanation, or null when reminders can actually be switched on here. */
function blocker(user: unknown, authAvailable: boolean): string | null {
  if (!authAvailable) {
    return 'This instance has no backend configured, so there is nothing to send reminders from.';
  }
  if (!user) {
    return 'Reminders need an account. A notification has to be sent by a server, and in local-only mode there is no server — everything stays on this device, which is exactly why nothing can reach out to you.';
  }
  if (!isPushConfigured) {
    return 'This deployment has no push key configured, so reminders cannot be enabled.';
  }
  const support = pushSupport();
  if (!support.supported) {
    return support.reason === 'needs-install'
      ? 'On iPhone, notifications only work once the app is on your home screen. Tap Share, then Add to Home Screen, and open it from there.'
      : 'This browser cannot receive notifications.';
  }
  return null;
}

export function RemindersCard() {
  const { user, authAvailable } = useStore();

  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(DEFAULT_REMINDER_HOUR);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // `undefined` means "not worked out yet". blocker() reads window and Notification,
  // which do not exist during server rendering, so calling it in render would make
  // the server and the first client render disagree and trip hydration. It is
  // resolved in an effect instead, and the card stays quiet until then.
  const [reason, setReason] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason(blocker(user, authAvailable));
  }, [user, authAvailable]);

  useEffect(() => {
    if (!user || reason !== null) return;
    let cancelled = false;
    void (async () => {
      const [settings, hasSub] = await Promise.all([
        getReminderSettings(user.id),
        hasPushSubscription(),
      ]);
      if (cancelled) return;
      /* eslint-disable react-hooks/set-state-in-effect */
      if (settings) {
        setEnabled(settings.enabled);
        setHour(settings.hour);
      }
      setSubscribed(hasSub);
      setDenied(permissionState() === 'denied');
      /* eslint-enable react-hooks/set-state-in-effect */
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reason]);

  const turnOn = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const granted = await enablePush(user.id);
      if (!granted) {
        setDenied(permissionState() === 'denied');
        return;
      }
      await saveReminderSettings(user.id, { enabled: true, hour });
      setEnabled(true);
      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable reminders');
    } finally {
      setBusy(false);
    }
  }, [user, hour]);

  const turnOff = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await saveReminderSettings(user.id, { enabled: false, hour });
      await disablePush();
      setEnabled(false);
      setSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn reminders off');
    } finally {
      setBusy(false);
    }
  }, [user, hour]);

  const changeHour = useCallback(
    async (next: number) => {
      setHour(next);
      if (!user || !enabled) return;
      try {
        await saveReminderSettings(user.id, { enabled: true, hour: next });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the time');
      }
    },
    [user, enabled]
  );

  if (reason === undefined) {
    return (
      <Card className="mb-4">
        <CardLabel>Daily reminder</CardLabel>
        <p className="text-[12.5px] text-faint">Checking this device…</p>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardLabel>Daily reminder</CardLabel>

      {reason ? (
        <p className="text-[12.5px] leading-relaxed text-faint">{reason}</p>
      ) : (
        <>
          <p className="text-[12.5px] leading-relaxed text-muted">
            One notification a day, so a day does not get missed. Skipped days are dropped
            from the analysis rather than counted as good ones, so forgetting does not
            weaken a result — it postpones one.
          </p>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              Remind me at
            </span>
            <select
              className={inputClass}
              value={hour}
              onChange={(e) => void changeHour(Number(e.target.value))}
              disabled={busy}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>

          {enabled ? (
            <Button variant="secondary" full className="mt-3" onClick={() => void turnOff()} disabled={busy}>
              {busy ? 'Working…' : 'Turn reminders off'}
            </Button>
          ) : (
            <Button full className="mt-3" onClick={() => void turnOn()} disabled={busy}>
              {busy ? 'Working…' : 'Turn reminders on'}
            </Button>
          )}

          {enabled && (
            <p className="mt-2 text-[12px] leading-relaxed text-faint">
              Reminders arrive on the devices you switch them on. Turning them on here does
              not turn them on elsewhere.
            </p>
          )}

          {enabled && !subscribed && (
            <p className="mt-2 text-[12px] leading-relaxed text-hot">
              Reminders are on for your account, but this device is not signed up to receive
              them. Turn them off and on again here.
            </p>
          )}

          {denied && (
            <p className="mt-2 text-[12px] leading-relaxed text-hot">
              Notifications are blocked for this site in your browser settings. That has to be
              changed there before reminders can work.
            </p>
          )}

          {error && <p className="mt-2 text-[12px] text-hot">{error}</p>}
        </>
      )}
    </Card>
  );
}
