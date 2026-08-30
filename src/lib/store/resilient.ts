/**
 * CloudStore, made safe to use on a phone with a bad connection.
 *
 * Three pieces cooperate:
 *   - the real CloudStore, which talks to Supabase
 *   - a LocalStore mirror in its own IndexedDB database, which answers reads when
 *     the network will not and holds the truth the user just typed
 *   - an Outbox, which remembers writes that have not landed yet
 *
 * The rule that keeps this honest: **every write is queued, never sent directly.**
 * Sending some writes inline and queuing others would let a write jump ahead of one
 * already waiting, and "meal edited, then deleted" replayed backwards leaves a row
 * the user deleted. Queuing everything makes replay order the same as user order by
 * construction, and the drain that immediately follows means an online write still
 * reaches the server in the same tick.
 *
 * Reads follow from that: while anything is queued the server is behind the mirror,
 * so the mirror is the more truthful answer and we read from it. Once the queue is
 * empty the server is authoritative again, and each successful read refreshes the
 * mirror so it stays useful for the next time the connection drops.
 */
import type {
  Challenge,
  DailyFactors,
  FoodTag,
  ImportResult,
  Meal,
  Profile,
  Snapshot,
  SymptomLog,
  SymptomType,
  TrackedSymptom,
  TrackedTag,
} from '../types';
import { uuidv4 } from '../uuid';
import { LocalStore } from './local';
import { Outbox, type PendingOp } from './outbox';
import {
  emptySnapshot,
  type ChallengeInput,
  type CustomSymptomInput,
  type CustomTagInput,
  type DataStore,
  type DayRange,
  type MealInput,
  type SymptomLogInput,
} from './types';

export interface SyncState {
  /** Writes accepted locally but not yet acknowledged by the server. */
  pending: number;
  /** Writes the server refused often enough that we stopped retrying. */
  abandoned: number;
  /** True while the last attempt to reach the server failed for network reasons. */
  offline: boolean;
  lastError: string | null;
}

export const IDLE_SYNC_STATE: SyncState = {
  pending: 0,
  abandoned: 0,
  offline: false,
  lastError: null,
};

/**
 * Distinguishes "the network is not there" from "the server said no".
 *
 * It matters because the two deserve opposite treatment: a network failure should
 * stop the drain and wait, while a rejection should burn one attempt and let the
 * queue keep moving. There is no error code for this — supabase-js surfaces a failed
 * fetch as an ordinary Error — so this matches on the shapes browsers actually
 * produce, and treats an explicitly offline navigator as decisive.
 */
export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('err_internet_disconnected') ||
    message.includes('fetch failed')
  );
}

export function mirrorDatabaseName(userId: string): string {
  return `gut-tracker-mirror-${userId}`;
}

export function outboxDatabaseName(userId: string): string {
  return `gut-tracker-outbox-${userId}`;
}

export class ResilientStore implements DataStore {
  readonly kind = 'cloud' as const;

  private readonly mirror: LocalStore;
  private readonly outbox: Outbox;
  private flushing: Promise<void> | null = null;
  private state: SyncState = { ...IDLE_SYNC_STATE };

  constructor(
    private readonly cloud: DataStore,
    userId: string,
    private readonly onSyncState: (state: SyncState) => void = () => {}
  ) {
    this.mirror = new LocalStore(mirrorDatabaseName(userId));
    this.outbox = new Outbox(outboxDatabaseName(userId));
  }

  // ------------------------------------------------------------------ plumbing

  private publish(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this.onSyncState(this.state);
  }

  /** Drains the queue. Concurrent callers share one in-flight drain. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;

    this.flushing = (async () => {
      try {
        const { remaining } = await this.outbox.drain(this.cloud, isOfflineError);
        this.publish({
          pending: remaining,
          abandoned: (await this.outbox.abandoned()).length,
          offline: remaining > 0,
          lastError: remaining > 0 ? this.state.lastError : null,
        });
      } catch (error) {
        this.publish({
          offline: isOfflineError(error),
          lastError: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.flushing = null;
      }
    })();

    return this.flushing;
  }

  /** True when the mirror, not the server, holds the freshest copy. */
  private async behind(): Promise<boolean> {
    return (await this.outbox.count()) > 0;
  }

