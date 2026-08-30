import type { MetadataRoute } from 'next';

/**
 * Web app manifest — what makes the tracker installable to a home screen.
 *
 * This matters more here than it does for most apps. Logging has to happen within
 * seconds of eating or it does not happen at all, and an app behind "open browser,
 * find tab, wait for load" loses to forgetting. It is also the gate for
 * notifications on iOS, where web push only works once a PWA has been installed.
 *
 * `display: standalone` drops the browser chrome; the colours match the tokens in
 * globals.css so the splash screen does not flash white before the app paints.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gut Tracker',
    short_name: 'Gut Tracker',
    description:
      'Log what you eat and how you feel. Find out which foods actually track with your symptoms.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0e1211',
    theme_color: '#0e1211',
    categories: ['health', 'lifestyle', 'medical'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Log a meal', url: '/?compose=meal' },
      { name: 'Log a symptom', url: '/?compose=symptom' },
      { name: 'Insights', url: '/insights' },
    ],
  };
}
