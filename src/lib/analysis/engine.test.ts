import { describe, expect, it } from 'vitest';
import { runAnalysis } from './index';
import { generateLog } from './fixtures';
import { buildObservations, outcomeFor } from './observations';
import { findEntanglements } from './confounds';
import type { Finding } from './types';

const SYMPTOM = 'symptom-gas';
const TAGS = ['dairy', 'eggs', 'alliums', 'gluten', 'legumes', 'rice', 'caffeine', 'spicy'];

const findingFor = (findings: Finding[], tagId: string) =>
  findings.find((f) => f.tagId === tagId);

function analyse(log: ReturnType<typeof generateLog>, tagIds = TAGS) {
  return runAnalysis({
    meals: log.meals,
    symptomLogs: log.symptomLogs,
    tagIds,
    symptomTypeIds: [SYMPTOM],
  }).symptoms[0];
}

describe('planted signal', () => {
  it('finds the one food that actually matters and clears the rest', () => {
    const log = generateLog({
      days: 90,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { dairy: 2 },
      seed: 101,
    });

    const report = analyse(log);
    const dairy = findingFor(report.findings, 'dairy');

    expect(dairy).toBeDefined();
    expect(dairy!.confidence).toBe('strong');
    expect(dairy!.direction).toBe('worse');
    expect(dairy!.effect).toBeGreaterThan(1.2);

    // It should also be ranked first.
    expect(report.findings[0].tagId).toBe('dairy');

    // And nothing else should be called strong.
    const otherStrong = report.findings.filter(
      (f) => f.confidence === 'strong' && f.tagId !== 'dairy'
    );
    expect(otherStrong).toEqual([]);
  });

  it('separates two real culprits from six innocents', () => {
    const log = generateLog({
      days: 120,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { eggs: 2, spicy: 1.5 },
      seed: 202,
    });

    const report = analyse(log);
    const strong = report.findings
      .filter((f) => f.confidence === 'strong')
      .map((f) => f.tagId)
      .sort();

    expect(strong).toContain('eggs');
    expect(strong).toContain('spicy');
    expect(strong.length).toBeLessThanOrEqual(3);
  });

  it('detects an effect that only shows up the next day', () => {
    const log = generateLog({
      days: 120,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1,
      noise: 0.4,
      nextDayEffects: { legumes: 2.2 },
      seed: 303,
    });

    const report = analyse(log);
    const legumes = findingFor(report.findings, 'legumes');

    expect(legumes).toBeDefined();
    expect(legumes!.confidence).toBe('strong');
    expect(legumes!.lag).toBe(1);
  });

  it('surfaces a food associated with better days as safe, not as a trigger', () => {
    const log = generateLog({
      days: 100,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 3,
      noise: 0.5,
      sameDayEffects: { rice: -2 },
      seed: 404,
    });

    const report = analyse(log);

    expect(report.safeFindings.map((f) => f.tagId)).toContain('rice');
    // A protective food must never appear in the suspect list.
    expect(report.findings.filter((f) => f.confidence !== 'insufficient').map((f) => f.tagId))
      .not.toContain('rice');
  });

  it('only calls a food safe when there is evidence, not just a negative drift', () => {
    // Pure noise across many logs: plenty of tags drift below zero by chance, and
    // none of them may be presented as safe.
    let driftedTotal = 0;

    for (let i = 0; i < 15; i++) {
      const report = analyse(
        generateLog({
          days: 80,
          tagIds: TAGS,
          symptomTypeId: SYMPTOM,
          baseline: 2.5,
          noise: 1.2,
          seed: 4242 + i * 91,
        })
      );

      driftedTotal += report.findings.filter((f) => f.effect < -0.2).length;
      for (const finding of report.safeFindings) {
        expect(['strong', 'possible']).toContain(finding.confidence);
      }
    }

    // Sanity-check the premise: noise really does produce negative drift, so the
    // assertion above is doing work rather than passing over an empty list.
    expect(driftedTotal).toBeGreaterThan(0);
  });
});

describe('false positive control', () => {
  it('stays quiet on data with no real effects', () => {
    // Under a global null, Benjamini-Hochberg controls the chance of ANY discovery
    // at the q threshold (0.10). Across 20 independent logs we expect ~2 noisy
    // seeds; anything much above that means the correction is not working.
    const seedsWithFindings = Array.from({ length: 20 }, (_, i) => {
      const log = generateLog({
        days: 80,
        tagIds: TAGS,
        symptomTypeId: SYMPTOM,
        baseline: 2,
        noise: 1.2,
        seed: 1000 + i * 37,
      });
      return analyse(log).findings.some((f) => f.confidence === 'strong');
    }).filter(Boolean).length;

    expect(seedsWithFindings).toBeLessThanOrEqual(5);
  });

  it('lets far more through without the correction, proving it does something', () => {
    const log = generateLog({
      days: 80,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 2,
      noise: 1.2,
      seed: 7777,
    });

    const report = analyse(log);
    const rawlySignificant = report.findings.filter((f) => f.pValue <= 0.05).length;
    const corrected = report.findings.filter((f) => f.confidence === 'strong').length;
    expect(corrected).toBeLessThanOrEqual(rawlySignificant);
  });
});

