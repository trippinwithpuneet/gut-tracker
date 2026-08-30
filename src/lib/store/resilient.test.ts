import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Meal, Snapshot, SymptomLog } from '../types';
import { LocalStore } from './local';
import { MAX_ATTEMPTS, Outbox } from './outbox';
import { ResilientStore, isOfflineError } from './resilient';
import type { DataStore } from './types';

/**
 * A stand-in for CloudStore whose connection can be cut.
 *
 * It is a LocalStore underneath, so replayed writes really do land somewhere and the
 * assertions can check the server's view rather than a call log.
 */
class FlakyStore implements DataStore {
  readonly kind = 'cloud' as const;
  offline = false;
  reject: string | null = null;
  calls = 0;
  /** Counted separately so a test can tell a read from a drain's write. */
  listMealCalls = 0;

  constructor(private readonly inner: DataStore) {}

  private gate() {
    this.calls++;
    if (this.offline) throw new Error('TypeError: Failed to fetch');
    if (this.reject) throw new Error(this.reject);
  }

  listSymptomTypes() { this.gate(); return this.inner.listSymptomTypes(); }
  listFoodTags() { this.gate(); return this.inner.listFoodTags(); }
  createSymptomType(i: Parameters<DataStore['createSymptomType']>[0]) { this.gate(); return this.inner.createSymptomType(i); }
  createFoodTag(i: Parameters<DataStore['createFoodTag']>[0]) { this.gate(); return this.inner.createFoodTag(i); }
  getProfile() { this.gate(); return this.inner.getProfile(); }
  updateProfile(p: Parameters<DataStore['updateProfile']>[0]) { this.gate(); return this.inner.updateProfile(p); }
  listTrackedSymptoms() { this.gate(); return this.inner.listTrackedSymptoms(); }
  listTrackedTags() { this.gate(); return this.inner.listTrackedTags(); }
  setTrackedSymptoms(ids: string[]) { this.gate(); return this.inner.setTrackedSymptoms(ids); }
  setTrackedTags(ids: string[]) { this.gate(); return this.inner.setTrackedTags(ids); }
  listMeals(r?: Parameters<DataStore['listMeals']>[0]) { this.listMealCalls++; this.gate(); return this.inner.listMeals(r); }
  saveMeal(i: Parameters<DataStore['saveMeal']>[0]) { this.gate(); return this.inner.saveMeal(i); }
  deleteMeal(id: string) { this.gate(); return this.inner.deleteMeal(id); }
  listSymptomLogs(r?: Parameters<DataStore['listSymptomLogs']>[0]) { this.gate(); return this.inner.listSymptomLogs(r); }
  saveSymptomLog(i: Parameters<DataStore['saveSymptomLog']>[0]) { this.gate(); return this.inner.saveSymptomLog(i); }
  deleteSymptomLog(id: string) { this.gate(); return this.inner.deleteSymptomLog(id); }
  listDailyFactors(r?: Parameters<DataStore['listDailyFactors']>[0]) { this.gate(); return this.inner.listDailyFactors(r); }
  saveDailyFactors(i: Parameters<DataStore['saveDailyFactors']>[0]) { this.gate(); return this.inner.saveDailyFactors(i); }
  listChallenges() { this.gate(); return this.inner.listChallenges(); }
  saveChallenge(i: Parameters<DataStore['saveChallenge']>[0]) { this.gate(); return this.inner.saveChallenge(i); }
  deleteChallenge(id: string) { this.gate(); return this.inner.deleteChallenge(id); }
  exportAll() { this.gate(); return this.inner.exportAll(); }
  importAll(s: Snapshot, m: 'merge' | 'replace') { this.gate(); return this.inner.importAll(s, m); }
  clearAll() { this.gate(); return this.inner.clearAll(); }
}

const meal = (description: string, day = '2026-08-20') => ({
  occurredOn: day,
  occurredAt: null,
  slot: 'lunch' as const,
  description,
  isOutside: false,
  notes: null,
  tagIds: [],
});

let seq = 0;
function freshStore() {
  seq++;
  const server = new FlakyStore(new LocalStore(`server-${seq}`));
  const store = new ResilientStore(server, `user-${seq}`);
  return { server, store };
}

describe('isOfflineError', () => {
  it('recognises the shapes browsers actually produce', () => {
    for (const message of [
      'TypeError: Failed to fetch',
      'Load failed',
      'Network request failed',
      'NetworkError when attempting to fetch resource',
      'fetch failed',
    ]) {
      expect(isOfflineError(new Error(message))).toBe(true);
    }
  });

  it('does not mistake a server rejection for a dead network', () => {
    expect(isOfflineError(new Error('save meal: new row violates row-level security'))).toBe(false);
    expect(isOfflineError(new Error('save meal: duplicate key value'))).toBe(false);
  });
});

