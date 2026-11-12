import { NavLink } from 'react-router-dom'

import { NAV } from './nav'
import { ThemeToggle } from './ThemeToggle'

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-line p-5 md:flex">
      <div className="flex items-center gap-3">
        <div className="from-logo-from to-logo-to text-logo-ink grid size-11 place-items-center rounded-2xl bg-gradient-to-br text-lg font-extrabold">
          GB
        </div>
        <span className="text-xl font-extrabold tracking-tight">GameplanBlitz</span>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition-colors ${
                isActive ? 'bg-card text-mint' : 'text-ink-2 hover:bg-card hover:text-ink'
              }`
            }
          >
            <Icon size={20} /> {label}
          </NavLink>
        ))}
      </nav>
      <ThemeToggle />
    </aside>
  )
}
