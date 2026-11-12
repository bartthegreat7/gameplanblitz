import { Ellipsis } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import { NAV_LINKS } from './nav'

const TAB =
  'flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold'

/** Phone tab bar: the primary pages plus "More", which opens the full navigation drawer. */
export function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { pathname } = useLocation()
  const primary = NAV_LINKS.filter((n) => n.primary)
  const inMore = !primary.some((n) =>
    n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(`${n.to}/`),
  )

  return (
    <nav
      aria-label="Primary"
      className="border-line bg-sidebar/95 fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
    >
      {primary.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          aria-label={item.short ?? item.label}
          className={({ isActive }) => `${TAB} ${isActive ? 'text-accent' : 'text-ink-3'}`}
        >
          <item.icon size={22} aria-hidden />
          {item.short ?? item.label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onMore}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        className={`${TAB} ${inMore ? 'text-accent' : 'text-ink-3'}`}
      >
        <Ellipsis size={22} aria-hidden />
        More
      </button>
    </nav>
  )
}
