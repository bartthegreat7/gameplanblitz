import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { useSession } from '../../hooks/useSession'
import { weekIsLive } from '../../lib/analytics/gameday'
import { relTime } from '../../lib/format'
import { getRosters, getSchedule, getUser } from '../../lib/sleeper'
import { useAppStore } from '../../store/app'
import { TeamAvatar } from '../ui/Avatar'
import { GAME_DAY, isGroup, NAV_TREE, SETTINGS, type NavGroup, type NavLeaf } from './nav'

const ITEM =
  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-semibold transition-colors'
const itemCls = (active: boolean, collapsed: boolean) =>
  `${ITEM} ${collapsed ? 'justify-center' : ''} ${active ? 'bg-active text-ink shadow-[inset_0_0_0_1px_var(--plan-line)]' : 'text-ink-2 hover:bg-card hover:text-ink'}`

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="from-logo-from to-logo-to text-logo-ink grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-lg font-extrabold shadow-[0_8px_24px_-10px_var(--accent)]">
        GB
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="text-xl font-extrabold tracking-tight">GameplanBlitz</div>
          <div className="text-ink-3 text-[10px] font-bold tracking-[0.12em] uppercase">
            Fantasy football command center
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
  badge,
}: {
  item: NavLeaf
  collapsed: boolean
  onNavigate?: () => void
  badge?: React.ReactNode
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) => itemCls(isActive, collapsed)}
    >
      <Icon size={20} aria-hidden className="shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && badge}
    </NavLink>
  )
}

function Group({
  group,
  collapsed,
  open: forceOpen,
  onNavigate,
}: {
  group: NavGroup
  collapsed: boolean
  open?: boolean
  onNavigate?: () => void
}) {
  const { pathname } = useLocation()
  const { leagues, leagueId } = useSession()
  const setLeagueId = useAppStore((s) => s.setLeagueId)
  const holdsActive = group.children.some(
    (c) => pathname === c.to || pathname.startsWith(`${c.to}/`),
  )
  const [open, setOpen] = useState(holdsActive)
  const shown = forceOpen || open || holdsActive
  const Icon = group.icon

  // the icon rail shows a group's pages as icons
  if (collapsed)
    return (
      <>
        {group.children.map((c) => (
          <Leaf key={c.to} item={c} collapsed onNavigate={onNavigate} />
        ))}
      </>
    )

  return (
    <div>
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setOpen(!shown)}
        className={`${itemCls(false, false)} w-full text-left`}
      >
        <Icon size={20} aria-hidden className="shrink-0" />
        <span className="flex-1">{group.label}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`text-ink-3 transition-transform ${shown ? '' : '-rotate-90'}`}
        />
      </button>
      {shown && (
        <div className="border-line mt-1 ml-5 grid gap-0.5 border-l pl-3">
          {group.id === 'leagues' &&
            leagues.map((l) => (
              <button
                key={l.league_id}
                type="button"
                aria-pressed={l.league_id === leagueId}
                onClick={() => {
                  setLeagueId(l.league_id)
                  onNavigate?.()
                }}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-sm font-semibold ${l.league_id === leagueId ? 'text-accent' : 'text-ink-2 hover:text-ink'}`}
              >
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                {l.league_id === leagueId && <Check size={15} aria-hidden />}
              </button>
            ))}
          {group.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-10 items-center rounded-lg px-2.5 text-sm font-semibold ${isActive ? 'bg-active text-ink' : 'text-ink-2 hover:text-ink'}`
              }
            >
              {c.label}
            </NavLink>
          ))}
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

/** The full navigation: used by the desktop sidebar and the phone drawer. */
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
  return (
    <nav aria-label={inDrawer ? 'All pages' : 'Primary'} className="flex flex-col gap-1">
      {NAV_TREE.map((e) =>
        isGroup(e) ? (
          <Group
            key={e.id}
            group={e}
            collapsed={collapsed}
            open={inDrawer}
            onNavigate={onNavigate}
          />
        ) : (
          <Leaf key={e.to} item={e} collapsed={collapsed} onNavigate={onNavigate} />
        ),
      )}
      <div className="border-line my-2 border-t" />
      <div className={collapsed ? '' : 'border-line bg-card rounded-xl border'}>
        <Leaf
          item={GAME_DAY}
          collapsed={collapsed}
          onNavigate={onNavigate}
          badge={
            live ? (
              <span className="border-good/40 bg-good/15 text-good rounded-md border px-2 py-0.5 text-xs font-bold">
                Live
              </span>
            ) : undefined
          }
        />
      </div>
    </nav>
  )
}

