import { CircleHelpIcon, LogOutIcon, SettingsIcon, ShieldBanIcon, UserIcon } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router'

import { useAuthStore, useLogout } from '@/features/auth'
import { useProductTour } from '@/features/tour/use-product-tour'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/cn'

/**
 * Vertical icon rail: a 56px column of two-letter badges, one per top-level
 * screen. Dense by design — this app targets a 1600px monitor and 4+ hours
 * of daily use, so a labelled sidebar would waste width every other screen
 * needs.
 *
 * Settings and Suppression moved off the rail into the profile menu at the
 * bottom: they're configuration a recruiter visits occasionally, not screens
 * they switch between while working a campaign.
 */
const NAV_ITEMS = [
  { to: '/searches/new', badge: 'Se', label: 'New search', tour: 'nav-search' },
  { to: '/campaigns', badge: 'Ca', label: 'Campaigns', tour: 'nav-campaigns' },
] as const

export function NavRail() {
  const logout = useLogout()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const tour = useProductTour()

  return (
    <nav
      aria-label="Primary"
      className="flex w-14 flex-col items-center gap-2 border-r border-[var(--color-line)] bg-[var(--color-bg)] py-3"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          data-tour={item.tour}
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

      <button
        type="button"
        data-tour="help"
        aria-label="Take the product tour"
        title="Take the product tour"
        onClick={tour.start}
        className={cn(
          'mt-auto flex size-9 items-center justify-center rounded-[var(--radius-control)]',
          'border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]',
          'hover:bg-[var(--color-surface-sunk)] hover:text-[var(--color-ink)]',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
        )}
      >
        <CircleHelpIcon className="size-4" aria-hidden="true" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          data-tour="profile"
          aria-label="Profile and settings"
          title="Profile and settings"
          className={cn(
            'flex size-9 items-center justify-center rounded-full',
            'border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]',
            'hover:bg-[var(--color-surface-sunk)]',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
          )}
        >
          <UserIcon className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>

        <DropdownMenuContent side="right" align="end" className="w-56">
          <DropdownMenuLabel>
            <span className="block truncate text-[13px] text-[var(--color-ink)]">
              {user?.email ?? 'Signed in'}
            </span>
            {user?.role ? (
              <span className="block text-[11px] font-normal text-[var(--color-ink-muted)]">
                {user.role}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={tour.start}>
            <CircleHelpIcon className="size-4" aria-hidden="true" />
            Product tour
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/settings')}>
            <SettingsIcon className="size-4" aria-hidden="true" />
            Agent settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/suppression')}>
            <ShieldBanIcon className="size-4" aria-hidden="true" />
            Suppression list
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => logout.mutate()}
            className="text-[var(--color-sig-bad)]"
          >
            <LogOutIcon className="size-4" aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
