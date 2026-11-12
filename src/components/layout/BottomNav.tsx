import { Ellipsis } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { Drawer } from '../ui/Overlay'
import { NAV } from './nav'

const TAB = 'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold'

export function BottomNav() {
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  const primary = NAV.filter((n) => n.primary)
  const secondary = NAV.filter((n) => !n.primary)
  const inMore = secondary.some((n) => n.to === pathname || pathname.startsWith(`${n.to}/`))

  return (
    <>
      <nav
        aria-label="Primary"
        className="border-line bg-card fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom,0px)] md:hidden"
      >
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `${TAB} ${isActive ? 'text-accent' : 'text-ink-3'}`}>
            <Icon size={22} aria-hidden />
            {label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className={`${TAB} ${inMore ? 'text-accent' : 'text-ink-3'}`}>
          <Ellipsis size={22} aria-hidden />
          More
        </button>
      </nav>
      <Drawer open={more} onClose={() => setMore(false)} title="More">
        <ul className="grid gap-1.5">
          {secondary.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={() => setMore(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 font-semibold ${isActive ? 'bg-panel text-accent' : 'text-ink-2'}`
                }
              >
                <Icon size={20} aria-hidden /> {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  )
}