/** Light / Dark switch (a single icon button on the icon rail). */
export function ThemeSwitch({ collapsed = false }: { collapsed?: boolean }) {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  if (collapsed) {
    const next = theme === 'light' ? 'dark' : 'light'
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} theme`}
        className="border-line bg-card text-ink-2 hover:text-ink grid size-11 place-items-center rounded-full border"
      >
        {theme === 'light' ? <Moon size={20} aria-hidden /> : <Sun size={20} aria-hidden />}
      </button>
    )
  }
  const opt = (t: 'light' | 'dark', Icon: typeof Sun, label: string) => (
    <button
      type="button"
      aria-pressed={theme === t}
      onClick={() => setTheme(t)}
      className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors ${
        theme === t
          ? 'bg-active text-ink shadow-[inset_0_0_0_1px_var(--plan-line)]'
          : 'text-ink-2 hover:text-ink'
      }`}
    >
      <Icon size={16} aria-hidden /> {label}
    </button>
  )
  return (
    <div
      role="group"
      aria-label="Theme"
      className="border-line bg-panel flex gap-1 rounded-full border p-1"
    >
      {opt('light', Sun, 'Light')}
      {opt('dark', Moon, 'Dark')}
    </div>
  )
}

/** Sleeper connection: who, which league, and when league data last arrived. */
export function ConnectionBox({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
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
        className="grid place-items-center"
      >
        <TeamAvatar user={userQ.data} className="size-11 text-sm" />
      </NavLink>
    )
  return (
    <div className="border-line bg-card flex items-center gap-3 rounded-2xl border p-3">
      <TeamAvatar user={userQ.data} className="size-11 text-sm" />
      <div className="min-w-0 flex-1 leading-snug">
        <div className="text-sm font-bold">Sleeper connected</div>
        <div className="text-accent truncate text-sm">{league?.name ?? `@${username}`}</div>
        <div className="text-ink-3 flex items-center gap-1 text-xs">
          <span className="bg-good inline-block size-1.5 rounded-full" aria-hidden />
          {synced ? `Last sync ${relTime(synced, now)}` : 'Syncing…'}
        </div>
      </div>
      <NavLink
        to={SETTINGS.to}
        aria-label="Settings"
        onClick={onNavigate}
        className="text-ink-2 hover:text-ink grid size-10 place-items-center rounded-full"
      >
        <Settings size={20} aria-hidden />
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
      className={`border-line bg-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col gap-5 overflow-y-auto border-r px-3 py-4 transition-[width] duration-200 md:flex ${
        collapsed ? 'w-[76px]' : 'w-64 xl:w-[300px] xl:px-4'
      }`}
    >
      <div className={`flex items-center gap-2 px-1 ${collapsed ? 'flex-col' : 'justify-between'}`}>
        <Logo collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="text-ink-3 hover:text-ink grid size-9 shrink-0 place-items-center rounded-lg"
        >
          <Toggle size={18} aria-hidden />
        </button>
      </div>
      <div className="flex-1">
        <NavContent collapsed={collapsed} />
      </div>
      <div className="grid gap-3">
        <ConnectionBox collapsed={collapsed} />
        <ThemeSwitch collapsed={collapsed} />
      </div>
    </aside>
  )
}
