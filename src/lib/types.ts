/**
 * Domain types shared by the UI, both storage backends, and the analysis engine.
 *
 * Dates: `occurredOn` is a local calendar day as `YYYY-MM-DD` and is always present.
 * `occurredAt` is a full ISO instant and is optional — users who never set a time
 * still get analysed, just at day resolution instead of hour resolution.
 */

export type SymptomCategory = 'gas' | 'stool' | 'pain' | 'systemic' | 'skin' | 'other';
export type SymptomScale = 'severity' | 'binary';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
export type TagCategory = 'suspect' | 'protein' | 'carb' | 'produce' | 'drink' | 'pattern' | 'custom';

export interface SymptomType {
  id: string;
  /** null for curated library rows, the owner's id for custom ones. */
  userId: string | null;
  slug: string;
  name: string;
  description: string | null;
  category: SymptomCategory;
  scale: SymptomScale;
  /** Symptoms that warrant a doctor rather than more diet tweaking. */
  isRedFlag: boolean;
  sortOrder: number;
}

export interface FoodTag {
  id: string;
  userId: string | null;
  slug: string;
  name: string;
  description: string | null;
  category: TagCategory;
  /** Free-text words that hint this tag when typing a meal description. */
  aliases: string[];
  sortOrder: number;
}

export interface Meal {
  id: string;
  occurredOn: string;
  occurredAt: string | null;
  slot: MealSlot | null;
  description: string;
  isOutside: boolean;
  notes: string | null;
  tagIds: string[];
}

export interface SymptomLog {
  id: string;
  symptomTypeId: string;
  occurredOn: string;
  occurredAt: string | null;
  severity: number;
  notes: string | null;
}

export interface DailyFactors {
  day: string;
  sleepHours: number | null;
  stress: number | null;
  exercised: boolean | null;
  medication: string | null;
  menstrualPhase: string | null;
  notes: string | null;
}

export type ChallengeStatus = 'active' | 'completed' | 'abandoned';
export type ChallengeVerdict = 'confirmed' | 'cleared' | 'inconclusive';

export interface Challenge {
  id: string;
  tagId: string;
  /** The tag to avoid while testing `tagId`, when the two are entangled. */
  excludeTagId: string | null;
  symptomTypeId: string;
  status: ChallengeStatus;
  targetExposures: number;
  startedOn: string;
  endedOn: string | null;
  verdict: ChallengeVerdict | null;
  notes: string | null;
}

export interface Profile {
  id: string;
  displayName: string | null;
  timezone: string;
  onboardedAt: string | null;
}

export interface TrackedSymptom {
  symptomTypeId: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TrackedTag {
  tagId: string;
  sortOrder: number;
  isActive: boolean;
}

/** Everything a user owns, in one object. Used for export, import, and cloud migration. */
export interface Snapshot {
  app: 'gut-tracker';
  version: 2;
  exportedAt: string;
  profile: Pick<Profile, 'displayName' | 'timezone' | 'onboardedAt'> | null;
  /** Only custom rows travel; curated library rows are derived from slugs on both sides. */
  customSymptomTypes: SymptomType[];
  customFoodTags: FoodTag[];
  trackedSymptoms: TrackedSymptom[];
  trackedTags: TrackedTag[];
  meals: Meal[];
  symptomLogs: SymptomLog[];
  dailyFactors: DailyFactors[];
  challenges: Challenge[];
}

export interface ImportResult {
  meals: number;
  symptomLogs: number;
  customSymptomTypes: number;
  customFoodTags: number;
  challenges: number;
  skipped: number;
}
