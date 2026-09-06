import { NavLink } from 'react-router'

import { cn } from '@/shared/lib/cn'

/**
 * Vertical icon rail: a 56px column of two-letter badges, one per top-level
 * screen. Dense by design — this app targets a 1600px monitor and 4+ hours
 * of daily use, so a labelled sidebar would waste width every other screen
 * needs.
 */
const NAV_ITEMS = [
  { to: '/searches/new', badge: 'Se', label: 'New search' },
  { to: '/campaigns', badge: 'Ca', label: 'Campaigns' },
  { to: '/suppression', badge: 'Su', label: 'Suppression' },
  { to: '/settings/providers', badge: 'St', label: 'Settings' },
] as const

export function NavRail() {
  return (
    <nav
      aria-label="Primary"
      className="flex w-14 flex-col items-center gap-2 border-r border-[var(--color-line)] bg-[var(--color-bg)] py-3"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          title={item.label}
          className={({ isActive }) =>
            cn(
              'flex size-9 items-center justify-center rounded-[var(--radius-control)]',
              'text-[13px] font-semibold',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
              isActive
                ? 'bg-[var(--color-accent)] text-[var(--color-surface)]'
                : 'border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-sunk)]',
            )
          }
        >
          {item.badge}
        </NavLink>
      ))}
    </nav>
  )
}