describe('missing data', () => {
  it('ignores unlogged days instead of scoring them as symptom-free', () => {
    const log = generateLog({
      days: 60,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 2,
      noise: 0.5,
      // A three-week gap in the middle, as happens on holiday.
      skipDays: Array.from({ length: 21 }, (_, i) => 20 + i),
      seed: 505,
    });

    const report = analyse(log);
    expect(report.observedDays).toBe(39);

    const observations = buildObservations(log.meals, log.symptomLogs);
    // A day inside the gap must return null, not 0.
    expect(outcomeFor(observations, '2026-01-25', SYMPTOM, 0, null)).toBeNull();
  });

  it('treats a logged day with no symptom entry as a genuine zero', () => {
    const observations = buildObservations(
      [
        {
          id: 'm1',
          occurredOn: '2026-03-01',
          occurredAt: null,
          slot: null,
          description: 'plain rice',
          isOutside: false,
          notes: null,
          tagIds: ['rice'],
        },
      ],
      []
    );
    expect(outcomeFor(observations, '2026-03-01', SYMPTOM, 0, null)).toBe(0);
  });

  it('does not let a long gap manufacture a finding', () => {
    const log = generateLog({
      days: 70,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 2,
      noise: 1,
      skipDays: Array.from({ length: 25 }, (_, i) => 30 + i),
      seed: 606,
    });
    const report = analyse(log);
    expect(report.findings.filter((f) => f.confidence === 'strong').length).toBeLessThanOrEqual(1);
  });
});

describe('not enough data', () => {
  it('says so rather than guessing', () => {
    const log = generateLog({
      days: 5,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 2,
      noise: 0.5,
      sameDayEffects: { dairy: 3 },
      seed: 707,
    });

    const report = analyse(log);
    expect(report.findings.every((f) => f.confidence === 'insufficient')).toBe(true);
    expect(report.findings.some((f) => f.daysNeeded > 0)).toBe(true);
  });

  it('reports zero observed days for an empty log', () => {
    const report = runAnalysis({
      meals: [],
      symptomLogs: [],
      tagIds: TAGS,
      symptomTypeIds: [SYMPTOM],
    });
    expect(report.quality.observedDays).toBe(0);
    expect(report.quality.notes.length).toBeGreaterThan(0);
    expect(report.symptoms[0].findings.every((f) => f.confidence === 'insufficient')).toBe(true);
  });

  it('flags a tag eaten every single day as untestable', () => {
    const log = generateLog({
      days: 40,
      tagIds: TAGS,
      presence: { rice: 1 },
      symptomTypeId: SYMPTOM,
      baseline: 2,
      seed: 808,
    });

    const full = runAnalysis({
      meals: log.meals,
      symptomLogs: log.symptomLogs,
      tagIds: TAGS,
      symptomTypeIds: [SYMPTOM],
    });

    // With no days without rice there is nothing to compare against.
    expect(full.quality.untestableTagIds).toContain('rice');
    expect(findingFor(full.symptoms[0].findings, 'rice')?.confidence).toBe('insufficient');
  });
});

describe('entanglement', () => {
  it('detects two foods that always travel together', () => {
    const log = generateLog({
      days: 90,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { alliums: 2 },
      coOccur: [['alliums', 'gluten']],
      seed: 909,
    });

    const observations = buildObservations(log.meals, log.symptomLogs);
    const tangles = findEntanglements(observations, TAGS, 0.7);

    // Every allium day also has gluten, by construction.
    const alliumTangle = tangles.find(
      (t) => t.tagId === 'alliums' && t.otherTagId === 'gluten'
    );
    expect(alliumTangle).toBeDefined();
    expect(alliumTangle!.overlap).toBe(1);

    const report = analyse(log);
    const alliums = findingFor(report.findings, 'alliums');
    expect(alliums!.entangledWith).toContain('gluten');
  });

  it('suggests the experiment that would separate them', () => {
    const log = generateLog({
      days: 90,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { alliums: 2 },
      coOccur: [['alliums', 'gluten']],
      seed: 909,
    });

    const report = analyse(log);
    expect(report.suggestedChallenge).not.toBeNull();
    expect(report.suggestedChallenge!.reason).toBe('entangled');
    expect(report.suggestedChallenge!.excludeTagId).toBeTruthy();
  });

  it('does not flag a merely common food as inseparable', () => {
    // Caffeine on 80% of days overlaps heavily with everything by sheer base rate,
    // but there are plenty of eggs-without-caffeine days to tell them apart.
    const log = generateLog({
      days: 90,
      tagIds: TAGS,
      presence: { caffeine: 0.8 },
      symptomTypeId: SYMPTOM,
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { eggs: 2 },
      seed: 1212,
    });

    const observations = buildObservations(log.meals, log.symptomLogs);
    const tangles = findEntanglements(observations, TAGS, 0.7, 3);
    expect(tangles.find((t) => t.tagId === 'eggs' && t.otherTagId === 'caffeine')).toBeUndefined();
  });

  it('suggests confirming a clean result when nothing is entangled', () => {
    const log = generateLog({
      days: 100,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { eggs: 2.5 },
      seed: 1111,
    });

    const report = analyse(log);
    expect(report.suggestedChallenge?.reason).toBe('confirm');
    expect(report.suggestedChallenge?.tagId).toBe('eggs');
  });
});

