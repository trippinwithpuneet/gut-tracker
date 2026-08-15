/**
 * Supabase-backed store — the app once you sign in.
 *
 * Every write stamps user_id, which is also what row-level security checks, so a
 * bug here fails closed rather than leaking across accounts.
 *
 * Rows cross the boundary through the map* functions at the bottom. They are the
 * only place snake_case database columns become camelCase domain objects; keeping
 * that in one spot is what lets the rest of the app stay ignorant of Postgres.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
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
  type ChallengeInput,
  type CustomSymptomInput,
  type CustomTagInput,
  type DataStore,
  type DayRange,
  type MealInput,
  type SymptomLogInput,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'custom';

/** Throws on a Supabase error so callers never silently operate on empty data. */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

export class CloudStore implements DataStore {
  readonly kind = 'cloud' as const;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string
  ) {}

  private applyRange(query: any, column: string, range?: DayRange) {
    if (range?.from) query = query.gte(column, range.from);
    if (range?.to) query = query.lte(column, range.to);
    return query;
  }

  async listSymptomTypes(): Promise<SymptomType[]> {
    // RLS returns curated rows (user_id null) plus this user's own in one query.
    const res = await this.supabase
      .from('symptom_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    return unwrap<any[]>(res, 'load symptom types').map(mapSymptomType);
  }

  async listFoodTags(): Promise<FoodTag[]> {
    const res = await this.supabase
      .from('food_tags')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    return unwrap<any[]>(res, 'load food tags').map(mapFoodTag);
  }

  async createSymptomType(input: CustomSymptomInput): Promise<SymptomType> {
    const res = await this.supabase
      .from('symptom_types')
      .insert({
        user_id: this.userId,
        slug: slugify(input.name),
        name: input.name.trim(),
        description: input.description ?? null,
        category: input.category,
        scale: input.scale,
        sort_order: 1000,
      })
      .select()
      .single();
    if (res.error) throw new Error(`create symptom type: ${res.error.message}`);
    return mapSymptomType(res.data);
  }

  async createFoodTag(input: CustomTagInput): Promise<FoodTag> {
    const res = await this.supabase
      .from('food_tags')
      .insert({
        user_id: this.userId,
        slug: slugify(input.name),
        name: input.name.trim(),
        description: input.description ?? null,
        category: 'custom',
        aliases: input.aliases ?? [],
        sort_order: 1000,
      })
      .select()
      .single();
    if (res.error) throw new Error(`create food tag: ${res.error.message}`);
    return mapFoodTag(res.data);
  }

  async getProfile(): Promise<Profile> {
    const res = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .maybeSingle();
    if (res.error) throw new Error(`load profile: ${res.error.message}`);

    // The auth trigger normally creates this row; upsert covers accounts that
    // predate the trigger or were restored from a backup.
    if (!res.data) {
      const created = await this.supabase
        .from('profiles')
        .upsert({ id: this.userId })
        .select()
        .single();
      if (created.error) throw new Error(`create profile: ${created.error.message}`);
      return mapProfile(created.data);
    }
    return mapProfile(res.data);
  }

  async updateProfile(
    patch: Partial<Pick<Profile, 'displayName' | 'timezone' | 'onboardedAt'>>
  ): Promise<Profile> {
    const row: Record<string, unknown> = { id: this.userId };
    if ('displayName' in patch) row.display_name = patch.displayName;
    if ('timezone' in patch) row.timezone = patch.timezone;
    if ('onboardedAt' in patch) row.onboarded_at = patch.onboardedAt;

    const res = await this.supabase.from('profiles').upsert(row).select().single();
    if (res.error) throw new Error(`update profile: ${res.error.message}`);
    return mapProfile(res.data);
  }

  async listTrackedSymptoms(): Promise<TrackedSymptom[]> {
    const res = await this.supabase
      .from('tracked_symptoms')
      .select('*')
      .order('sort_order', { ascending: true });
    return unwrap<any[]>(res, 'load tracked symptoms').map((r) => ({
      symptomTypeId: r.symptom_type_id,
      sortOrder: r.sort_order,
      isActive: r.is_active,
    }));
  }

  async listTrackedTags(): Promise<TrackedTag[]> {
    const res = await this.supabase
      .from('tracked_tags')
      .select('*')
      .order('sort_order', { ascending: true });
    return unwrap<any[]>(res, 'load tracked tags').map((r) => ({
      tagId: r.tag_id,
      sortOrder: r.sort_order,
      isActive: r.is_active,
    }));
  }

  async setTrackedSymptoms(symptomTypeIds: string[]): Promise<void> {
    const del = await this.supabase.from('tracked_symptoms').delete().eq('user_id', this.userId);
    if (del.error) throw new Error(`clear tracked symptoms: ${del.error.message}`);
    if (symptomTypeIds.length === 0) return;

    const ins = await this.supabase.from('tracked_symptoms').insert(
      symptomTypeIds.map((symptom_type_id, index) => ({
        user_id: this.userId,
        symptom_type_id,
        sort_order: (index + 1) * 10,
        is_active: true,
      }))
    );
    if (ins.error) throw new Error(`save tracked symptoms: ${ins.error.message}`);
  }

  async setTrackedTags(tagIds: string[]): Promise<void> {
    const del = await this.supabase.from('tracked_tags').delete().eq('user_id', this.userId);
    if (del.error) throw new Error(`clear tracked tags: ${del.error.message}`);
    if (tagIds.length === 0) return;

    const ins = await this.supabase.from('tracked_tags').insert(
      tagIds.map((tag_id, index) => ({
        user_id: this.userId,
        tag_id,
        sort_order: (index + 1) * 10,
        is_active: true,
      }))
    );
    if (ins.error) throw new Error(`save tracked tags: ${ins.error.message}`);
  }

  async listMeals(range?: DayRange): Promise<Meal[]> {
    let query = this.supabase
      .from('meals')
      .select('*, meal_tags(tag_id)')
      .order('occurred_on', { ascending: false })
      .order('occurred_at', { ascending: false, nullsFirst: false });
    query = this.applyRange(query, 'occurred_on', range);
    return unwrap<any[]>(await query, 'load meals').map(mapMeal);
  }

  async saveMeal(input: MealInput): Promise<Meal> {
    const id = input.id ?? uuidv4();

    const res = await this.supabase
      .from('meals')
      .upsert({
        id,
        user_id: this.userId,
        occurred_on: input.occurredOn,
        occurred_at: input.occurredAt,
        slot: input.slot,
        description: input.description,
        is_outside: input.isOutside,
        notes: input.notes,
      })
      .select()
      .single();
    if (res.error) throw new Error(`save meal: ${res.error.message}`);

    // Tags are replaced wholesale. A meal carries a handful of tags, so the
    // delete-then-insert is cheaper than diffing and cannot drift out of sync.
    const del = await this.supabase.from('meal_tags').delete().eq('meal_id', id);
    if (del.error) throw new Error(`clear meal tags: ${del.error.message}`);

    if (input.tagIds.length > 0) {
      const ins = await this.supabase.from('meal_tags').insert(
        input.tagIds.map((tag_id) => ({ meal_id: id, tag_id, user_id: this.userId }))
      );
      if (ins.error) throw new Error(`save meal tags: ${ins.error.message}`);
    }

    return { ...mapMeal(res.data), tagIds: input.tagIds };
  }

  async deleteMeal(id: string): Promise<void> {
    const res = await this.supabase.from('meals').delete().eq('id', id);
    if (res.error) throw new Error(`delete meal: ${res.error.message}`);
  }

  async listSymptomLogs(range?: DayRange): Promise<SymptomLog[]> {
    let query = this.supabase
      .from('symptom_logs')
      .select('*')
      .order('occurred_on', { ascending: false })
      .order('occurred_at', { ascending: false, nullsFirst: false });
    query = this.applyRange(query, 'occurred_on', range);
    return unwrap<any[]>(await query, 'load symptom logs').map(mapSymptomLog);
  }

  async saveSymptomLog(input: SymptomLogInput): Promise<SymptomLog> {
    const res = await this.supabase
      .from('symptom_logs')
      .upsert({
        id: input.id ?? uuidv4(),
        user_id: this.userId,
        symptom_type_id: input.symptomTypeId,
        occurred_on: input.occurredOn,
        occurred_at: input.occurredAt,
        severity: input.severity,
        notes: input.notes,
      })
      .select()
      .single();
    if (res.error) throw new Error(`save symptom log: ${res.error.message}`);
    return mapSymptomLog(res.data);
  }

  async deleteSymptomLog(id: string): Promise<void> {
    const res = await this.supabase.from('symptom_logs').delete().eq('id', id);
    if (res.error) throw new Error(`delete symptom log: ${res.error.message}`);
  }

  async listDailyFactors(range?: DayRange): Promise<DailyFactors[]> {
    let query = this.supabase.from('daily_factors').select('*').order('day', { ascending: false });
    query = this.applyRange(query, 'day', range);
    return unwrap<any[]>(await query, 'load daily factors').map(mapDailyFactors);
  }

  async saveDailyFactors(input: DailyFactors): Promise<DailyFactors> {
    const res = await this.supabase
      .from('daily_factors')
      .upsert({
        user_id: this.userId,
        day: input.day,
        sleep_hours: input.sleepHours,
        stress: input.stress,
        exercised: input.exercised,
        medication: input.medication,
        menstrual_phase: input.menstrualPhase,
        notes: input.notes,
      })
      .select()
      .single();
    if (res.error) throw new Error(`save daily factors: ${res.error.message}`);
    return mapDailyFactors(res.data);
  }

  async listChallenges(): Promise<Challenge[]> {
    const res = await this.supabase
      .from('challenges')
      .select('*')
      .order('started_on', { ascending: false });
    return unwrap<any[]>(res, 'load challenges').map(mapChallenge);
  }

  async saveChallenge(input: ChallengeInput): Promise<Challenge> {
    const res = await this.supabase
      .from('challenges')
      .upsert({
        id: input.id ?? uuidv4(),
        user_id: this.userId,
        tag_id: input.tagId,
        exclude_tag_id: input.excludeTagId,
        symptom_type_id: input.symptomTypeId,
        status: input.status,
        target_exposures: input.targetExposures,
        started_on: input.startedOn,
        ended_on: input.endedOn,
        verdict: input.verdict,
        notes: input.notes,
      })
      .select()
      .single();
    if (res.error) throw new Error(`save challenge: ${res.error.message}`);
    return mapChallenge(res.data);
  }

  async deleteChallenge(id: string): Promise<void> {
    const res = await this.supabase.from('challenges').delete().eq('id', id);
    if (res.error) throw new Error(`delete challenge: ${res.error.message}`);
  }

  async exportAll(): Promise<Snapshot> {
    const [
      profile,
      symptomTypes,
      foodTags,
      trackedSymptoms,
      trackedTags,
      meals,
      symptomLogs,
      dailyFactors,
      challenges,
    ] = await Promise.all([
      this.getProfile(),
      this.listSymptomTypes(),
      this.listFoodTags(),
      this.listTrackedSymptoms(),
      this.listTrackedTags(),
      this.listMeals(),
      this.listSymptomLogs(),
      this.listDailyFactors(),
      this.listChallenges(),
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
      // Curated rows are reconstructed from slugs on import, so only custom travels.
      customSymptomTypes: symptomTypes.filter((s) => s.userId !== null),
      customFoodTags: foodTags.filter((t) => t.userId !== null),
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
    const result = emptyImportResult();

    // Custom library rows first — meals reference them.
    if (snapshot.customSymptomTypes?.length) {
      const res = await this.supabase.from('symptom_types').upsert(
        snapshot.customSymptomTypes.map((s) => ({
          id: s.id,
          user_id: this.userId,
          slug: s.slug,
          name: s.name,
          description: s.description,
          category: s.category,
          scale: s.scale,
          sort_order: s.sortOrder,
        }))
      );
      if (res.error) throw new Error(`import symptom types: ${res.error.message}`);
      result.customSymptomTypes = snapshot.customSymptomTypes.length;
    }

    if (snapshot.customFoodTags?.length) {
      const res = await this.supabase.from('food_tags').upsert(
        snapshot.customFoodTags.map((t) => ({
          id: t.id,
          user_id: this.userId,
          slug: t.slug,
          name: t.name,
          description: t.description,
          category: 'custom',
          aliases: t.aliases,
          sort_order: t.sortOrder,
        }))
      );
      if (res.error) throw new Error(`import food tags: ${res.error.message}`);
      result.customFoodTags = snapshot.customFoodTags.length;
    }

    if (snapshot.meals?.length) {
      const res = await this.supabase.from('meals').upsert(
        snapshot.meals.map((m) => ({
          id: m.id,
          user_id: this.userId,
          occurred_on: m.occurredOn,
          occurred_at: m.occurredAt,
          slot: m.slot,
          description: m.description,
          is_outside: m.isOutside,
          notes: m.notes,
        }))
      );
      if (res.error) throw new Error(`import meals: ${res.error.message}`);
      result.meals = snapshot.meals.length;

      const links = snapshot.meals.flatMap((m) =>
        m.tagIds.map((tag_id) => ({ meal_id: m.id, tag_id, user_id: this.userId }))
      );
      if (links.length) {
        const linkRes = await this.supabase
          .from('meal_tags')
          .upsert(links, { onConflict: 'meal_id,tag_id', ignoreDuplicates: true });
        if (linkRes.error) throw new Error(`import meal tags: ${linkRes.error.message}`);
      }
    }

    if (snapshot.symptomLogs?.length) {
      const res = await this.supabase.from('symptom_logs').upsert(
        snapshot.symptomLogs.map((s) => ({
          id: s.id,
          user_id: this.userId,
          symptom_type_id: s.symptomTypeId,
          occurred_on: s.occurredOn,
          occurred_at: s.occurredAt,
          severity: s.severity,
          notes: s.notes,
        }))
      );
      if (res.error) throw new Error(`import symptom logs: ${res.error.message}`);
      result.symptomLogs = snapshot.symptomLogs.length;
    }

    if (snapshot.dailyFactors?.length) {
      const res = await this.supabase.from('daily_factors').upsert(
        snapshot.dailyFactors.map((f) => ({
          user_id: this.userId,
          day: f.day,
          sleep_hours: f.sleepHours,
          stress: f.stress,
          exercised: f.exercised,
          medication: f.medication,
          menstrual_phase: f.menstrualPhase,
          notes: f.notes,
        }))
      );
      if (res.error) throw new Error(`import daily factors: ${res.error.message}`);
    }

    if (snapshot.challenges?.length) {
      const res = await this.supabase.from('challenges').upsert(
        snapshot.challenges.map((c) => ({
          id: c.id,
          user_id: this.userId,
          tag_id: c.tagId,
          exclude_tag_id: c.excludeTagId,
          symptom_type_id: c.symptomTypeId,
          status: c.status,
          target_exposures: c.targetExposures,
          started_on: c.startedOn,
          ended_on: c.endedOn,
          verdict: c.verdict,
          notes: c.notes,
        }))
      );
      if (res.error) throw new Error(`import challenges: ${res.error.message}`);
      result.challenges = snapshot.challenges.length;
    }

    // Tracked sets are a preference, not data — only adopt them if the account
    // has none yet, so a re-import never clobbers a deliberate later choice.
    const existingSymptoms = await this.listTrackedSymptoms();
    if (existingSymptoms.length === 0 && snapshot.trackedSymptoms?.length) {
      await this.setTrackedSymptoms(snapshot.trackedSymptoms.map((t) => t.symptomTypeId));
    }
    const existingTags = await this.listTrackedTags();
    if (existingTags.length === 0 && snapshot.trackedTags?.length) {
      await this.setTrackedTags(snapshot.trackedTags.map((t) => t.tagId));
    }

    if (snapshot.profile?.onboardedAt) {
      const current = await this.getProfile();
      if (!current.onboardedAt) await this.updateProfile({ onboardedAt: snapshot.profile.onboardedAt });
    }

    return result;
  }

  async clearAll(): Promise<void> {
    // meal_tags cascade from meals; custom library rows cascade nothing else.
    for (const table of [
      'meals',
      'symptom_logs',
      'daily_factors',
      'challenges',
      'tracked_symptoms',
      'tracked_tags',
    ]) {
      const res = await this.supabase.from(table).delete().eq('user_id', this.userId);
      if (res.error) throw new Error(`clear ${table}: ${res.error.message}`);
    }
    for (const table of ['symptom_types', 'food_tags']) {
      const res = await this.supabase.from(table).delete().eq('user_id', this.userId);
      if (res.error) throw new Error(`clear ${table}: ${res.error.message}`);
    }
  }
}

/* ------------------------------------------------------------------ mappers */

function mapSymptomType(row: any): SymptomType {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    scale: row.scale,
    isRedFlag: row.is_red_flag,
    sortOrder: row.sort_order,
  };
}

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    timezone: row.timezone ?? 'UTC',
    onboardedAt: row.onboarded_at,
  };
}

