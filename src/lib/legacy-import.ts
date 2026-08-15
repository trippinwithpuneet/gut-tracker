/**
 * Imports exports from the original single-file "Gut Reset" tracker (see legacy/).
 *
 * That app stored one row per day: a free-text meal string, a set of trigger-food
 * ids, a 1–5 smell score, and a few checkbox symptoms. This flattens into the
 * current model as one untimed meal per day plus one symptom log per recorded
 * symptom, with the smell score becoming a `foul-gas` entry.
 *
 * Day-resolution data is analysed at day resolution — no timestamps are invented.
 */
import { curatedSymptom, curatedTag } from './library';
import type { Meal, Snapshot, SymptomLog } from './types';
import { uuidv4 } from './uuid';

interface LegacyEntry {
  date: string;
  meals?: string;
  outside?: boolean;
  triggers?: string[];
  sev: number;
  symptoms?: string[];
  enzymes?: boolean;
  notes?: string;
}

/** Old trigger id → current tag slug. Two of them also imply eating out. */
const TRIGGER_MAP: Record<string, { slug: string; outside?: boolean }> = {
  eggs: { slug: 'eggs' },
  dairy: { slug: 'dairy' },
  legumes: { slug: 'legumes' },
  allium: { slug: 'alliums' },
  crucifer: { slug: 'cruciferous' },
  protein: { slug: 'protein-powder' },
  sugarol: { slug: 'sugar-alcohols' },
  o_chicken: { slug: 'chicken', outside: true },
  o_oil: { slug: 'fried', outside: true },
};

/** Old symptom checkbox label → current symptom slug. */
const SYMPTOM_MAP: Record<string, string> = {
  Bloating: 'bloating',
  'Frequent gas': 'excess-gas',
  Urgency: 'urgency',
  Cramping: 'cramping',
  'Greasy/floating stool': 'greasy-stool',
  'Loose stool': 'loose-stool',
};

export function isLegacyExport(value: unknown): value is { entries: LegacyEntry[] } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { app?: unknown; version?: unknown; entries?: unknown };
  if (candidate.app !== 'gut-tracker') return false;
  // Version 1 is the old single-file format; version 2 is the current Snapshot.
  return candidate.version === 1 && Array.isArray(candidate.entries);
}

export function importLegacyExport(parsed: { entries: LegacyEntry[] }): Snapshot {
  const meals: Meal[] = [];
  const symptomLogs: SymptomLog[] = [];
  const trackedSymptomIds = new Set<string>();
  const trackedTagIds = new Set<string>();

  for (const entry of parsed.entries) {
    if (!entry?.date || typeof entry.sev !== 'number') continue;

    const tagIds: string[] = [];
    let isOutside = Boolean(entry.outside);

    for (const triggerId of entry.triggers ?? []) {
      const mapping = TRIGGER_MAP[triggerId];
      if (!mapping) continue;
      const tag = curatedTag(mapping.slug);
      if (!tag) continue;
      tagIds.push(tag.id);
      trackedTagIds.add(tag.id);
      if (mapping.outside) isOutside = true;
    }

    // The old app had no per-meal concept, so the day collapses to one untimed meal.
    const notes = entry.enzymes
      ? [entry.notes, 'Took enzymes at the start of meals'].filter(Boolean).join(' · ')
      : (entry.notes ?? null);

    meals.push({
      id: uuidv4(),
      occurredOn: entry.date,
      occurredAt: null,
      slot: null,
      description: entry.meals?.trim() || 'Imported day',
      isOutside,
      notes: notes || null,
      tagIds: [...new Set(tagIds)],
    });

    const foulGas = curatedSymptom('foul-gas');
    if (foulGas) {
      symptomLogs.push({
        id: uuidv4(),
        symptomTypeId: foulGas.id,
        occurredOn: entry.date,
        occurredAt: null,
        severity: Math.max(0, Math.min(5, Math.round(entry.sev))),
        notes: null,
      });
      trackedSymptomIds.add(foulGas.id);
    }

    for (const label of entry.symptoms ?? []) {
      const slug = SYMPTOM_MAP[label];
      const symptom = slug ? curatedSymptom(slug) : undefined;
      if (!symptom) continue;
      symptomLogs.push({
        id: uuidv4(),
        symptomTypeId: symptom.id,
        occurredOn: entry.date,
        occurredAt: null,
        // The old app recorded presence, not intensity. 3 keeps a present symptom
        // visible without inventing a severity the user never gave.
        severity: 3,
        notes: null,
      });
      trackedSymptomIds.add(symptom.id);
    }
  }

  return {
    app: 'gut-tracker',
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: null,
    customSymptomTypes: [],
    customFoodTags: [],
    trackedSymptoms: [...trackedSymptomIds].map((symptomTypeId, i) => ({
      symptomTypeId,
      sortOrder: (i + 1) * 10,
      isActive: true,
    })),
    trackedTags: [...trackedTagIds].map((tagId, i) => ({
      tagId,
      sortOrder: (i + 1) * 10,
      isActive: true,
    })),
    meals,
    symptomLogs,
    dailyFactors: [],
    challenges: [],
  };
}