describe('ResilientStore', () => {
  beforeEach(() => {
    seq++;
  });

  it('accepts a write while offline and reads it back', async () => {
    const { server, store } = freshStore();
    server.offline = true;

    const saved = await store.saveMeal(meal('paneer, no onion'));
    expect(saved.id).toBeTruthy();

    const meals = await store.listMeals();
    expect(meals.map((m) => m.description)).toEqual(['paneer, no onion']);
    expect((await store.syncState()).pending).toBe(1);
  });

  it('delivers queued writes once the connection returns', async () => {
    const { server, store } = freshStore();
    server.offline = true;
    await store.saveMeal(meal('dal'));
    await store.saveMeal(meal('rice'));
    expect((await store.syncState()).pending).toBe(2);

    server.offline = false;
    await store.flush();

    expect((await store.syncState()).pending).toBe(0);
    const onServer = await server.listMeals();
    expect(onServer.map((m) => m.description).sort()).toEqual(['dal', 'rice']);
  });

  it('keeps one id for a row, so replay upserts instead of duplicating', async () => {
    const { server, store } = freshStore();
    server.offline = true;
    const saved = await store.saveMeal(meal('khichdi'));
    server.offline = false;
    await store.flush();

    const onServer = await server.listMeals();
    expect(onServer).toHaveLength(1);
    expect(onServer[0].id).toBe(saved.id);
  });

  it('replays in the order the user made the changes', async () => {
    const { server, store } = freshStore();
    server.offline = true;
    const saved = await store.saveMeal(meal('soup'));
    await store.deleteMeal(saved.id);

    server.offline = false;
    await store.flush();

    // Replayed backwards this leaves a row the user deleted.
    expect(await server.listMeals()).toHaveLength(0);
    expect(await store.listMeals()).toHaveLength(0);
  });

  it('prefers the mirror while the server is behind', async () => {
    const { server, store } = freshStore();

    // A row that exists only on the server, to prove which side answered.
    await server.saveMeal(meal('server-only'));

    server.offline = true;
    await store.saveMeal(meal('offline entry'));
    server.offline = false;

    // The queue is not drained yet, so the server's answer would be missing the
    // row the user just typed. The mirror has to win here.
    const before = server.listMealCalls;
    const meals = await store.listMeals();
    expect(meals.map((m) => m.description)).toContain('offline entry');
    expect(meals.map((m) => m.description)).not.toContain('server-only');
    expect(server.listMealCalls).toBe(before);
  });

  it('gives up on a row the server keeps refusing, without wedging the queue', async () => {
    const { server, store } = freshStore();
    server.offline = true;
    await store.saveMeal(meal('poisoned'));

    server.offline = false;
    server.reject = 'save meal: new row violates row-level security policy';
    for (let i = 0; i < MAX_ATTEMPTS; i++) await store.flush();

    const state = await store.syncState();
    expect(state.pending).toBe(0);
    expect(state.abandoned).toBe(1);

    // A good write queued afterwards still gets through.
    server.reject = null;
    await store.saveMeal(meal('fine'));
    await store.flush();
    expect((await server.listMeals()).map((m) => m.description)).toEqual(['fine']);
  });

  it('exports the queued rows rather than a stale server copy', async () => {
    const { server, store } = freshStore();
    server.offline = true;
    await store.saveMeal(meal('unsent'));

    const snapshot = await store.exportAll();
    expect(snapshot.meals.map((m: Meal) => m.description)).toEqual(['unsent']);
  });

  it('falls back to the mirror for reads when the network dies mid-session', async () => {
    const { server, store } = freshStore();
    await store.saveMeal(meal('logged online'));
    await store.flush();
    expect((await store.syncState()).pending).toBe(0);

    server.offline = true;
    const meals = await store.listMeals();
    expect(meals.map((m: Meal) => m.description)).toEqual(['logged online']);
  });

  it('queues symptom logs with a settled id too', async () => {
    const { server, store } = freshStore();
    server.offline = true;
    const log = await store.saveSymptomLog({
      symptomTypeId: 'sym-1',
      occurredOn: '2026-08-20',
      occurredAt: null,
      severity: 3,
      notes: null,
    });
    server.offline = false;
    await store.flush();

    const rows: SymptomLog[] = await server.listSymptomLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(log.id);
  });
});

describe('Outbox', () => {
  it('survives being reopened, so a queued write outlives a refresh', async () => {
    const name = `outbox-persist-${Date.now()}`;
    const first = new Outbox(name);
    await first.enqueue({ kind: 'deleteMeal', id: 'abc' });

    const second = new Outbox(name);
    expect(await second.count()).toBe(1);
    expect((await second.pending())[0].op).toEqual({ kind: 'deleteMeal', id: 'abc' });
  });
});
