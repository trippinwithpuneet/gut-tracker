'use client';

/**
 * Reminder preferences: whether to send, and at what local hour.
 *
 * These live on `profiles` but are read and written here rather than through
 * DataStore, for the same reason subscriptions are (see subscribe.ts): reminders are
 * a signed-in-only feature, and teaching LocalStore to remember a reminder hour it
 * can never act on would be a lie the interface would then have to keep.
 */
import { getSupabaseBrowserClient } from '../supabase/client';

export interface ReminderSettings {
  enabled: boolean;
  /** Hour of the day, 0–23, in the user's own timezone. */
  hour: number;
}

export const DEFAULT_REMINDER_HOUR = 21;

/** The device's real timezone, which is what the cron job schedules against. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function getReminderSettings(userId: string): Promise<ReminderSettings | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('reminder_enabled, reminder_hour')
    .eq('id', userId)
    .single();
  if (error || !data) return null;

  return {
    enabled: Boolean(data.reminder_enabled),
    hour: data.reminder_hour ?? DEFAULT_REMINDER_HOUR,
  };
}

/**
 * Saves the preference, and the timezone alongside it.
 *
 * The timezone write is not incidental. `profiles.timezone` defaults to 'UTC' and
 * nothing else in the app has ever set it, so without this every reminder would fire
 * at the chosen hour UTC — five and a half hours off in India, and wrong everywhere
 * that is not London in winter.
 */
export async function saveReminderSettings(
  userId: string,
  settings: ReminderSettings
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('Sign-in is not configured on this instance');

  const { error } = await supabase
    .from('profiles')
    .update({
      reminder_enabled: settings.enabled,
      reminder_hour: settings.hour,
      timezone: deviceTimezone(),
    })
    .eq('id', userId);

  if (error) throw new Error(`Could not save reminder settings: ${error.message}`);
}

/** Formats an hour for display without dragging in a date library. */
export function hourLabel(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
