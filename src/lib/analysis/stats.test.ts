import { describe, expect, it } from 'vitest';
import { benjaminiHochberg, hashString, mean, mulberry32, permutationTest } from './stats';

describe('benjaminiHochberg', () => {
  it('matches a hand-computed vector', () => {
    // p = [0.01, 0.02, 0.03, 0.04, 0.05], m = 5
    // raw q by rank: .05, .05, .05, .05, .05 → all 0.05 after monotone smoothing
    const q = benjaminiHochberg([0.01, 0.02, 0.03, 0.04, 0.05]);
    for (const value of q) expect(value).toBeCloseTo(0.05, 10);
  });

  it('preserves input order', () => {
    const q = benjaminiHochberg([0.9, 0.001, 0.5]);
    expect(q[1]).toBeLessThan(q[2]);
    expect(q[2]).toBeLessThanOrEqual(q[0]);
  });

  it('is monotone in rank', () => {
    const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216];
    const q = benjaminiHochberg(p);
    const sorted = p
      .map((value, index) => ({ value, q: q[index] }))
      .sort((a, b) => a.value - b.value);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].q).toBeGreaterThanOrEqual(sorted[i - 1].q - 1e-12);
    }
  });

  it('never exceeds 1 and punishes a lone weak p-value', () => {
    const q = benjaminiHochberg([0.4, 0.9, 0.95]);
    for (const value of q) expect(value).toBeLessThanOrEqual(1);
    // 0.4 across 3 tests is nowhere near significant.
    expect(q[0]).toBeGreaterThan(0.5);
  });

  it('handles an empty family', () => {
    expect(benjaminiHochberg([])).toEqual([]);
  });
});

describe('permutationTest', () => {
  it('reports p near 1 when the groups are identical', () => {
    const values = [1, 2, 3, 2, 1, 2, 3, 1];
    const result = permutationTest(values, values, { iterations: 500, seed: 7 });
    expect(result.effect).toBe(0);
    expect(result.pValue).toBeGreaterThan(0.9);
  });

  it('reports a small p when the groups are cleanly separated', () => {
    const exposed = [4, 5, 4, 5, 4, 5, 4, 5];
    const unexposed = [0, 1, 0, 1, 0, 1, 0, 1];
    const result = permutationTest(exposed, unexposed, { iterations: 2000, seed: 7 });
    expect(result.effect).toBeCloseTo(4, 5);
    expect(result.pValue).toBeLessThan(0.01);
  });

  it('never returns exactly zero, and floors at 1/(iterations+1)', () => {
    const result = permutationTest([5, 5, 5, 5, 5], [0, 0, 0, 0, 0], {
      iterations: 100,
      seed: 3,
    });
    // The mirrored arrangement is equally extreme, so occasional hits are expected;
    // what matters is that p can never be reported as flat zero.
    expect(result.pValue).toBeGreaterThanOrEqual(1 / 101);
    expect(result.pValue).toBeLessThan(0.06);
  });

  it('is deterministic for a given seed', () => {
    const a = permutationTest([3, 4, 2, 5], [1, 0, 2, 1], { iterations: 500, seed: 11 });
    const b = permutationTest([3, 4, 2, 5], [1, 0, 2, 1], { iterations: 500, seed: 11 });
    expect(a.pValue).toBe(b.pValue);
  });

  it('stays honest on tiny samples', () => {
    // Three versus three, perfectly separated, is the most extreme of only 20
    // possible splits — so p can never drop below about 0.05 however big the gap.
    const result = permutationTest([5, 5, 5], [0, 0, 0], { iterations: 5000, seed: 5 });
    expect(result.pValue).toBeGreaterThan(0.04);
  });

  it('degrades safely when a group is empty', () => {
    const result = permutationTest([], [1, 2, 3], { iterations: 100, seed: 1 });
    expect(result.pValue).toBe(1);
    expect(result.nExposed).toBe(0);
  });
});

describe('mulberry32', () => {
  it('is reproducible and stays in range', () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces a roughly uniform spread', () => {
    const random = mulberry32(1234);
    const values = Array.from({ length: 20_000 }, random);
    expect(mean(values)).toBeCloseTo(0.5, 1);
  });
});

describe('hashString', () => {
  it('is stable and distinguishes similar inputs', () => {
    expect(hashString('dairy|0')).toBe(hashString('dairy|0'));
    expect(hashString('dairy|0')).not.toBe(hashString('dairy|1'));
  });
});
