'use client';

/**
 * Push subscription management for daily reminders.
 *
 * This deliberately sits outside the DataStore interface. AGENTS.md requires anything
 * added there to have a real implementation in both LocalStore and CloudStore, and a
 * push subscription cannot exist locally — it is issued by the browser's push service
 * and only means anything to a server that can send to it. It is device
 * infrastructure, not user log data, so it talks to Supabase directly.
 *
 * A subscription belongs to a browser, not a person. Enabling reminders on a phone
 * does not enable them on a laptop, and the UI has to say so or it reads as a bug.
 */
import { getSupabaseBrowserClient } from '../supabase/client';

/**
 * The VAPID public key identifies this server to the push service. It is public by
 * design and safe in the bundle; the matching private key lives only as an Edge
 * Function secret and must never reach the browser.
 */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export const isPushConfigured = Boolean(VAPID_PUBLIC_KEY);

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: 'unsupported' | 'needs-install' | 'not-configured' };

/**
 * Whether this browser can actually subscribe.
 *
 * The iOS case is the one that matters: Safari exposes no PushManager at all until a
 * site has been added to the home screen, so a user in a Safari tab needs to be told
 * to install rather than shown a switch that throws.
 */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return { supported: false, reason: 'unsupported' };
  if (!isPushConfigured) return { supported: false, reason: 'not-configured' };

  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (hasApi) return { supported: true };

  // An iOS device without the API is almost always a Safari tab rather than a
  // browser that will never support push.
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari's own flag, which predates display-mode and is still what iOS sets.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (iOS && !standalone) return { supported: false, reason: 'needs-install' };
  return { supported: false, reason: 'unsupported' };
}

export function permissionState(): NotificationPermission | 'unavailable' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unavailable';
  return Notification.permission;
}

/** The push service wants the key as bytes, and ships it as base64url. */
function decodeKey(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function keyToBase64(subscription: PushSubscription, name: 'p256dh' | 'auth'): string {
  const key = subscription.getKey(name);
  if (!key) throw new Error(`Push subscription is missing its ${name} key`);
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

/**
 * Asks for permission, subscribes this browser, and records it against the user.
 *
 * Returns false when the user declines. That is an ordinary outcome, not an error —
 * the caller turns the toggle back off and says nothing further.
 */
export async function enablePush(userId: string): Promise<boolean> {
  const support = pushSupport();
  if (!support.supported) throw new Error(`Push is unavailable here (${support.reason})`);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;

  // Reuse an existing subscription when there is one: re-subscribing a browser that
  // already has a live endpoint invalidates the old one for no reason.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_PUBLIC_KEY) as BufferSource,
    }));

  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('Sign-in is not configured on this instance');

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: keyToBase64(subscription, 'p256dh'),
      auth: keyToBase64(subscription, 'auth'),
      user_agent: navigator.userAgent.slice(0, 500),
      failure_count: 0,
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error(`Could not save this device: ${error.message}`);

  return true;
}

/** Unsubscribes this browser and forgets it server-side. */
export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    // Delete the row before dropping the local subscription: if this fails, the
    // server would otherwise keep pushing to an endpoint nothing listens on.
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  }
  await subscription.unsubscribe();
}

/** Whether this browser currently holds a push subscription. */
export async function hasPushSubscription(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  return (await registration.pushManager.getSubscription()) !== null;
}