  /**
   * Applies a write to the mirror, queues it for the server, and kicks a drain.
   * The mirror write is awaited so the call only resolves once the data is durable
   * on the device; the drain is not, so the UI never waits on the network.
   */
  private async write<T>(local: () => Promise<T>, op: PendingOp): Promise<T> {
    const result = await local();
    await this.outbox.enqueue(op);
    this.publish({ pending: await this.outbox.count() });
    void this.flush();
    return result;
  }

  /** Reads from the server when it is authoritative, and from the mirror otherwise. */
  private async read<T>(
    remote: () => Promise<T>,
    cache: (value: T) => Promise<void>,
    local: () => Promise<T>
  ): Promise<T> {
    if (await this.behind()) {
      void this.flush();
      return local();
    }
    try {
      const value = await remote();
      await cache(value);
      this.publish({ offline: false, lastError: null });
      return value;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      this.publish({
        offline: true,
        lastError: error instanceof Error ? error.message : String(error),
      });
      return local();
    }
  }

  // ------------------------------------------------------------------- library

  // Custom library rows take their id from the server, so they cannot be queued
  // without handing out an id that later changes. They stay online-only.
  async createSymptomType(input: CustomSymptomInput): Promise<SymptomType> {
    const row = await this.cloud.createSymptomType(input);
    await this.mirror.importAll({ ...emptySnapshot(), customSymptomTypes: [row] }, 'merge');
    return row;
  }

  async createFoodTag(input: CustomTagInput): Promise<FoodTag> {
    const row = await this.cloud.createFoodTag(input);
    await this.mirror.importAll({ ...emptySnapshot(), customFoodTags: [row] }, 'merge');
    return row;
  }

  listSymptomTypes(): Promise<SymptomType[]> {
    return this.read(
      () => this.cloud.listSymptomTypes(),
      async () => {},
      () => this.mirror.listSymptomTypes()
    );
  }

  listFoodTags(): Promise<FoodTag[]> {
    return this.read(
      () => this.cloud.listFoodTags(),
      async () => {},
      () => this.mirror.listFoodTags()
    );
  }

  // ------------------------------------------------------------------- profile

  getProfile(): Promise<Profile> {
    return this.read(
      () => this.cloud.getProfile(),
      (profile) => this.mirror.updateProfile(profile).then(() => {}),
      () => this.mirror.getProfile()
    );
  }

  updateProfile(
    patch: Partial<Pick<Profile, 'displayName' | 'timezone' | 'onboardedAt'>>
  ): Promise<Profile> {
    return this.write(() => this.mirror.updateProfile(patch), { kind: 'updateProfile', patch });
  }

  // ------------------------------------------------------------------- tracked

  listTrackedSymptoms(): Promise<TrackedSymptom[]> {
    return this.read(
      () => this.cloud.listTrackedSymptoms(),
      (rows) => this.mirror.setTrackedSymptoms(rows.map((r) => r.symptomTypeId)),
      () => this.mirror.listTrackedSymptoms()
    );
  }

  listTrackedTags(): Promise<TrackedTag[]> {
    return this.read(
      () => this.cloud.listTrackedTags(),
      (rows) => this.mirror.setTrackedTags(rows.map((r) => r.tagId)),
      () => this.mirror.listTrackedTags()
    );
  }

  async setTrackedSymptoms(ids: string[]): Promise<void> {
    await this.write(() => this.mirror.setTrackedSymptoms(ids), {
      kind: 'setTrackedSymptoms',
      ids,
    });
  }

  async setTrackedTags(ids: string[]): Promise<void> {
    await this.write(() => this.mirror.setTrackedTags(ids), { kind: 'setTrackedTags', ids });
  }

  // --------------------------------------------------------------------- meals

  listMeals(range?: DayRange): Promise<Meal[]> {
    return this.read(
      () => this.cloud.listMeals(range),
      (rows) => this.cacheRows({ meals: rows }),
      () => this.mirror.listMeals(range)
    );
  }

