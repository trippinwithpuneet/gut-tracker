import { Card, CardLabel } from '@/components/ui';

export const metadata = { title: 'Offline · Gut Tracker' };

/**
 * Shown only when the service worker has nothing cached for a route.
 *
 * It says what is true: the log is on the device and nothing has been lost. A
 * tracker that looks like it ate your data the first time you use it on the tube
 * does not get opened again.
 */
export default function OfflinePage() {
  return (
    <main className="pb-6">
      <h1 className="mb-5 text-[26px] font-bold tracking-[-0.03em]">No connection</h1>
      <Card>
        <CardLabel>Your log is safe</CardLabel>
        <p className="text-[13px] leading-relaxed text-muted">
          This page has not been opened on this device yet, so there was nothing saved to
          show you. Everything you have already logged is stored on the device and will
          still be here.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Anything you log while offline is kept and sent to your account the next time
          there is a connection.
        </p>
      </Card>
    </main>
  );
}
