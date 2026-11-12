import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Sun,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { useSession } from '../../hooks/useSession'
import { weekIsLive } from '../../lib/analytics/gameday'
import { relTime } from '../../lib/format'
import { getRosters, getSchedule, getUser } from '../../lib/sleeper'
import { useAppStore } from '../../store/app'
import { TeamAvatar } from '../ui/Avatar'
import { GAME_DAY, isGroup, NAV_SECTIONS, SETTINGS, type NavGroup, type NavLeaf } from './nav'

/* Navigation styling. Three levels, each visibly different:
   section headings (small caps, muted) > top-level rows (icon + 14.5px) > submenu rows (13.5px, on a guide line).
   Surfaces: sidebar < raised (hover) < active (selected, with an accent bar and accent icon). */
const ROW =
  'group/row relative flex items-center gap-3 rounded-lg transition-colors duration-150 focus-visible:-outline-offset-2'
const TOP = `${ROW} min-h-[38px] px-3 text-[14.5px]`
const RAIL = `${ROW} mx-auto size-11 justify-center`
const idle = 'text-ink-2 font-medium hover:bg-raised hover:text-ink'
/* the current page: a solid blue row (white text and icon) */
const selected = 'bg-select text-select-ink font-semibold shadow-[0_6px_16px_-8px_var(--select)]'
const iconCls = (on: boolean, solid = true) =>
  `shrink-0 transition-colors ${on ? (solid ? 'text-select-ink' : 'text-accent') : 'text-ink-3 group-hover/row:text-ink-2'}`

const inGroup = (g: NavGroup, pathname: string) =>
  g.children.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`))

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative grid size-10 shrink-0 place-items-center">
        <Shield size={40} strokeWidth={1.75} aria-hidden className="text-accent fill-accent/15 absolute inset-0 drop-shadow-[0_6px_14px_var(--accent)]" />
        <span className="text-ink relative -mt-0.5 text-[12px] font-extrabold tracking-tight">GB</span>
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-lg font-extrabold tracking-tight">GamePlanBitz</div>
          <div className="text-ink-3 truncate text-[10px] font-bold tracking-[0.12em] uppercase">
            Fantasy football HQ
          </div>
        </div>
      )}
    </div>
  )
}

function Leaf({
  item,
  collapsed,
  onNavigate,
  live = false,
}: {
  item: NavLeaf
  collapsed: boolean
  onNavigate?: () => void
  live?: boolean
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? `${item.label}${live ? ', live' : ''}` : undefined}
      className={({ isActive }) => `${collapsed ? RAIL : TOP} ${isActive ? selected : idle}`}
    >
      {({ isActive }) => (
        <>
          <Icon size={collapsed ? 20 : 18} aria-hidden className={iconCls(isActive)} />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
          {live &&
            (collapsed ? (
              <span aria-hidden className="bg-good ring-sidebar absolute top-2 right-2 size-2 rounded-full ring-2" />
            ) : (
              <span className="bg-good/15 text-good inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold">
                <span aria-hidden className="bg-good size-1.5 animate-pulse rounded-full" />
                Live
              </span>
            ))}
        </>
      )}
    </NavLink>
  )
}

/** A group's contents: the user's Sleeper leagues (My Leagues only), then its pages. */
function GroupItems({
  group,
  variant,
  onNavigate,
}: {
  group: NavGroup
  variant: 'tree' | 'flyout'
  onNavigate?: () => void
}) {
  const { leagues, leagueId } = useSession()
  const setLeagueId = useAppStore((s) => s.setLeagueId)
  const flyout = variant === 'flyout'
  const base = `${ROW} w-full text-left ${flyout ? 'min-h-10 gap-2.5 px-3 text-sm' : 'min-h-9 px-3 text-[13.5px]'}`
  const hover = flyout
    ? 'text-ink-2 font-medium hover:bg-active/50 hover:text-ink'
    : 'text-ink-2 font-medium hover:bg-raised hover:text-ink'
  // on the guide line, the selected page gets an accent segment over the line
  const bar = flyout
    ? ''
    : 'before:bg-accent before:absolute before:inset-y-1.5 before:-left-[13px] before:w-0.5 before:rounded-full'
  return (
    <>
      {group.id === 'leagues' && leagues.length > 0 && (
        <div className="mb-1 grid gap-0.5">
          <div className="text-ink-3 px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
            Sleeper leagues
          </div>
          {leagues.map((l) => {
            const on = l.league_id === leagueId
            return (
              <button
                key={l.league_id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setLeagueId(l.league_id)
                  onNavigate?.()
                }}
                className={`${base} ${on ? 'text-ink font-semibold' : hover}`}
              >
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                {on && <Check size={15} aria-hidden className="text-accent shrink-0" />}
              </button>
            )
          })}
          <div aria-hidden className="bg-line/50 mx-3 my-1.5 h-px" />
        </div>
      )}
      {group.children.map((c) => (
        <NavLink
          key={c.to}
          to={c.to}
          onClick={onNavigate}
          className={({ isActive }) => `${base} ${isActive ? `${selected} ${bar}` : hover}`}
        >
          {({ isActive }) => (
            <>
              {flyout && <c.icon size={16} aria-hidden className={iconCls(isActive)} />}
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </>
  )
}

/** Expanded sidebar and drawer: an accordion. Opens by itself when you land on one of its pages. */
function TreeGroup({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const holdsActive = inGroup(group, pathname)
  const [open, setOpen] = useState(holdsActive)
  const [held, setHeld] = useState(holdsActive)
  if (held !== holdsActive) {
    setHeld(holdsActive)
    if (holdsActive) setOpen(true)
  }
  const panelId = useId()
  const Icon = group.icon
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        className={`${TOP} w-full text-left ${holdsActive ? 'text-ink hover:bg-raised font-semibold' : idle}`}
      >
        <Icon size={18} aria-hidden className={iconCls(holdsActive, false)} />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        {holdsActive && !open && <span aria-hidden className="bg-accent size-1.5 rounded-full" />}
        <ChevronDown
          size={16}
          aria-hidden
          className={`text-ink-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          id={panelId}
          className="nav-reveal border-line/60 mt-1 mb-2 ml-[21px] grid gap-0.5 border-l pl-3"
        >
          <GroupItems group={group} variant="tree" onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