  saveMeal(input: MealInput): Promise<Meal> {
    // The id is settled here, before either the mirror or the queue sees the row.
    // Letting each of them mint its own would put a different id on the device than
    // the one the server upserts onto, and the meal would come back a second time on
    // the next read.
    const row = withId(input);
    return this.write(() => this.mirror.saveMeal(row), { kind: 'saveMeal', input: row });
  }

  async deleteMeal(id: string): Promise<void> {
    await this.write(() => this.mirror.deleteMeal(id), { kind: 'deleteMeal', id });
  }

  // ------------------------------------------------------------------ symptoms

  listSymptomLogs(range?: DayRange): Promise<SymptomLog[]> {
    return this.read(
      () => this.cloud.listSymptomLogs(range),
      (rows) => this.cacheRows({ symptomLogs: rows }),
      () => this.mirror.listSymptomLogs(range)
    );
  }

  saveSymptomLog(input: SymptomLogInput): Promise<SymptomLog> {
    const row = withId(input);
    return this.write(() => this.mirror.saveSymptomLog(row), {
      kind: 'saveSymptomLog',
      input: row,
    });
  }

  async deleteSymptomLog(id: string): Promise<void> {
    await this.write(() => this.mirror.deleteSymptomLog(id), { kind: 'deleteSymptomLog', id });
  }

  // --------------------------------------------------------------------- daily

  listDailyFactors(range?: DayRange): Promise<DailyFactors[]> {
    return this.read(
      () => this.cloud.listDailyFactors(range),
      (rows) => this.cacheRows({ dailyFactors: rows }),
      () => this.mirror.listDailyFactors(range)
    );
  }

  saveDailyFactors(input: DailyFactors): Promise<DailyFactors> {
    return this.write(() => this.mirror.saveDailyFactors(input), {
      kind: 'saveDailyFactors',
      input,
    });
  }

  // ---------------------------------------------------------------- challenges

  listChallenges(): Promise<Challenge[]> {
    return this.read(
      () => this.cloud.listChallenges(),
      (rows) => this.cacheRows({ challenges: rows }),
      () => this.mirror.listChallenges()
    );
  }

  saveChallenge(input: ChallengeInput): Promise<Challenge> {
    const row = withId(input);
    return this.write(() => this.mirror.saveChallenge(row), { kind: 'saveChallenge', input: row });
  }

  async deleteChallenge(id: string): Promise<void> {
    await this.write(() => this.mirror.deleteChallenge(id), { kind: 'deleteChallenge', id });
  }

  // -------------------------------------------------------------- bulk / admin

  async exportAll(): Promise<Snapshot> {
    // A backup taken while writes are queued would silently omit them, so drain
    // first and fall back to the mirror — which does contain them — if that fails.
    await this.flush();
    if (await this.behind()) return this.mirror.exportAll();
    try {
      return await this.cloud.exportAll();
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return this.mirror.exportAll();
    }
  }

  async importAll(snapshot: Snapshot, mode: 'merge' | 'replace'): Promise<ImportResult> {
    const result = await this.cloud.importAll(snapshot, mode);
    await this.mirror.importAll(snapshot, mode);
    return result;
  }

  async clearAll(): Promise<void> {
    await this.cloud.clearAll();
    await this.mirror.clearAll();
    await this.outbox.clear();
    this.publish({ ...IDLE_SYNC_STATE });
  }

  // ------------------------------------------------------------------ internals

  /** Writes server rows into the mirror without disturbing anything else. */
  private async cacheRows(partial: Partial<Snapshot>): Promise<void> {
    await this.mirror.importAll({ ...emptySnapshot(), ...partial }, 'merge');
  }

  /** Test and UI hook: the queue, without reaching through the store. */
  async syncState(): Promise<SyncState> {
    return {
      ...this.state,
      pending: await this.outbox.count(),
      abandoned: (await this.outbox.abandoned()).length,
    };
  }
}

/** Settles a client-generated id before the row is split between mirror and queue. */
function withId<T extends { id?: string }>(input: T): T & { id: string } {
  return { ...input, id: input.id ?? uuidv4() };
}
