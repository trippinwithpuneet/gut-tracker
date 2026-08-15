import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy — Gut Tracker',
  description: 'What Gut Tracker stores, where it stores it, and what it never does.',
};

/**
 * Served at /privacy. Google's OAuth consent screen requires a privacy policy URL,
 * and this is it — but it is written to be read by users rather than to satisfy a
 * form. Keep it accurate: if the data model changes, change this too.
 */
export default function PrivacyPage() {
  return (
    <main className="pb-6">
      <h1 className="text-[26px] font-bold tracking-[-0.03em]">Privacy</h1>
      <p className="mt-1 text-xs font-medium text-faint">Last updated 15 August 2026</p>

      <div className="mt-5 space-y-5 text-[13.5px] leading-relaxed text-muted">
        <p>
          Gut Tracker records what you eat and how you feel. That is health information,
          and it is treated as such. This page describes exactly what happens to it.
        </p>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-ink">If you don&apos;t sign in</h2>
          <p>
            Nothing leaves your device. Meals, symptoms and settings are stored in your
            browser&apos;s local database. There is no account, no server copy, and no
            request carrying your data anywhere. Clearing your browser&apos;s site data
            erases it permanently, so use Export if you want a backup.
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-ink">If you do sign in</h2>
          <p>
            Signing in with Google creates an account so your log can follow you between
            devices. Google tells this app your email address and name — nothing else, and
            it is never asked for anything else. Your entries are then stored in a Postgres
            database where every table is protected by row-level security tied to your user
            id, meaning no other account can read your rows even if they try.
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-ink">What is never done</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>No analytics, tracking pixels, or third-party scripts.</li>
            <li>No advertising, and no sale or sharing of data with anyone.</li>
            <li>No use of your log to train anything.</li>
            <li>No access to your Google account beyond your email address and name.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-ink">Your data, your call</h2>
          <p>
            The You tab has an Export button that hands you everything as a JSON file, and a
            delete button that removes every meal, symptom and setting. Deletion is
            immediate and is not recoverable.
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-ink">Run your own copy</h2>
          <p>
            This app is open source under the MIT license. If you would rather not trust
            anyone else&apos;s instance, host your own — the setup guide is in the
            repository, and the local-only mode needs no server at all.
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-ink">Not a medical service</h2>
          <p>
            Gut Tracker reports statistical associations within your own log. It does not
            diagnose, does not establish that any food causes anything, and is not medical
            advice. It is not operated by a healthcare provider and is not covered by
            health-records regulation such as HIPAA.
          </p>
        </section>
      </div>

      <div className="mt-6">
        <Link href="/you" className="text-[13px] font-semibold text-lime underline">
          Back to the app
        </Link>
      </div>
    </main>
  );
}
