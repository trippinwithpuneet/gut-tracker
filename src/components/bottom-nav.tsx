'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

const TABS = [
  { href: '/', label: 'Log', icon: PencilIcon },
  { href: '/insights', label: 'Insights', icon: ChartIcon },
  { href: '/tests', label: 'Tests', icon: FlaskIcon },
  { href: '/you', label: 'You', icon: PersonIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  // Onboarding is a linear flow; a nav bar there invites people to skip setup.
  if (pathname?.startsWith('/onboarding')) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      <div className="mx-auto flex w-full max-w-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold tracking-[0.02em] transition-colors',
                active ? 'text-lime' : 'text-faint hover:text-muted'
              )}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* Inline SVG rather than an icon package: four icons is not worth a dependency,
   and these inherit currentColor so the active state needs no extra styling. */

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" rx="1" />
      <rect x="12.5" y="8" width="3" height="10" rx="1" />
      <rect x="18" y="5" width="3" height="13" rx="1" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 3h6" />
      <path d="M10 3v6.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.5V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}
