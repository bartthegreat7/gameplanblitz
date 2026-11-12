import { ExternalLink, FileText, Search, Shield, User } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { useLeagueData } from '../../hooks/useLeagueData'
import { useNews } from '../../hooks/useNews'
import { newestFirst } from '../../lib/newsFeed'
import { useAppStore } from '../../store/app'
import { Palette } from '../ui/Overlay'
import { NAV_LINKS } from './nav'

const FANTASY = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
const MAX_PLAYERS = 8
const MAX_ARTICLES = 5

interface Result {
  key: string
  group: 'Pages' | 'Players' | 'Teams' | 'Articles'
  label: string
  meta?: string
  icon: ReactNode
  /** internal route, or an external article URL */
  to?: string
  href?: string
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Players, teams and articles from the loaded league (only mounted when signed in). */
function useLeagueResults(q: string): Result[] {
  const data = useLeagueData()
  const news = useNews()
  return useMemo(() => {
    if (q.length < 2) return []
    const out: Result[] = []
    if (data.status === 'ready') {
      const m = data.model
      const rostered = m.allRostered()
      const players = Object.values(m.players)
        .filter((p) => FANTASY.has(p.position ?? '') && (p.team || rostered.has(p.player_id)))
        .filter((p) =>
          norm(p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`).includes(q),
        )
        .sort(
          (a, b) =>
            Number(rostered.has(b.player_id)) - Number(rostered.has(a.player_id)) ||
            (a.search_rank ?? 9999) - (b.search_rank ?? 9999),
        )
        .slice(0, MAX_PLAYERS)
      for (const p of players) {
        const owner = m.rosters.find((r) => (r.players ?? []).includes(p.player_id))
        out.push({
          key: `p-${p.player_id}`,
          group: 'Players',
          label: m.name(p.player_id),
          meta: `${p.position}${p.team ? ` · ${p.team}` : ''} · ${owner ? (owner.roster_id === m.myRosterId ? 'Your team' : m.teamName(owner.roster_id)) : 'Free agent'}`,
          icon: <User size={16} aria-hidden />,
          to: `/players/${p.player_id}`,
        })
      }
      for (const r of m.rosters)
        if (norm(m.teamName(r.roster_id)).includes(q))
          out.push({
            key: `t-${r.roster_id}`,
            group: 'Teams',
            label: m.teamName(r.roster_id),
            meta: 'League standings',
            icon: <Shield size={16} aria-hidden />,
            to: '/standings',
          })
    }
    for (const a of newestFirst(news.data?.articles ?? [])
      .filter((x) => norm(x.title).includes(q))
      .slice(0, MAX_ARTICLES))
      out.push({
        key: `a-${a.id}`,
        group: 'Articles',
        label: a.title,
        meta: a.publisher ?? undefined,
        icon: <FileText size={16} aria-hidden />,
        href: a.url,
      })
    return out
  }, [q, data, news.data])
}

function LeagueResults({ q, children }: { q: string; children: (r: Result[]) => ReactNode }) {
  return <>{children(useLeagueResults(q))}</>
}

function ResultList({
  results,
  close,
  inputRef,
}: {
  results: Result[]
  close: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const navigate = useNavigate()
  const listRef = useRef<HTMLUListElement>(null)
  const onKey = (e: KeyboardEvent) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-result]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[Math.min(i + 1, items.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (i <= 0) inputRef.current?.focus()
      else items[i - 1]?.focus()
    }
  }
  if (results.length === 0)
    return (
      <p className="text-ink-3 px-1 py-6 text-center text-sm">
        No matches. Try a player's name, a team, or a page.
      </p>
    )
  const groups = [...new Set(results.map((r) => r.group))]
  return (
    <ul ref={listRef} onKeyDown={onKey} aria-label="Search results" className="grid gap-3">
      {groups.map((g) => (
        <li key={g}>
          <div className="text-ink-3 mb-1 px-1 text-xs font-bold tracking-wide uppercase">{g}</div>
          <ul className="grid gap-0.5">
            {results
              .filter((r) => r.group === g)
              .map((r) => {
                const body = (
                  <>
                    <span className="text-ink-3">{r.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.label}</span>
                      {r.meta && (
                        <span className="text-ink-3 block truncate text-xs">{r.meta}</span>
                      )}
                    </span>
                    {r.href && <ExternalLink size={14} aria-hidden className="text-ink-3" />}
                  </>
                )
                const cls =
                  'hover:bg-active focus:bg-active flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left outline-none'
                return (
                  <li key={r.key}>
                    {r.href ? (
                      <a
                        data-result
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={close}
                        className={cls}
                      >
                        {body}
                        <span className="sr-only"> (opens the publisher's site)</span>
                      </a>
                    ) : (
                      <button
                        data-result
                        type="button"
                        onClick={() => {
                          close()
                          navigate(r.to!)
                        }}
                        className={cls}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                )
              })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/** Global search: pages always; players, teams and articles once a league is connected. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const username = useAppStore((s) => s.username)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const q = norm(text.trim())
  const pages: Result[] = NAV_LINKS.filter((l) => !q || norm(l.label).includes(q)).map((l) => ({
    key: `n-${l.to}`,
    group: 'Pages',
    label: l.label,
    icon: <l.icon size={16} aria-hidden />,
    to: l.to,
  }))
  const close = () => {
    setText('')
    onClose()
  }
  const first = (results: Result[]) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.currentTarget.closest('[role=dialog]')?.querySelector<HTMLElement>('[data-result]')?.focus()
    } else if (e.key === 'Enter' && results[0]) {
      e.preventDefault()
      e.currentTarget.closest('[role=dialog]')?.querySelector<HTMLElement>('[data-result]')?.click()
    }
  }
  const render = (league: Result[]) => {
    const results = [
      ...league.filter((r) => r.group !== 'Articles'),
      ...pages.slice(0, q ? 6 : 12),
      ...league.filter((r) => r.group === 'Articles'),
    ]
    return (
      <>
        <label className="border-line bg-panel focus-within:border-accent mb-4 flex items-center gap-2 rounded-xl border px-3">
          <Search size={18} aria-hidden className="text-ink-3" />
          <span className="sr-only">Search players, articles, or your league</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={first(results)}
            placeholder="Search players, articles, or your league…"
            className="min-h-12 flex-1 bg-transparent outline-none"
            autoComplete="off"
          />
        </label>
        <ResultList results={results} close={close} inputRef={inputRef} />
      </>
    )
  }
  return (
    <Palette open={open} onClose={close} title="Search">
      {username ? <LeagueResults q={q}>{render}</LeagueResults> : render([])}
    </Palette>
  )
}
