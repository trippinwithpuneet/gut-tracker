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
