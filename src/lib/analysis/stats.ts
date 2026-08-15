/**
 * The statistics the app rests on. Pure functions, no dependencies, no randomness
 * that isn't seeded.
 *
 * Two choices here matter more than anything else in the codebase:
 *
 * 1. A permutation test rather than a t-test. Symptom scores are ordinal 0–5, badly
 *    skewed (most days are 0–1), and samples are small. A t-test assumes none of
 *    that. Shuffling the exposure labels asks the only question that matters — "how
 *    often would this gap appear by chance in my own data?" — without assuming a
 *    distribution.
 *
 * 2. Benjamini–Hochberg correction. Testing 15 foods against a symptom at p < 0.05
 *    yields a false 'culprit' roughly half the time. Without this the app is a random
 *    food generator with good typography.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - m) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

/**
 * Seeded PRNG (mulberry32).
 *
 * The permutation test must be deterministic: a user who refreshes and sees a
 * finding flip from "strong" to "possible" learns, correctly, not to trust the app.
 * Seeding from the hypothesis identity makes every run reproducible.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. Used only to turn a hypothesis id into a PRNG seed. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface PermutationResult {
  /** mean(exposed) - mean(unexposed). Positive means the food tracks with worse symptoms. */
  effect: number;
  pValue: number;
  meanExposed: number;
  meanUnexposed: number;
  nExposed: number;
  nUnexposed: number;
}

/**
 * Two-sided permutation test on the difference of means.
 *
 * The (count + 1) / (iterations + 1) form is the standard small-sample correction:
 * it keeps the p-value from ever being exactly zero, which would overstate certainty
 * that no finite number of shuffles can justify.
 */
export function permutationTest(
  exposed: number[],
  unexposed: number[],
  { iterations = 2000, seed = 1 }: { iterations?: number; seed?: number } = {}
): PermutationResult {
  const meanExposed = mean(exposed);
  const meanUnexposed = mean(unexposed);
  const effect = meanExposed - meanUnexposed;

  const base: PermutationResult = {
    effect,
    pValue: 1,
    meanExposed,
    meanUnexposed,
    nExposed: exposed.length,
    nUnexposed: unexposed.length,
  };

  if (exposed.length === 0 || unexposed.length === 0) return base;

  const pool = [...exposed, ...unexposed];
  const nExposed = exposed.length;
  const observed = Math.abs(effect);

  // Floating-point slop: two arrangements that are mathematically equal must not be
  // counted as "less extreme" because of a 1e-16 difference.
  const epsilon = 1e-9;

  const random = mulberry32(seed);
  let atLeastAsExtreme = 0;

  for (let i = 0; i < iterations; i++) {
    // Fisher-Yates on a copy-free pool; only the first nExposed entries are read.
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(random() * (j + 1));
      const tmp = pool[j];
      pool[j] = pool[k];
      pool[k] = tmp;
    }

    let sumExposed = 0;
    for (let j = 0; j < nExposed; j++) sumExposed += pool[j];
    let sumRest = 0;
    for (let j = nExposed; j < pool.length; j++) sumRest += pool[j];

    const shuffled = Math.abs(
      sumExposed / nExposed - sumRest / (pool.length - nExposed)
    );
    if (shuffled >= observed - epsilon) atLeastAsExtreme++;
  }

  return { ...base, pValue: (atLeastAsExtreme + 1) / (iterations + 1) };
}

/**
 * Benjamini-Hochberg false discovery rate correction.
 *
 * Returns a q-value per input p-value, in the original order. A q of 0.10 means:
 * if you treat this and everything more significant as real, about 10% of them
 * will be wrong. That is a far more useful promise to a user than a raw p-value.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];

  const order = pValues
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p - b.p);

  const qValues = new Array<number>(m);
  let runningMin = 1;

  // Walk from the least significant upward so the result stays monotone.
  for (let rank = m; rank >= 1; rank--) {
    const { p, index } = order[rank - 1];
    runningMin = Math.min(runningMin, (p * m) / rank);
    qValues[index] = Math.min(1, runningMin);
  }

  return qValues;
}