function mapFoodTag(row: any): FoodTag {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    aliases: row.aliases ?? [],
    sortOrder: row.sort_order,
  };
}

function mapMeal(row: any): Meal {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    occurredAt: row.occurred_at,
    slot: row.slot,
    description: row.description ?? '',
    isOutside: row.is_outside,
    notes: row.notes,
    tagIds: (row.meal_tags ?? []).map((t: any) => t.tag_id),
  };
}

function mapSymptomLog(row: any): SymptomLog {
  return {
    id: row.id,
    symptomTypeId: row.symptom_type_id,
    occurredOn: row.occurred_on,
    occurredAt: row.occurred_at,
    severity: row.severity,
    notes: row.notes,
  };
}

function mapDailyFactors(row: any): DailyFactors {
  return {
    day: row.day,
    sleepHours: row.sleep_hours === null ? null : Number(row.sleep_hours),
    stress: row.stress,
    exercised: row.exercised,
    medication: row.medication,
    menstrualPhase: row.menstrual_phase,
    notes: row.notes,
  };
}

function mapChallenge(row: any): Challenge {
  return {
    id: row.id,
    tagId: row.tag_id,
    excludeTagId: row.exclude_tag_id,
    symptomTypeId: row.symptom_type_id,
    status: row.status,
    targetExposures: row.target_exposures,
    startedOn: row.started_on,
    endedOn: row.ended_on,
    verdict: row.verdict,
    notes: row.notes,
  };
}
