import type { Meal, SymptomLog } from '../types';

export interface AnalysisInput {
  meals: Meal[];
  symptomLogs: SymptomLog[];
  /** Food tags to test. Usually the user's tracked set — testing everything costs power. */
  tagIds: string[];
  /** Symptoms to analyse, each independently. */
  symptomTypeIds: string[];
  options?: Partial<AnalysisOptions>;
}

export interface AnalysisOptions {
  /** Minimum days on each side before a tag is reportable at all. */
  minExposedDays: number;
  minUnexposedDays: number;
  /** Permutation shuffles. 2000 gives p-value resolution of ~0.0005. */
  iterations: number;
  /** q-value at or below which a finding is called "strong". */
  strongQ: number;
  /** Raw p-value at or below which a finding is called "possible". */
  possibleP: number;
  /** Effect sizes smaller than this are noise on a 0–5 scale, however significant. */
  minEffect: number;
  /** Two tags are entangled when one appears on this share of the other's days. */
  entanglementThreshold: number;
}

export const DEFAULT_OPTIONS: AnalysisOptions = {
  minExposedDays: 3,
  minUnexposedDays: 3,
  iterations: 2000,
  strongQ: 0.1,
  possibleP: 0.05,
  minEffect: 0.4,
  entanglementThreshold: 0.7,
};

/** Same day, or the day after — gut reactions are frequently delayed. */
export type Lag = 0 | 1;

export type Confidence = 'strong' | 'possible' | 'none' | 'insufficient';
export type Direction = 'worse' | 'better' | 'flat';

export interface Finding {
  tagId: string;
  symptomTypeId: string;
  lag: Lag;
  /** mean(days with) − mean(days without), on the symptom's 0–5 scale. */
  effect: number;
  meanExposed: number;
  meanUnexposed: number;
  nExposed: number;
  nUnexposed: number;
  pValue: number;
  qValue: number;
  confidence: Confidence;
  direction: Direction;
  /** Tags that travel with this one often enough to muddy the result. */
  entangledWith: string[];
  /** How many more exposed days would reach the reporting threshold. */
  daysNeeded: number;
}

export interface Entanglement {
  tagId: string;
  otherTagId: string;
  /** Share of this tag's days on which the other tag also appeared. */
  overlap: number;
}

export interface SuggestedChallenge {
  tagId: string;
  excludeTagId: string | null;
  symptomTypeId: string;
  targetExposures: number;
  reason: string;
}

export interface SymptomReport {
  symptomTypeId: string;
  /** Ranked worst-first, then by confidence. */
  findings: Finding[];
  /** Findings whose effect is negative and credible — the reassuring half. */
  safeFindings: Finding[];
  entanglements: Entanglement[];
  suggestedChallenge: SuggestedChallenge | null;
  /** Mean severity across all observed days. The line everything is measured against. */
  baseline: number;
  observedDays: number;
  daysWithSymptom: number;
  hypothesesTested: number;
}

export interface DataQuality {
  observedDays: number;
  firstDay: string | null;
  lastDay: string | null;
  totalMeals: number;
  totalSymptomLogs: number;
  /** Days logged out of the calendar span — low coverage weakens everything. */
  coverage: number;
  /** Tags that appear on too few or too many days to be testable. */
  untestableTagIds: string[];
  /** Plain-language blockers, e.g. "log 6 more days". */
  notes: string[];
}

export interface AnalysisReport {
  symptoms: SymptomReport[];
  quality: DataQuality;
}
