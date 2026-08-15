/**
 * Local-calendar date helpers.
 *
 * Everything user-facing is anchored to the device's local day, not UTC. Using
 * `toISOString().slice(0,10)` — as the original single-file app did — silently
 * files an 11pm meal in India under the next day, which then lands in the wrong
 * exposure window and quietly corrupts the analysis. So: format from local parts.
 */

/** `YYYY-MM-DD` for a Date in local time. */
export function toDayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): string {
  return toDayString(new Date());
}

/** Parses `YYYY-MM-DD` as local midnight rather than UTC midnight. */
export function fromDayString(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, delta: number): string {
  const date = fromDayString(day);
  date.setDate(date.getDate() + delta);
  return toDayString(date);
}

/** Whole days between two `YYYY-MM-DD` strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromDayString(b).getTime() - fromDayString(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** "Today", "Yesterday", or "Sat 15 Aug". */
export function friendlyDay(day: string): string {
  const diff = daysBetween(day, today());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return fromDayString(day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function longDay(day: string): string {
  return fromDayString(day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: daysBetween(day, today()) > 300 ? 'numeric' : undefined,
  });
}

/** "8:40 pm" from an ISO instant, or null when no time was recorded. */
export function clockTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** `HH:MM` in local time, for populating a time input. */
export function toTimeInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Combines a local day and an `HH:MM` into an ISO instant; null when time is blank. */
export function combineDayAndTime(day: string, time: string): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const date = fromDayString(day);
  date.setHours(h, m, 0, 0);
  return date.toISOString();
}

/** The meal slot a time of day most likely belongs to. */
export function guessSlot(date = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'dinner';
  return 'snack';
}
