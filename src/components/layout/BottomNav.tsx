import { NavLink } from 'react-router-dom'

import { NAV } from './nav'

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="border-line bg-card fixed inset-x-0 bottom-0 z-10 grid grid-cols-6 border-t pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
              isActive ? 'text-accent' : 'text-ink-3'
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
