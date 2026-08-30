/**
 * Sends the daily logging reminder.
 *
 * Invoked hourly by pg_cron (see supabase/cron/schedule.sql). Each run asks: whose
 * local clock has just reached their chosen hour, and who has not already been sent
 * today's reminder? Scheduling per-user in their own timezone is why this runs every
 * hour rather than once a day — 21:00 is a different instant in Mumbai and Lisbon.
 *
 * This is the only place in the project that uses the service-role key. It has to:
 * it reads other people's rows to decide who to notify, which is exactly what
 * row-level security exists to prevent from the browser. The key lives as an Edge
 * Function secret and is never shipped to a client. See AGENTS.md.
 *
 * The notification body deliberately contains nothing a user logged. It is rendered
 * on a lock screen, in public, and no meal or symptom belongs there.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
// Push services require a contact address for the sender, per RFC 8292.
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface ProfileRow {
  id: string;
  timezone: string | null;
  reminder_hour: number | null;
  reminder_last_sent_on: string | null;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number | null;
}

/**
 * The hour and calendar date showing on a clock in `timeZone` right now.
 *
 * Computed with Intl rather than offset arithmetic so daylight saving is handled by
 * the timezone database instead of by us getting it wrong twice a year.
 */
function localNow(timeZone: string): { hour: number; date: string } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    }).formatToParts(new Date());

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    // Some engines render midnight as "24" under hour12:false.
    const hour = Number(get('hour')) % 24;
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    if (Number.isNaN(hour) || date.includes('undefined')) return null;
    return { hour, date };
  } catch {
    // An invalid IANA name should skip that user, not fail the whole run.
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, timezone, reminder_hour, reminder_last_sent_on')
    .eq('reminder_enabled', true)
    .not('reminder_hour', 'is', null);

  if (error) {
    return Response.json({ error: `read profiles: ${error.message}` }, { status: 500 });
  }

  const due: { id: string; localDate: string }[] = [];
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    const now = localNow(profile.timezone || 'UTC');
    if (!now) continue;
    if (now.hour !== profile.reminder_hour) continue;
    // Idempotence: a cron retry, or an hour repeated by a DST rollback, must not
    // produce a second notification on the same local day.
    if (profile.reminder_last_sent_on === now.date) continue;
    due.push({ id: profile.id, localDate: now.date });
  }

  if (due.length === 0) return Response.json({ due: 0, sent: 0, pruned: 0 });

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, failure_count')
    .in(
      'user_id',
      due.map((d) => d.id)
    );

  const payload = JSON.stringify({
    title: 'Gut Tracker',
    body: 'Log today before you forget.',
    url: '/',
  });

  let sent = 0;
  let pruned = 0;
  const delivered = new Set<string>();

  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
      delivered.add(sub.user_id);
      await supabase
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq('id', sub.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 mean the endpoint is gone for good — the user uninstalled the PWA or
      // cleared site data. Keeping it would retry forever against a dead address.
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        pruned++;
      } else {
        // A transient failure (push service 5xx, timeout). Leave the row alone and
        // let tomorrow's run try again; only count it so a permanently sick endpoint
        // is visible in the table.
        console.error(`push failed for ${sub.id}: ${String(err)}`);
        await supabase
          .from('push_subscriptions')
          .update({ failure_count: (sub.failure_count ?? 0) + 1 })
          .eq('id', sub.id);
      }
    }
  }

  // Only mark a day as reminded for users who actually received something; a user
  // whose only device has expired should be retried tomorrow, not marked done.
  for (const d of due) {
    if (!delivered.has(d.id)) continue;
    await supabase
      .from('profiles')
      .update({ reminder_last_sent_on: d.localDate })
      .eq('id', d.id);
  }

  return Response.json({ due: due.length, sent, pruned });
});
