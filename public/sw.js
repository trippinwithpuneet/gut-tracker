/**
 * Offline shell for Gut Tracker.
 *
 * The data layer already works offline — IndexedDB holds the log and an outbox
 * replays writes. This closes the last gap: without a service worker, opening the
 * app with no connection shows the browser's dinosaur instead of the app that is
 * perfectly capable of running.
 *
 * Deliberately narrow. It caches this origin's own shell and nothing else: Supabase
 * requests are cross-origin and pass straight through, because a stale cached
 * response to an auth or data call would be worse than a failed one. Nothing here
 * inspects, stores, or transmits anything a user logged.
 *
 * It also receives the daily reminder push. The payload deliberately carries no
 * symptom or meal content — a notification is rendered on a lock screen in public,
 * and there is nothing about this app's data that belongs there.
 */
const VERSION = 'v1';
const SHELL = `gut-tracker-shell-${VERSION}`;
const RUNTIME = `gut-tracker-runtime-${VERSION}`;

// Routes worth having before they are first visited, so a cold offline open works.
const PRECACHE = ['/', '/insights', '/tests', '/you', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, RUNTIME]);
      for (const key of await caches.keys()) {
        if (key.startsWith('gut-tracker-') && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await caches.match(request));
    if (cached) return cached;
    const shell = await caches.match('/offline');
    if (shell) return shell;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Anything not served by this origin — Supabase above all — is none of our business.
  if (url.origin !== self.location.origin) return;

  // Build output is content-hashed and immutable, so the cache can be trusted.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pages and everything else: prefer fresh, fall back to what we have.
  event.respondWith(networkFirst(request));
});

// ------------------------------------------------------------------ reminders

self.addEventListener('push', (event) => {
  // A push with no body still has to show something: browsers revoke push
  // permission from origins that receive a push and display nothing.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Gut Tracker';
  const body = payload.body || 'Log today before you forget.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Collapses onto any reminder already sitting unread, so a phone left alone
      // for a week shows one reminder rather than seven.
      tag: 'daily-reminder',
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus the app if it is already open rather than stacking another window.
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