interface Anchor {
  left: number
  top?: number
  bottom?: number
  /** opened from the keyboard: move focus into the panel */
  keyboard: boolean
}

/** Collapsed icon rail: one icon per group that opens a flyout panel beside the rail. */
function RailGroup({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const holdsActive = inGroup(group, pathname)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setAnchor(null)
  }
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const open = anchor !== null
  const Icon = group.icon

  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) =>
      !!t && (panel.current?.contains(t as Node) || btn.current?.contains(t as Node))
    const onDown = (e: globalThis.MouseEvent) => {
      if (!inside(e.target)) setAnchor(null)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAnchor(null)
        btn.current?.focus()
      }
    }
    // the panel is placed once; close it rather than leave it misaligned
    const onMove = (e: Event) => {
      if (!inside(e.target)) setAnchor(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  useEffect(() => {
    if (anchor?.keyboard) panel.current?.querySelector<HTMLElement>('a,button')?.focus()
  }, [anchor])

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    if (open) return setAnchor(null)
    const r = e.currentTarget.getBoundingClientRect()
    // just past the rail's edge, not the icon's
    const edge = e.currentTarget.closest('aside')?.getBoundingClientRect().right ?? r.right
    const below = r.top < window.innerHeight * 0.55
    setAnchor({
      left: edge + 8,
      top: below ? Math.max(8, r.top - 8) : undefined,
      bottom: below ? undefined : Math.max(8, window.innerHeight - r.bottom - 8),
      keyboard: e.detail === 0,
    })
  }

  const arrows = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('a,button') ?? [])]
    if (!items.length) return
    e.preventDefault()
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next].focus()
  }

  return (
    <div
      onBlur={(e) => {
        // tabbing past the panel closes it
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setAnchor(null)
      }}
    >
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-label={group.label}
        title={group.label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`${RAIL} ${open ? 'bg-raised text-ink' : holdsActive ? 'text-ink hover:bg-raised' : idle}`}
      >
        <Icon size={20} aria-hidden className={iconCls(holdsActive, false)} />
        <ChevronRight
          size={11}
          strokeWidth={3}
          aria-hidden
          className="text-ink-3 absolute right-0.5 bottom-1.5"
        />
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          role="group"
          aria-label={group.label}
          tabIndex={-1}
          onKeyDown={arrows}
          style={{
            left: anchor.left,
            top: anchor.top,
            bottom: anchor.bottom,
            maxHeight: `calc(100dvh - ${(anchor.top ?? anchor.bottom ?? 0) + 16}px)`,
          }}
          className="nav-flyout nav-scroll border-line/60 bg-card-2 fixed z-40 grid w-72 content-start gap-0.5 overflow-y-auto rounded-2xl border p-2 shadow-[0_24px_60px_-16px_rgb(0_0_0/0.6)] outline-none"
        >
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-2.5">
            <Icon size={16} aria-hidden className="text-accent" />
            <span className="text-[13px] font-bold tracking-wide">{group.label}</span>
          </div>
          <GroupItems group={group} variant="flyout" onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

/** Whether NFL games are underway this week (schedule only), for the Game Day badge. */
function useGamesLive() {
  const { season, week, username } = useSession()
  const q = useQuery({
    queryKey: ['schedule', season],
    queryFn: () => getSchedule(season!),
    enabled: !!username && !!season,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  return weekIsLive(q.data, week)
}

/** The full navigation, in headed sections: used by the desktop sidebar (expanded or icon rail) and the phone drawer. */
export function NavContent({
  collapsed = false,
  inDrawer = false,
  onNavigate,
}: {
  collapsed?: boolean
  inDrawer?: boolean
  onNavigate?: () => void
}) {
  const live = useGamesLive()
  const baseId = useId()
  return (
    <nav aria-label={inDrawer ? 'All pages' : 'Primary'} className="flex flex-col">
      {NAV_SECTIONS.map((sec, i) => {
        const headingId = `${baseId}-${sec.id}`
        const label = sec.label
        return (
          <div
            key={sec.id}
            role={label ? 'group' : undefined}
            aria-labelledby={label && !collapsed ? headingId : undefined}
            aria-label={label && collapsed ? label : undefined}
            className={`grid gap-0.5 ${i === 0 ? '' : collapsed ? 'mt-1' : 'mt-4'}`}
          >
            {collapsed || !label ? (
              i > 0 && <div aria-hidden className="bg-line/50 mx-auto mb-2 h-px w-6" />
            ) : (
              <div
                id={headingId}
                className="text-ink-3 px-3 pb-1.5 text-[11px] font-bold tracking-[0.14em] uppercase"
              >
                {label}
              </div>
            )}
            {sec.entries.map((e) =>
              isGroup(e) ? (
                collapsed ? (
                  <RailGroup key={e.id} group={e} onNavigate={onNavigate} />
                ) : (
                  <TreeGroup key={e.id} group={e} onNavigate={onNavigate} />
                )
              ) : (
                <Leaf
                  key={e.to}
                  item={e}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  live={e.to === GAME_DAY.to && live}
                />
              ),
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** One-button theme toggle (icon rail and the sidebar's connection card). */
function ThemeButton({ className, size = 20 }: { className: string; size?: number }) {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const next = theme === 'light' ? 'dark' : 'light'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`grid shrink-0 place-items-center rounded-lg transition-colors focus-visible:-outline-offset-2 ${className}`}
    >
      {theme === 'light' ? <Moon size={size} aria-hidden /> : <Sun size={size} aria-hidden />}
    </button>
  )
}

/** Light / Dark switch (a single icon button on the icon rail). */
export function ThemeSwitch({ collapsed = false }: { collapsed?: boolean }) {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  if (collapsed) return <ThemeButton className="text-ink-2 hover:bg-raised hover:text-ink size-11" />
  const opt = (t: 'light' | 'dark', Icon: typeof Sun, label: string) => (
    <button
      type="button"
      aria-pressed={theme === t}
      onClick={() => setTheme(t)}
      className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-colors ${
        theme === t ? 'bg-active text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
      }`}
    >
      <Icon size={15} aria-hidden /> {label}
    </button>
  )
  return (
    <div role="group" aria-label="Theme" className="bg-raised flex gap-1 rounded-xl p-1">
      {opt('light', Sun, 'Light')}
      {opt('dark', Moon, 'Dark')}
    </div>
  )
}

/** Sleeper connection: who, which league, and when league data last arrived. */
export function ConnectionBox({
  collapsed = false,
  withTheme = false,
  onNavigate,
}: {
  collapsed?: boolean
  /** add a theme toggle beside Settings (the desktop sidebar, which has no separate switch) */
  withTheme?: boolean
  onNavigate?: () => void
}) {
  const { username, leagues, leagueId } = useSession()
  const userQ = useQuery({
    queryKey: ['user', username],
    queryFn: () => getUser(username!),
    enabled: !!username,
    staleTime: Infinity,
  })
  // observe (never fetch) the cached rosters: their update time is the last sync
  const rostersQ = useQuery({
    queryKey: ['rosters', leagueId],
    queryFn: () => getRosters(leagueId!),
    enabled: false,
  })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!username) return null
  const league = leagues.find((l) => l.league_id === leagueId)
  const synced = rostersQ.dataUpdatedAt || 0
  if (collapsed)
    return (
      <NavLink
        to={SETTINGS.to}
        aria-label="Settings"
        title="Sleeper connected · Settings"
        onClick={onNavigate}
        className="relative grid place-items-center rounded-full"
      >
        <TeamAvatar user={userQ.data} className="size-10 text-sm" />
        <span aria-hidden className="bg-good ring-sidebar absolute right-0 bottom-0 size-2.5 rounded-full ring-2" />
      </NavLink>
    )
  return (
    <div className="bg-raised flex items-center gap-2.5 rounded-xl py-2.5 pr-1.5 pl-3">
      <span className="relative shrink-0">
        <TeamAvatar user={userQ.data} className="size-10 text-sm" />
        <span aria-hidden className="bg-good ring-raised absolute right-0 bottom-0 size-2.5 rounded-full ring-2" />
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="text-[13px] font-bold">Sleeper connected</div>
        <div className="text-accent truncate text-[13px] font-medium">
          {league?.name ?? `@${username}`}
        </div>
        <div className="text-ink-3 text-xs">
          {synced ? `Last sync ${relTime(synced, now)}` : 'Syncing…'}
        </div>
      </div>
      {withTheme && (
        <ThemeButton size={18} className="text-ink-2 hover:bg-active hover:text-ink size-9" />
      )}
      <NavLink
        to={SETTINGS.to}
        aria-label="Settings"
        onClick={onNavigate}
        className={({ isActive }) =>
          `grid size-9 shrink-0 place-items-center rounded-lg transition-colors focus-visible:-outline-offset-2 ${isActive ? 'bg-active text-accent' : 'text-ink-2 hover:bg-active hover:text-ink'}`
        }
      >
        <Settings size={18} aria-hidden />
      </NavLink>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggle = useAppStore((s) => s.toggleSidebar)
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <aside
      data-collapsed={collapsed}
      className={`border-line/60 bg-sidebar sticky top-0 z-[35] hidden h-dvh shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200 md:flex ${
        collapsed ? 'w-20' : 'w-[264px] xl:w-[280px]'
      }`}
    >
      <div
        className={`flex shrink-0 items-center gap-2 ${collapsed ? 'flex-col px-2 pt-5 pb-4' : 'justify-between px-4 pt-6 pb-5 xl:px-5'}`}
      >
        <Logo collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-ink-3 hover:bg-raised hover:text-ink grid size-9 shrink-0 place-items-center rounded-lg transition-colors"
        >
          <Toggle size={18} aria-hidden />
        </button>
      </div>
      <div
        className={`nav-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 ${collapsed ? 'px-2' : 'px-3 xl:px-4'}`}
      >
        <NavContent collapsed={collapsed} />
      </div>
      <div
        className={`border-line/40 grid shrink-0 gap-2.5 border-t ${collapsed ? 'justify-items-center px-2 py-4' : 'p-3 xl:p-4'}`}
      >
        <ConnectionBox collapsed={collapsed} withTheme={!collapsed} />
        {collapsed && <ThemeSwitch collapsed />}
      </div>
    </aside>
  )
}
