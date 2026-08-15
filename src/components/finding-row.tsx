'use client';

import { useState } from 'react';
import { CONFIDENCE_SHORT, confidenceExplainer, effectWidth, explain, lagLabel } from '@/lib/analysis/copy';
import type { Finding } from '@/lib/analysis/types';
import { cx } from './ui';

const BADGE_STYLES: Record<Finding['confidence'], string> = {
  strong: 'bg-hot/16 text-hot',
  possible: 'bg-warm/14 text-warm',
  none: 'bg-surface-3 text-faint',
  insufficient: 'bg-surface-3 text-faint',
};

function barColor(finding: Finding): string {
  if (finding.confidence === 'insufficient' || finding.confidence === 'none') return '#3a443e';
  if (finding.direction === 'better') return 'var(--color-cool)';
  return finding.confidence === 'strong' ? 'var(--color-hot)' : 'var(--color-warm)';
}

/**
 * One food's verdict. Tapping expands the evidence.
 *
 * The number is always shown with its sample size, and the badge always states the
 * confidence — a bare "+1.2" with no n and no caveat is the kind of thing that gets
 * someone to cut out dairy for a year on the strength of four days.
 */
export function FindingRow({
  finding,
  tagName,
  symptomName,
  entangledNames,
}: {
  finding: Finding;
  tagName: string;
  symptomName: string;
  entangledNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const testable = finding.confidence !== 'insufficient';

  return (
    <li className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full py-3 text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[14.5px] font-semibold tracking-[-0.01em]">
            {tagName}
          </span>
          {/* Colour tracks confidence, not raw direction. A green "−0.7" next to a
              NO SIGNAL badge reads as "this food helps", which is exactly the
              overclaim the rest of this screen exists to avoid. */}
          <span
            className={cx(
              'shrink-0 text-[15px] font-bold tabular-nums',
              finding.confidence === 'strong' || finding.confidence === 'possible'
                ? finding.direction === 'worse'
                  ? 'text-hot'
                  : 'text-cool'
                : 'text-faint'
            )}
          >
            {testable ? `${finding.effect >= 0 ? '+' : '−'}${Math.abs(finding.effect).toFixed(1)}` : '—'}
          </span>
        </div>

        <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${testable ? effectWidth(finding.effect) : 0}%`,
              background: barColor(finding),
            }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
          <span
            className={cx(
              'rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.07em]',
              BADGE_STYLES[finding.confidence]
            )}
          >
            {CONFIDENCE_SHORT[finding.confidence]}
          </span>
          {testable ? (
            <>
              <span>
                {finding.nExposed} with · {finding.nUnexposed} without
              </span>
              {finding.confidence !== 'none' && <span>· {lagLabel(finding.lag)}</span>}
            </>
          ) : (
            <span>
              {finding.daysNeeded > 0
                ? `${finding.daysNeeded} more day${finding.daysNeeded === 1 ? '' : 's'} needed`
                : 'not testable yet'}
            </span>
          )}
          {entangledNames.length > 0 && (
            <span className="text-warm">· tangled with {entangledNames.join(', ')}</span>
          )}
        </div>
      </button>

      {open && (
        <div className="pb-3.5 text-[12.5px] leading-relaxed text-muted">
          {testable && <p>{explain(finding, tagName, symptomName)}</p>}
          <p className={cx(testable && 'mt-2', 'text-faint')}>{confidenceExplainer(finding)}</p>
          {testable && finding.confidence !== 'insufficient' && (
            <p className="mt-2 font-mono text-[11px] text-faint">
              p = {finding.pValue.toFixed(3)} · q = {finding.qValue.toFixed(3)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
