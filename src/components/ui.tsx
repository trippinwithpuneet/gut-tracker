'use client';

/**
 * Shared primitives for the Fast Log surface.
 *
 * Everything here is sized for a thumb: chips and severity buttons clear 44px, and
 * nothing depends on hover to be discoverable.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const SEVERITY_COLORS = [
  'var(--color-sev-0)',
  'var(--color-sev-1)',
  'var(--color-sev-2)',
  'var(--color-sev-3)',
  'var(--color-sev-4)',
  'var(--color-sev-5)',
];

export const SEVERITY_CAPTIONS = ['none', 'barely', 'mild', 'moderate', 'bad', 'awful'];

export function severityColor(severity: number): string {
  return SEVERITY_COLORS[Math.max(0, Math.min(5, Math.round(severity)))];
}

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
}) {
  return (
    <Tag
      className={cx(
        'rounded-[var(--radius-card)] border border-line bg-surface p-4',
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
        {subtitle ? <div className="mt-0.5 text-xs font-medium text-faint">{subtitle}</div> : null}
      </div>
      {right}
    </header>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  full?: boolean;
};

export function Button({
  variant = 'primary',
  full = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-field)] px-4 py-3 text-[15px] font-bold tracking-[-0.01em] transition-colors disabled:opacity-45 disabled:pointer-events-none';
  const variants = {
    primary: 'bg-lime text-lime-ink hover:bg-[#b0f085]',
    secondary: 'border border-line bg-surface-2 text-ink hover:border-faint',
    ghost: 'text-muted hover:text-ink',
    danger: 'border border-hot/40 text-hot hover:bg-hot/10',
  } as const;

  return (
    <button className={cx(base, variants[variant], full && 'w-full', className)} {...props}>
      {children}
    </button>
  );
}

export function Chip({
  label,
  selected,
  onToggle,
  dashed = false,
  title,
}: {
  label: string;
  selected?: boolean;
  onToggle?: () => void;
  dashed?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      title={title}
      className={cx(
        'rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors',
        dashed && 'border-dashed',
        selected
          ? 'border-lime bg-lime text-lime-ink'
          : 'border-line bg-surface-2 text-muted hover:border-faint hover:text-ink'
      )}
    >
      {label}
    </button>
  );
}

export function SeverityPicker({
  value,
  onChange,
  includeZero = false,
}: {
  value: number | null;
  onChange: (value: number) => void;
  includeZero?: boolean;
}) {
  const options = includeZero ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
  return (
    <div className="flex gap-1.5" role="group" aria-label="Severity">
      {options.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={active}
            className={cx(
              'flex-1 rounded-[var(--radius-field)] border py-3 text-lg font-bold transition-colors',
              active ? 'text-[#0e1211]' : 'border-line bg-surface-2 text-muted hover:text-ink'
            )}
            style={active ? { background: SEVERITY_COLORS[n], borderColor: SEVERITY_COLORS[n] } : undefined}
          >
            {n}
            <span
              className={cx(
                'mt-1 block text-[9.5px] font-semibold tracking-[0.03em]',
                active ? 'text-[#0e1211]/65' : 'text-faint'
              )}
            >
              {SEVERITY_CAPTIONS[n]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11.5px] text-faint">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-[var(--radius-field)] border border-line bg-surface-2 px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-lime';

export function EmptyState({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-8 text-center">
      <div className="text-sm font-semibold text-muted">{title}</div>
      {body ? <div className="mt-1.5 text-[12.5px] leading-relaxed text-faint">{body}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-faint" role="status">
      <span className="size-3 animate-spin rounded-full border-2 border-line border-t-lime" />
      {label}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
    >
      <div className="rounded-full border border-line bg-surface-3 px-4 py-2 text-[13px] font-semibold text-ink shadow-lg">
        {message}
      </div>
    </div>
  );
}
