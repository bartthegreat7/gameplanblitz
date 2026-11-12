import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronDown,
  LogOut,
  Newspaper,
  Settings,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useLeagueData } from '../../hooks/useLeagueData'
import { useNews } from '../../hooks/useNews'
import { useSession } from '../../hooks/useSession'
import { lineupFacts } from '../../lib/analytics/scouting'
import { flexLabel } from '../../lib/lineup'
import { findMyMatchup } from '../../lib/insights'
import { playerIdsOf } from '../../lib/news'
import { mentioning, tsOf } from '../../lib/newsFeed'
import { relTime } from '../../lib/format'
import { getUser } from '../../lib/sleeper'
import { useAppStore } from '../../store/app'
import { TeamAvatar } from '../ui/Avatar'
import { Modal } from '../ui/Overlay'

const ICON_BTN =
  'border-line bg-card text-ink-2 hover:text-ink relative grid size-11 shrink-0 place-items-center rounded-full border transition-colors'

/** A button with a panel below it. Closes on outside click, Escape (focus returns) and navigation. */
function Popover({
  button,
  label,
  children,
  width = 'w-80',
}: {
  button: ReactNode
  label: string
  children: (close: () => void) => ReactNode
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={root} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={ICON_BTN}
      >
        {button}
      </button>
      {open && (
        <div
          id={id}
          role="region"
          aria-label={label}
          className={`border-line bg-card absolute right-0 z-40 mt-2 ${width} max-w-[calc(100vw-2rem)] rounded-2xl border p-2 shadow-2xl`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

interface Note {
  key: string
  text: string
  meta: string
  to?: string
  href?: string
  kind: 'fact' | 'news'
}

/** Things worth knowing now: problems in your set lineup (Sleeper facts) and fresh news about your players. */
export function Notifications() {
  const data = useLeagueData()
  const news = useNews()
  const [now] = useState(() => Date.now())
  const notes = useMemo<Note[]>(() => {
    if (data.status !== 'ready') return []
    const m = data.model
    const out: Note[] = []
    const facts = lineupFacts(m, findMyMatchup(data.matchups, m.myRosterId) ?? null)
    for (const s of facts?.empty ?? [])
      out.push({
        key: `e-${s}`,
        kind: 'fact',
        text: `Your ${flexLabel(s)} slot is empty`,
        meta: 'Sleeper lineup',
        to: '/lineup',
      })
    for (const u of facts?.unavailable ?? [])
      out.push({
        key: `o-${u.id}`,
        kind: 'fact',
        text: `${m.name(u.id)} is listed ${u.injury} and in your lineup`,
        meta: 'Sleeper injury status',
        to: '/lineup',
      })
    for (const u of facts?.questionable ?? [])
      out.push({
        key: `q-${u.id}`,
        kind: 'fact',
        text: `${m.name(u.id)} is ${u.injury}`,
        meta: 'Sleeper injury status',
        to: `/players/${u.id}`,
      })
    const roster = m.myRoster()?.players ?? []
    const recent = mentioning(news.data?.articles ?? [], new Set(roster), (a) =>
      playerIdsOf(a, roster, m.players),
    ).filter((a) => now - tsOf(a) <= 24 * 3_600_000)
    for (const a of recent.slice(0, 5))
      out.push({
        key: `n-${a.id}`,
        kind: 'news',
        text: a.title,
        meta: `${a.publisher ?? 'News'} · ${relTime(tsOf(a), now)}`,
        href: a.url,
      })
    return out
  }, [data, news.data, now])

  return (
    <Popover
      label={notes.length ? `Notifications (${notes.length})` : 'Notifications'}
      button={
        <>
          <Bell size={20} aria-hidden />
          {notes.length > 0 && (
            <span
              className="bg-accent ring-card absolute top-2 right-2.5 size-2.5 rounded-full ring-2"
              aria-hidden
            />
          )}
        </>
      }
    >
      {(close) =>
        notes.length === 0 ? (
          <p className="text-ink-3 p-3 text-sm">
            You're all caught up: no lineup problems and no new articles about your players in the
            last 24 hours.
          </p>
        ) : (
          <ul className="grid max-h-96 gap-0.5 overflow-y-auto">
            {notes.map((n) => {
              const inner = (
                <>
                  <span className={`mt-0.5 ${n.kind === 'fact' ? 'text-amber' : 'text-accent'}`}>
                    {n.kind === 'fact' ? (
                      <AlertTriangle size={16} aria-hidden />
                    ) : (
                      <Newspaper size={16} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{n.text}</span>
                    <span className="text-ink-3 block text-xs">{n.meta}</span>
                  </span>
                </>
              )
              const cls = 'hover:bg-active flex items-start gap-2.5 rounded-xl p-2.5'
              return (
                <li key={n.key}>
                  {n.href ? (
                    <a
                      href={n.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={close}
                      className={cls}
                    >
                      {inner}
                    </a>
                  ) : (
                    <Link to={n.to!} onClick={close} className={cls}>
                      {inner}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )
      }
    </Popover>
  )
}

export function UserMenu() {
  const username = useAppStore((s) => s.username)
  const signOut = useAppStore((s) => s.signOut)
  const navigate = useNavigate()
  const userQ = useQuery({
    queryKey: ['user', username],
    queryFn: () => getUser(username!),
    enabled: !!username,
    staleTime: Infinity,
  })
  const [confirm, setConfirm] = useState(false)
  if (!username) return null
  const item =
    'hover:bg-active flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold'
  return (
    <>
      <Popover
        label="Account"
        width="w-64"
        button={<TeamAvatar user={userQ.data} className="size-full text-sm" />}
      >
        {(close) => (
          <>
            <div className="border-line mb-1 border-b px-3 pt-1 pb-2.5">
              <div className="font-bold">{userQ.data?.display_name ?? username}</div>
              <div className="text-ink-3 text-xs">@{username} on Sleeper · read-only</div>
            </div>
            <Link to="/settings" onClick={close} className={item}>
              <Settings size={16} aria-hidden /> Settings
            </Link>
            <button
              type="button"
              onClick={() => {
                close()
                setConfirm(true)
              }}
              className={item}
            >
              <LogOut size={16} aria-hidden /> Switch Sleeper account
            </button>
          </>
        )}
      </Popover>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Switch Sleeper account?">
        <p className="text-ink-2 mb-4 text-sm">
          This forgets @{username} in this browser. Saved articles and theme are kept.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="border-line rounded-xl border px-4 py-2.5 font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm(false)
              signOut()
              navigate('/connect')
            }}
            className="bg-accent text-accent-ink rounded-xl px-4 py-2.5 font-extrabold"
          >
            Switch account
          </button>
        </div>
      </Modal>
    </>
  )
}

/** Pick the week every page shows: weeks 1 to the current NFL week. */
export function WeekSelect({ className = '' }: { className?: string }) {
  const { week, currentWeek, username } = useSession()
  const setViewWeek = useAppStore((s) => s.setViewWeek)
  if (!username) return null
  return (
    <label
      className={`border-line bg-card focus-within:border-accent relative flex h-11 items-center gap-2 rounded-xl border pr-9 pl-3 ${className}`}
    >
      <CalendarDays size={18} aria-hidden className="text-ink-2 shrink-0" />
      <select
        aria-label="NFL week"
        value={week}
        onChange={(e) => {
          const w = Number(e.target.value)
          setViewWeek(w === currentWeek ? null : w)
        }}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent pr-9 pl-10 font-bold text-transparent outline-none"
      >
        {Array.from({ length: currentWeek }, (_, i) => currentWeek - i).map((w) => (
          <option key={w} value={w} className="bg-card text-ink">
            NFL Week {w}
            {w === currentWeek ? ' (current)' : ''}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none font-bold whitespace-nowrap">
        NFL Week {week}
      </span>
      <ChevronDown
        size={16}
        aria-hidden
        className="text-ink-3 pointer-events-none absolute right-3"
      />
    </label>
  )
}
