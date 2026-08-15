/**
 * IndexedDB-backed store — the app before you sign in.
 *
 * Everything here stays on the device. Nothing is transmitted. Signing in later
 * copies this data to the cloud via exportAll/importAll; nothing is lost and the
 * user can decline sign-in forever and still get the full product.
 *
 * IndexedDB rather than localStorage because a year of per-meal logging is tens of
 * thousands of rows and localStorage is a synchronous 5MB string bucket.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { CURATED_FOOD_TAGS, CURATED_SYMPTOM_TYPES } from '../library';
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
import {
  emptyImportResult,
  inRange,
  type ChallengeInput,
  type CustomSymptomInput,
  type CustomTagInput,
  type DataStore,
  type DayRange,
  type MealInput,
  type SymptomLogInput,
} from './types';

const DB_NAME = 'gut-tracker';
const DB_VERSION = 1;

interface GutDB extends DBSchema {
  meta: { key: string; value: unknown };
  customSymptomTypes: { key: string; value: SymptomType };
  customFoodTags: { key: string; value: FoodTag };
  trackedSymptoms: { key: string; value: TrackedSymptom };
  trackedTags: { key: string; value: TrackedTag };
  meals: { key: string; value: Meal; indexes: { occurredOn: string } };
  symptomLogs: { key: string; value: SymptomLog; indexes: { occurredOn: string } };
  dailyFactors: { key: string; value: DailyFactors };
  challenges: { key: string; value: Challenge };
}

const USER_STORES = [
  'customSymptomTypes',
  'customFoodTags',
  'trackedSymptoms',
  'trackedTags',
  'meals',
  'symptomLogs',
  'dailyFactors',
  'challenges',
] as const;

let dbPromise: Promise<IDBPDatabase<GutDB>> | null = null;

function db(): Promise<IDBPDatabase<GutDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GutDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore('meta');
        database.createObjectStore('customSymptomTypes', { keyPath: 'id' });
        database.createObjectStore('customFoodTags', { keyPath: 'id' });
        database.createObjectStore('trackedSymptoms', { keyPath: 'symptomTypeId' });
        database.createObjectStore('trackedTags', { keyPath: 'tagId' });
        database
          .createObjectStore('meals', { keyPath: 'id' })
          .createIndex('occurredOn', 'occurredOn');
        database
          .createObjectStore('symptomLogs', { keyPath: 'id' })
          .createIndex('occurredOn', 'occurredOn');
        database.createObjectStore('dailyFactors', { keyPath: 'day' });
        database.createObjectStore('challenges', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

const bySortOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'custom';

const DEFAULT_PROFILE: Profile = {
  id: 'local',
  displayName: null,
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  onboardedAt: null,
};

export class LocalStore implements DataStore {
  readonly kind = 'local' as const;

  async listSymptomTypes(): Promise<SymptomType[]> {
    const custom = await (await db()).getAll('customSymptomTypes');
    return [...CURATED_SYMPTOM_TYPES, ...custom].sort(bySortOrder);
  }

  async listFoodTags(): Promise<FoodTag[]> {
    const custom = await (await db()).getAll('customFoodTags');
    return [...CURATED_FOOD_TAGS, ...custom].sort(bySortOrder);
  }

  async createSymptomType(input: CustomSymptomInput): Promise<SymptomType> {
    const row: SymptomType = {
      id: uuidv4(),
      userId: 'local',
      slug: slugify(input.name),
      name: input.name.trim(),
      description: input.description ?? null,
      category: input.category,
      scale: input.scale,
      isRedFlag: false,
      sortOrder: 1000,
    };
    await (await db()).put('customSymptomTypes', row);
    return row;
  }

  async createFoodTag(input: CustomTagInput): Promise<FoodTag> {
    const row: FoodTag = {
      id: uuidv4(),
      userId: 'local',
      slug: slugify(input.name),
      name: input.name.trim(),
      description: input.description ?? null,
      category: 'custom',
      aliases: input.aliases ?? [],
      sortOrder: 1000,
    };
    await (await db()).put('customFoodTags', row);
    return row;
  }

  async getProfile(): Promise<Profile> {
    const stored = (await (await db()).get('meta', 'profile')) as Profile | undefined;
    return stored ?? DEFAULT_PROFILE;
  }

  async updateProfile(
    patch: Partial<Pick<Profile, 'displayName' | 'timezone' | 'onboardedAt'>>
  ): Promise<Profile> {
    const next = { ...(await this.getProfile()), ...patch };
    await (await db()).put('meta', next, 'profile');
    return next;
  }

  async listTrackedSymptoms(): Promise<TrackedSymptom[]> {
    const rows = await (await db()).getAll('trackedSymptoms');
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async listTrackedTags(): Promise<TrackedTag[]> {
    const rows = await (await db()).getAll('trackedTags');
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async setTrackedSymptoms(symptomTypeIds: string[]): Promise<void> {
    const tx = (await db()).transaction('trackedSymptoms', 'readwrite');
    await tx.store.clear();
    await Promise.all(
      symptomTypeIds.map((symptomTypeId, index) =>
        tx.store.put({ symptomTypeId, sortOrder: (index + 1) * 10, isActive: true })
      )
    );
    await tx.done;
  }

  async setTrackedTags(tagIds: string[]): Promise<void> {
    const tx = (await db()).transaction('trackedTags', 'readwrite');
    await tx.store.clear();
    await Promise.all(
      tagIds.map((tagId, index) =>
        tx.store.put({ tagId, sortOrder: (index + 1) * 10, isActive: true })
      )
    );
    await tx.done;
  }

  async listMeals(range?: DayRange): Promise<Meal[]> {
    const rows = await (await db()).getAll('meals');
    return inRange(rows, range).sort(byRecency);
  }

  async saveMeal(input: MealInput): Promise<Meal> {
    const row: Meal = { ...input, id: input.id ?? uuidv4() };
    await (await db()).put('meals', row);
    return row;
  }

  async deleteMeal(id: string): Promise<void> {
    await (await db()).delete('meals', id);
  }

  async listSymptomLogs(range?: DayRange): Promise<SymptomLog[]> {
    const rows = await (await db()).getAll('symptomLogs');
    return inRange(rows, range).sort(byRecency);
  }

  async saveSymptomLog(input: SymptomLogInput): Promise<SymptomLog> {
    const row: SymptomLog = { ...input, id: input.id ?? uuidv4() };
    await (await db()).put('symptomLogs', row);
    return row;
  }

  async deleteSymptomLog(id: string): Promise<void> {
    await (await db()).delete('symptomLogs', id);
  }

  async listDailyFactors(range?: DayRange): Promise<DailyFactors[]> {
    const rows = await (await db()).getAll('dailyFactors');
    return inRange(rows, range).sort((a, b) => b.day.localeCompare(a.day));
  }

  async saveDailyFactors(input: DailyFactors): Promise<DailyFactors> {
    await (await db()).put('dailyFactors', input);
    return input;
  }

  async listChallenges(): Promise<Challenge[]> {
    const rows = await (await db()).getAll('challenges');
    return rows.sort((a, b) => b.startedOn.localeCompare(a.startedOn));
  }

  async saveChallenge(input: ChallengeInput): Promise<Challenge> {
    const row: Challenge = { ...input, id: input.id ?? uuidv4() };
    await (await db()).put('challenges', row);
    return row;
  }

  async deleteChallenge(id: string): Promise<void> {
    await (await db()).delete('challenges', id);
  }

  async exportAll(): Promise<Snapshot> {
    const database = await db();
    const [
      profile,
      customSymptomTypes,
      customFoodTags,
      trackedSymptoms,
      trackedTags,
      meals,
      symptomLogs,
      dailyFactors,
      challenges,
    ] = await Promise.all([
      this.getProfile(),
      database.getAll('customSymptomTypes'),
      database.getAll('customFoodTags'),
      database.getAll('trackedSymptoms'),
      database.getAll('trackedTags'),
      database.getAll('meals'),
      database.getAll('symptomLogs'),
      database.getAll('dailyFactors'),
      database.getAll('challenges'),
    ]);

    return {
      app: 'gut-tracker',
      version: 2,
      exportedAt: new Date().toISOString(),
      profile: {
        displayName: profile.displayName,
        timezone: profile.timezone,
        onboardedAt: profile.onboardedAt,
      },
      customSymptomTypes,
      customFoodTags,
      trackedSymptoms,
      trackedTags,
      meals,
      symptomLogs,
      dailyFactors,
      challenges,
    };
  }

  async importAll(snapshot: Snapshot, mode: 'merge' | 'replace'): Promise<ImportResult> {
    if (mode === 'replace') await this.clearAll();

    const database = await db();
    const result = emptyImportResult();

    const put = async <S extends (typeof USER_STORES)[number]>(
      store: S,
      rows: unknown[]
    ): Promise<number> => {
      const tx = database.transaction(store, 'readwrite');
      let n = 0;
      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.store.put(row as any);
        n++;
      }
      await tx.done;
      return n;
    };

    result.customSymptomTypes = await put('customSymptomTypes', snapshot.customSymptomTypes ?? []);
    result.customFoodTags = await put('customFoodTags', snapshot.customFoodTags ?? []);
    await put('trackedSymptoms', snapshot.trackedSymptoms ?? []);
    await put('trackedTags', snapshot.trackedTags ?? []);
    result.meals = await put('meals', snapshot.meals ?? []);
    result.symptomLogs = await put('symptomLogs', snapshot.symptomLogs ?? []);
    await put('dailyFactors', snapshot.dailyFactors ?? []);
    result.challenges = await put('challenges', snapshot.challenges ?? []);

    if (snapshot.profile) await this.updateProfile(snapshot.profile);
    return result;
  }

  async clearAll(): Promise<void> {
    const database = await db();
    const tx = database.transaction([...USER_STORES], 'readwrite');
    await Promise.all(USER_STORES.map((store) => tx.objectStore(store).clear()));
    await tx.done;
    await database.delete('meta', 'profile');
  }
}

/** Newest first, using the timestamp when present and the day otherwise. */
function byRecency(
  a: { occurredOn: string; occurredAt: string | null },
  b: { occurredOn: string; occurredAt: string | null }
): number {
  const dayDiff = b.occurredOn.localeCompare(a.occurredOn);
  if (dayDiff !== 0) return dayDiff;
  if (a.occurredAt && b.occurredAt) return b.occurredAt.localeCompare(a.occurredAt);
  if (a.occurredAt) return -1;
  if (b.occurredAt) return 1;
  return 0;
}

/** True when there is anything worth offering to migrate at sign-in. */
export async function localStoreHasData(): Promise<boolean> {
  try {
    const database = await db();
    const [meals, logs] = await Promise.all([
      database.count('meals'),
      database.count('symptomLogs'),
    ]);
    return meals > 0 || logs > 0;
  } catch {
    return false;
  }
}
