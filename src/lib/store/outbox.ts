/**
 * A durable queue of writes that have not reached the server yet.
 *
 * Why this exists: signing in used to make the app *less* reliable than staying
 * signed out. LocalStore writes to IndexedDB and cannot fail for network reasons;
 * CloudStore went straight to Supabase, so logging a meal in a restaurant basement
 * threw and the meal was gone. The queue closes that gap — a write is accepted
 * locally, always, and drains to the server whenever the connection comes back.
 *
 * Replay is safe because every queued operation is idempotent by construction:
 * ids are generated on the client and CloudStore upserts on them, and the two
 * `set*` operations replace a whole set rather than appending to one. Applying the
 * same entry twice therefore lands on the same final state as applying it once,
 * which is what lets us retry without bookkeeping about what the server already saw.
 *
 * Not everything is queueable. `createSymptomType` and `createFoodTag` take their
 * ids *from* the server, so a queued copy would hand out an id that later changes
 * and orphan any meal tagged with it. Those two stay online-only, which is a real
 * limitation but a narrow one: it costs you the ability to invent a new food group
 * while offline, not the ability to log.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DailyFactors, Profile } from '../types';
import type { ChallengeInput, DataStore, MealInput, SymptomLogInput } from './types';

/** A write waiting to be replayed. Mirrors the mutating half of DataStore. */
export type PendingOp =
  | { kind: 'saveMeal'; input: MealInput }
  | { kind: 'deleteMeal'; id: string }
  | { kind: 'saveSymptomLog'; input: SymptomLogInput }
  | { kind: 'deleteSymptomLog'; id: string }
  | { kind: 'saveDailyFactors'; input: DailyFactors }
  | { kind: 'saveChallenge'; input: ChallengeInput }
  | { kind: 'deleteChallenge'; id: string }
  | { kind: 'setTrackedSymptoms'; ids: string[] }
  | { kind: 'setTrackedTags'; ids: string[] }
  | { kind: 'updateProfile'; patch: Partial<Pick<Profile, 'displayName' | 'timezone' | 'onboardedAt'>> };

export interface OutboxEntry {
  seq: number;
  op: PendingOp;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

/**
 * After this many failed attempts an entry is abandoned rather than retried forever.
 * A write that keeps failing is not a flaky network — it is a row the server refuses
 * (a row-level-security denial, a check constraint), and retrying it every time the
 * user reopens the app would block every good write queued behind it.
 */
export const MAX_ATTEMPTS = 5;

interface OutboxDB extends DBSchema {
  ops: { key: number; value: Omit<OutboxEntry, 'seq'> };
  dead: { key: number; value: OutboxEntry };
}

const DB_VERSION = 1;

export class Outbox {
  private promise: Promise<IDBPDatabase<OutboxDB>> | null = null;

  constructor(private readonly name: string) {}

  private db(): Promise<IDBPDatabase<OutboxDB>> {
    if (!this.promise) {
      this.promise = openDB<OutboxDB>(this.name, DB_VERSION, {
        upgrade(database) {
          database.createObjectStore('ops', { autoIncrement: true });
          database.createObjectStore('dead', { autoIncrement: true });
        },
      });
    }
    return this.promise;
  }

  async enqueue(op: PendingOp): Promise<void> {
    await (await this.db()).add('ops', {
      op,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    });
  }

  /** Oldest first — replay order is the order the user made the changes in. */
  async pending(): Promise<OutboxEntry[]> {
    const database = await this.db();
    const keys = await database.getAllKeys('ops');
    const values = await database.getAll('ops');
    return values.map((value, index) => ({ ...value, seq: keys[index] }));
  }

  async count(): Promise<number> {
    return (await this.db()).count('ops');
  }

  /** Entries the server rejected too many times. Surfaced so they are not silent. */
  async abandoned(): Promise<OutboxEntry[]> {
    const database = await this.db();
    const keys = await database.getAllKeys('dead');
    const values = await database.getAll('dead');
    return values.map((value, index) => ({ ...value, seq: keys[index] }));
  }

  async clear(): Promise<void> {
    const database = await this.db();
    await database.clear('ops');
    await database.clear('dead');
  }

  private async settle(entry: OutboxEntry, error: unknown): Promise<void> {
    const database = await this.db();
    const attempts = entry.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);

    if (attempts >= MAX_ATTEMPTS) {
      await database.delete('ops', entry.seq);
      await database.add('dead', { ...entry, attempts, lastError: message });
      return;
    }
    await database.put('ops', { op: entry.op, queuedAt: entry.queuedAt, attempts, lastError: message }, entry.seq);
  }

  /**
   * Pushes queued writes at the server, oldest first.
   *
   * A network failure stops the drain immediately and leaves the rest queued: later
   * entries may depend on earlier ones (a meal edited twice, a challenge created then
   * completed), so skipping ahead could apply them out of order. A rejection that is
   * *not* a network failure only burns one attempt on that entry and moves on, so one
   * poisoned row cannot wedge the queue forever.
   */
  async drain(cloud: DataStore, isOffline: (error: unknown) => boolean): Promise<{ sent: number; remaining: number }> {
    let sent = 0;
    for (const entry of await this.pending()) {
      try {
        await apply(cloud, entry.op);
        await (await this.db()).delete('ops', entry.seq);
        sent++;
      } catch (error) {
        await this.settle(entry, error);
        if (isOffline(error)) break;
      }
    }
    return { sent, remaining: await this.count() };
  }
}

/** Replays one operation against a store. Exported for tests. */
export async function apply(store: DataStore, op: PendingOp): Promise<void> {
  switch (op.kind) {
    case 'saveMeal':
      await store.saveMeal(op.input);
      return;
    case 'deleteMeal':
      await store.deleteMeal(op.id);
      return;
    case 'saveSymptomLog':
      await store.saveSymptomLog(op.input);
      return;
    case 'deleteSymptomLog':
      await store.deleteSymptomLog(op.id);
      return;
    case 'saveDailyFactors':
      await store.saveDailyFactors(op.input);
      return;
    case 'saveChallenge':
      await store.saveChallenge(op.input);
      return;
    case 'deleteChallenge':
      await store.deleteChallenge(op.id);
      return;
    case 'setTrackedSymptoms':
      await store.setTrackedSymptoms(op.ids);
      return;
    case 'setTrackedTags':
      await store.setTrackedTags(op.ids);
      return;
    case 'updateProfile':
      await store.updateProfile(op.patch);
      return;
  }
}
