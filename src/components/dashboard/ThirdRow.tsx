import type { UseQueryResult } from '@tanstack/react-query'
import { Newspaper, Plus, TrendingUp, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { LineupAnalysis } from '../../lib/analytics/lineupAnalysis'
import type { Candidate } from '../../lib/analytics/lineupPlan'
import type { WaiverCandidate, WaiverReport } from '../../lib/analytics/waivers'
import { f1, isHttpUrl, relTime } from '../../lib/format'
import type { Model } from '../../lib/model'
import { NewsNotPublished, type NewsResponse } from '../../lib/news'
import { newestFirst, tsOf } from '../../lib/newsFeed'
import { PlayerAvatar } from '../ui/Avatar'
import { EmptyState, ErrorState, ListSkeleton } from '../ui/states'
import { CardLink, DashboardCard } from './DashboardCard'

/* ---------------- Optimal Lineup ---------------- */

type View = 'optimized' | 'mine'

function Status({ kind }: { kind: 'start' | 'bench' | 'empty' }) {
  const cls = {
    start: 'border-good/40 bg-good/12 text-good',
    bench: 'border-bad/40 bg-bad/10 text-bad',
    empty: 'border-amber/40 bg-amber/10 text-amber',
  }[kind]
  return (
    <span
      className={`inline-block min-w-14 rounded-md border px-2 py-0.5 text-center text-xs font-extrabold ${cls}`}
    >
      {{ start: 'Start', bench: 'Bench', empty: 'Empty' }[kind]}
    </span>
  )
}

function PlayerCell({ m, c }: { m: Model; c: Candidate | null }) {
  if (!c) return <span className="text-ink-3">Empty slot</span>
  return (
    <Link to={`/players/${c.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
      <PlayerAvatar player={m.players[c.id]} className="size-8 text-[11px]" />
      <span className="min-w-0">
        <span className="block truncate font-bold">{c.name}</span>
        <span className="text-ink-3 block truncate text-xs">
          {c.team || 'FA'} {c.pos}
          {c.injury ? <span className="text-bad"> · {c.injury}</span> : null}
        </span>
      </span>
    </Link>
  )
}

export function OptimalLineup({
  m,
  analysis,
  week,
}: {
  m: Model
  analysis: LineupAnalysis | null
  week: number
}) {
  const [view, setView] = useState<View>('optimized')
  const toggle = (
    <div
      role="group"
      aria-label="Lineup view"
      className="border-line bg-panel flex rounded-lg border p-0.5 text-xs font-bold"
    >
      {(
        [
          ['optimized', 'Optimized'],
          ['mine', 'My Lineup'],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={`min-h-8 rounded-md px-2.5 transition-colors ${view === v ? 'bg-active text-ink shadow-[inset_0_0_0_1px_var(--plan-line)]' : 'text-ink-3 hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
  const plan = analysis?.plan
  return (
    <DashboardCard
      title="Optimal Lineup"
      icon={Zap}
      tone="accent"
      aside={analysis ? toggle : undefined}
      footer={<CardLink to="/lineup">View Full Lineup &amp; Optimization</CardLink>}
    >
      {!plan ? (
        <EmptyState>No Week {week} matchup is posted for your team yet.</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <caption className="sr-only">
                {view === 'optimized' ? 'Optimized lineup' : 'Your current lineup'} for Week {week}
              </caption>
              <thead>
                <tr className="text-ink-3 border-line border-b text-xs">
                  <th scope="col" className="w-11 py-2 text-left font-semibold">
                    Pos
                  </th>
                  <th scope="col" className="py-2 text-left font-semibold">
                    Player
                  </th>
                  <th
                    scope="col"
                    className="hidden w-20 py-2 text-left font-semibold sm:table-cell"
                  >
                    Opp
                  </th>
                  <th scope="col" className="w-14 py-2 text-right font-semibold">
                    Proj
                  </th>
                  <th scope="col" className="w-[4.5rem] py-2 pl-2 text-right font-semibold">
                    Start?
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.slots.map((s, i) => {
                  const c = view === 'optimized' ? s.recommended : s.current
                  const kind = !c
                    ? 'empty'
                    : view === 'optimized' || !s.changed || s.move
                      ? 'start'
                      : 'bench'
                  return (
                    <tr
                      key={`${s.slot}-${i}`}
                      className={`border-line/60 border-b last:border-0 ${view === 'optimized' && s.changed && !s.move ? 'bg-accent/5' : ''}`}
                    >
                      <td className="text-ink-2 py-2 font-bold">{s.label}</td>
                      <td className="py-2 pr-2">
                        <PlayerCell m={m} c={c} />
                      </td>
                      <td className="text-ink-2 hidden py-2 whitespace-nowrap sm:table-cell">
                        {c?.bye ? 'Bye' : c?.opponent ? `vs ${c.opponent}` : '—'}
                      </td>
                      <td className="py-2 text-right font-bold tabular-nums">
                        {c ? f1(c.out ? 0 : c.proj) : '—'}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <Status kind={kind} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-ink-3 mt-2 text-xs">
            Projected {f1(plan.current.proj)} as set →{' '}
            <b className="text-ink-2">{f1(plan.recommended.proj)}</b> optimized (
            {analysis.provider
              ? `Sleeper projections, ${analysis.provider}`
              : 'Sleeper projections'}
            ).
          </p>
        </>
      )}
    </DashboardCard>
  )
}

/* ---------------- Top Waiver Targets ---------------- */

const WAIVER_TARGETS = 3

export function WaiverTargets({
  m,
  report,
  loading,
}: {
  m: Model
  report: WaiverReport | null
  loading: boolean
}) {
  const list: WaiverCandidate[] = report
    ? [
        ...report.candidates.filter((c) => c.kind === 'upgrade'),
        ...report.candidates.filter((c) => c.kind === 'speculative'),
      ].slice(0, WAIVER_TARGETS)
    : []
  return (
    <DashboardCard
      title="Top Waiver Targets"
      icon={Plus}
      tone="good"
      aside={<CardLink to="/waivers">View All</CardLink>}
    >
      {loading && !report ? (
        <ListSkeleton rows={3} />
      ) : list.length === 0 ? (
        <EmptyState>No free agent in your league beats your lineup right now.</EmptyState>
      ) : (
        <ol className="grid gap-1">
          {list.map((c, i) => (
            <li
              key={c.id}
              className="border-line/60 flex items-center gap-3 border-b py-2 last:border-0"
            >
              <span className="border-line bg-panel text-ink-2 grid size-7 shrink-0 place-items-center rounded-full border text-sm font-extrabold">
                {i + 1}
              </span>
              <PlayerAvatar player={m.players[c.id]} className="size-10 text-xs" />
              <div className="min-w-0 flex-1">
                <Link to={`/players/${c.id}`} className="block truncate font-bold hover:underline">
                  {c.name}
                </Link>
                <div className="text-ink-3 truncate text-xs">
                  {c.pos} – {c.team || 'FA'}
                  {c.drop ? ` · drop ${c.drop.name}` : ' · open roster spot'}
                </div>
                <div className="text-good flex items-center gap-1 truncate text-xs font-semibold">
                  <TrendingUp size={13} aria-hidden className="shrink-0" />
                  <span className="truncate">
                    {c.kind === 'upgrade'
                      ? (c.signals[0] ?? 'Projected lineup upgrade')
                      : `Stash: ${c.signals.slice(0, 2).join(', ')}`}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-extrabold tabular-nums">
                  {c.kind === 'upgrade' ? `+${f1(c.gainPerWeek)}` : 'Stash'}
                </div>
                <div className="text-ink-3 text-[11px]">
                  {c.kind === 'upgrade' ? 'pts/wk' : 'speculative'}
                </div>
              </div>
              <Link
                to="/waivers"
                aria-label={`Review adding ${c.name}`}
                title={`Add ${c.name}${c.drop ? `, drop ${c.drop.name}` : ''}`}
                className="border-good/50 text-good hover:bg-good/12 grid size-9 shrink-0 place-items-center rounded-lg border-2 transition-colors"
              >
                <Plus size={18} aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </DashboardCard>
  )
}

/* ---------------- Latest Fantasy News ---------------- */

const PUB_TONES = [
  'bg-coral text-bad-ink',
  'bg-accent text-accent-ink',
  'bg-purple text-accent-ink',
  'bg-good text-accent-ink',
  'bg-amber text-accent-ink',
]
const pubTone = (name: string) =>
  PUB_TONES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PUB_TONES.length]

function Thumb({ src, publisher }: { src?: string | null; publisher: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || !isHttpUrl(src) || failed)
    return (
      <span
        aria-hidden
        className="border-line bg-panel text-ink-3 grid h-14 w-20 shrink-0 place-items-center rounded-lg border"
      >
        <Newspaper size={20} />
      </span>
    )
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-14 w-20 shrink-0 rounded-lg object-cover"
      title={publisher}
    />
  )
}

const NEWS_ITEMS = 3

export function FantasyNews({ news }: { news: UseQueryResult<NewsResponse> }) {
  const [now] = useState(() => Date.now())
  const items = newestFirst(news.data?.articles ?? []).slice(0, NEWS_ITEMS)
  const unavailable = news.data?.unavailable ?? []
  return (
    <DashboardCard
      title="Latest Fantasy News"
      icon={Newspaper}
      tone="accent"
      aside={<CardLink to="/news">View All</CardLink>}
    >
      {news.isPending ? (
        <ListSkeleton rows={3} />
      ) : news.isError ? (
        news.error instanceof NewsNotPublished ? (
          <EmptyState>
            The news feed hasn't been published yet. It refreshes every 2 hours once the site
            deploys.
          </EmptyState>
        ) : (
          <ErrorState
            title="Couldn't load news"
            message={news.error.message}
            onRetry={() => void news.refetch()}
          />
        )
      ) : items.length === 0 ? (
        <EmptyState>No recent articles from connected publishers.</EmptyState>
      ) : (
        <ul className="grid gap-1">
          {items.map((a) => {
            const pub = a.publisher ?? 'Publisher'
            return (
              <li key={a.id} className="border-line/60 border-b py-2 last:border-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-3"
                >
                  <Thumb src={a.image} publisher={pub} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`mb-1 inline-block rounded px-1.5 py-px text-[11px] font-extrabold ${pubTone(pub)}`}
                    >
                      {pub}
                    </span>
                    <span className="line-clamp-2 block text-sm leading-snug font-bold group-hover:underline">
                      {a.title}
                    </span>
                    <span className="text-ink-3 block text-xs">
                      {pub} · {relTime(tsOf(a), now)}
                      <span className="sr-only"> (opens the publisher's site)</span>
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
      {unavailable.length > 0 && (
        <p className="text-ink-3 mt-2 text-xs">
          Not available (no public feed): {unavailable.map((u) => u.name).join(', ')}.
        </p>
      )}
    </DashboardCard>
  )
}
