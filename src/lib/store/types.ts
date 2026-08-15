/**
 * The storage contract.
 *
 * Two implementations exist and must stay interchangeable:
 *   - LocalStore  (IndexedDB) — used before sign-in, so the app is fully usable
 *                 without handing symptom data to a server.
 *   - CloudStore  (Supabase)  — used after sign-in, gated by row-level security.
 *
 * Keeping local mode behind the same interface is what stops it becoming a second
 * codebase. It also makes the sign-in migration trivial:
 *
 *     await cloud.importAll(await local.exportAll(), 'merge')
 *
 * Curated library rows never travel — both backends derive them from slugs via
 * lib/library.ts, so ids already match. Only user-created rows are carried across.
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

/** Inclusive range of calendar days, `YYYY-MM-DD`. Omit to fetch everything. */
export interface DayRange {
  from?: string;
  to?: string;
}

export type MealInput = Omit<Meal, 'id'> & { id?: string };
export type SymptomLogInput = Omit<SymptomLog, 'id'> & { id?: string };
export type ChallengeInput = Omit<Challenge, 'id'> & { id?: string };
export type CustomSymptomInput = Pick<SymptomType, 'name' | 'category' | 'scale'> & {
  description?: string | null;
};
export type CustomTagInput = Pick<FoodTag, 'name'> & {
  description?: string | null;
  aliases?: string[];
};

export interface DataStore {
  readonly kind: 'local' | 'cloud';

  /** Curated library plus this user's custom rows, sorted for display. */
  listSymptomTypes(): Promise<SymptomType[]>;
  listFoodTags(): Promise<FoodTag[]>;
  createSymptomType(input: CustomSymptomInput): Promise<SymptomType>;
  createFoodTag(input: CustomTagInput): Promise<FoodTag>;

  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Pick<Profile, 'displayName' | 'timezone' | 'onboardedAt'>>): Promise<Profile>;

  listTrackedSymptoms(): Promise<TrackedSymptom[]>;
  listTrackedTags(): Promise<TrackedTag[]>;
  /** Replaces the tracked set wholesale, in the order given. */
  setTrackedSymptoms(symptomTypeIds: string[]): Promise<void>;
  setTrackedTags(tagIds: string[]): Promise<void>;

  listMeals(range?: DayRange): Promise<Meal[]>;
  saveMeal(input: MealInput): Promise<Meal>;
  deleteMeal(id: string): Promise<void>;

  listSymptomLogs(range?: DayRange): Promise<SymptomLog[]>;
  saveSymptomLog(input: SymptomLogInput): Promise<SymptomLog>;
  deleteSymptomLog(id: string): Promise<void>;

  listDailyFactors(range?: DayRange): Promise<DailyFactors[]>;
  saveDailyFactors(input: DailyFactors): Promise<DailyFactors>;

  listChallenges(): Promise<Challenge[]>;
  saveChallenge(input: ChallengeInput): Promise<Challenge>;
  deleteChallenge(id: string): Promise<void>;

  exportAll(): Promise<Snapshot>;
  /**
   * `merge` keeps existing rows and adds incoming ones, last-write-wins on id.
   * `replace` clears the user's data first. Curated library rows are untouched.
   */
  importAll(snapshot: Snapshot, mode: 'merge' | 'replace'): Promise<ImportResult>;
  /** Removes all of this user's data. Used by `replace` imports and by "delete my data". */
  clearAll(): Promise<void>;
}

export function emptySnapshot(): Snapshot {
  return {
    app: 'gut-tracker',
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: null,
    customSymptomTypes: [],
    customFoodTags: [],
    trackedSymptoms: [],
    trackedTags: [],
    meals: [],
    symptomLogs: [],
    dailyFactors: [],
    challenges: [],
  };
}

export function emptyImportResult(): ImportResult {
  return {
    meals: 0,
    symptomLogs: 0,
    customSymptomTypes: 0,
    customFoodTags: 0,
    challenges: 0,
    skipped: 0,
  };
}

/** Filters a list of dated rows by an optional inclusive day range. */
export function inRange<T extends { occurredOn?: string; day?: string }>(
  rows: T[],
  range?: DayRange
): T[] {
  if (!range || (!range.from && !range.to)) return rows;
  return rows.filter((row) => {
    const day = row.occurredOn ?? row.day ?? '';
    if (range.from && day < range.from) return false;
    if (range.to && day > range.to) return false;
    return true;
  });
}
