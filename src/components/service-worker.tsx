'use client';

import { useEffect } from 'react';

/**
 * Registers the offline shell.
 *
 * Registration is deferred to the load event so it never competes with the first
 * paint — the app has to feel instant when someone opens it to log a meal, and a
 * service worker install is not worth a frame of that.
 *
 * Failure is swallowed on purpose. Service workers are unavailable in private
 * windows and on insecure origins, and none of the app's behaviour depends on this
 * one: it makes a cold offline open work, and that is all.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