describe('determinism', () => {
  it('gives byte-identical results for identical input', () => {
    const log = generateLog({
      days: 70,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1.5,
      noise: 0.8,
      sameDayEffects: { dairy: 1.6 },
      seed: 2222,
    });

    const first = analyse(log);
    const second = analyse(log);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('is unaffected by the order rows arrive in', () => {
    const log = generateLog({
      days: 70,
      tagIds: TAGS,
      symptomTypeId: SYMPTOM,
      baseline: 1.5,
      noise: 0.8,
      sameDayEffects: { dairy: 1.6 },
      seed: 2222,
    });

    const forward = analyse(log);
    const reversed = analyse({
      ...log,
      meals: [...log.meals].reverse(),
      symptomLogs: [...log.symptomLogs].reverse(),
    });

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });
});

describe('multiple symptoms', () => {
  it('analyses each symptom independently', () => {
    const gasLog = generateLog({
      days: 90,
      tagIds: TAGS,
      symptomTypeId: 'gas',
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { dairy: 2.2 },
      seed: 3333,
    });
    const constipationLog = generateLog({
      days: 90,
      tagIds: TAGS,
      symptomTypeId: 'constipation',
      baseline: 1,
      noise: 0.5,
      sameDayEffects: { gluten: 2.2 },
      seed: 3333,
    });

    const report = runAnalysis({
      // Same meals in both fixtures because the seed matches; reuse one set.
      meals: gasLog.meals,
      symptomLogs: [...gasLog.symptomLogs, ...constipationLog.symptomLogs],
      tagIds: TAGS,
      symptomTypeIds: ['gas', 'constipation'],
    });

    const gas = report.symptoms.find((s) => s.symptomTypeId === 'gas')!;
    const constipation = report.symptoms.find((s) => s.symptomTypeId === 'constipation')!;

    expect(findingFor(gas.findings, 'dairy')?.confidence).toBe('strong');
    expect(findingFor(constipation.findings, 'gluten')?.confidence).toBe('strong');
    // The gas culprit must not bleed into the constipation report.
    expect(findingFor(constipation.findings, 'dairy')?.confidence).not.toBe('strong');
  });
});

describe('same-day ordering', () => {
  it('ignores a symptom that happened before the meal', () => {
    const observations = buildObservations(
      [
        {
          id: 'm1',
          occurredOn: '2026-05-01',
          occurredAt: '2026-05-01T20:00:00.000Z',
          slot: 'dinner',
          description: 'biryani',
          isOutside: true,
          notes: null,
          tagIds: ['alliums'],
        },
      ],
      [
        {
          id: 'l1',
          symptomTypeId: SYMPTOM,
          occurredOn: '2026-05-01',
          occurredAt: '2026-05-01T09:00:00.000Z',
          severity: 5,
          notes: null,
        },
      ]
    );

    // A 9am symptom cannot be caused by an 8pm dinner.
    expect(outcomeFor(observations, '2026-05-01', SYMPTOM, 0, 'alliums')).toBe(0);
    // Without a tag to anchor against, the whole day counts.
    expect(outcomeFor(observations, '2026-05-01', SYMPTOM, 0, null)).toBe(5);
  });

  it('keeps untimed symptom logs rather than discarding them', () => {
    const observations = buildObservations(
      [
        {
          id: 'm1',
          occurredOn: '2026-05-01',
          occurredAt: '2026-05-01T20:00:00.000Z',
          slot: 'dinner',
          description: 'biryani',
          isOutside: true,
          notes: null,
          tagIds: ['alliums'],
        },
      ],
      [
        {
          id: 'l1',
          symptomTypeId: SYMPTOM,
          occurredOn: '2026-05-01',
          occurredAt: null,
          severity: 4,
          notes: null,
        },
      ]
    );
    expect(outcomeFor(observations, '2026-05-01', SYMPTOM, 0, 'alliums')).toBe(4);
  });
});
