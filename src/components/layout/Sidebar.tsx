import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAppStore } from '../../store/app'
import { NAV } from './nav'
import { ThemeToggle } from './ThemeToggle'

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggle = useAppStore((s) => s.toggleSidebar)
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <aside
      data-collapsed={collapsed}
      className={`border-line sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 border-r p-4 transition-[width] md:flex ${
        collapsed ? 'w-[76px]' : 'w-60'
      }`}
    >
      <div className="flex items-center gap-3 px-1">
        <div className="from-logo-from to-logo-to text-logo-ink grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-lg font-extrabold">
          GB
        </div>
        {!collapsed && <span className="text-xl font-extrabold tracking-tight">GameplanBlitz</span>}
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition-colors ${collapsed ? 'justify-center' : ''} ${
                isActive ? 'bg-card text-accent' : 'text-ink-2 hover:bg-card hover:text-ink'
              }`
            }
          >
            <Icon size={20} aria-hidden /> {!collapsed && label}
          </NavLink>
        ))}
      </nav>
      <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : 'justify-between'}`}>
        <ThemeToggle />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="border-line bg-card text-ink-2 hover:text-ink grid size-11 place-items-center rounded-full border"
        >
          <Toggle size={20} aria-hidden />
        </button>
      </div>
    </aside>
  )
}
