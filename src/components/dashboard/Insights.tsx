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
      className={`inline-block min-w-14 rounded-md border px-2 py-1 text-center text-xs font-extrabold ${cls}`}
    >
      {{ start: 'Start', bench: 'Bench', empty: 'Empty' }[kind]}
    </span>
  )
}

function PlayerCell({ m, c }: { m: Model; c: Candidate | null }) {
  if (!c) return <span className="text-ink-3">Empty slot</span>
  return (
    <Link to={`/players/${c.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
      <PlayerAvatar player={m.players[c.id]} className="size-9 text-xs" />
      <span className="min-w-0">
        <span className="block truncate font-bold">{c.name}</span>
        <span className="text-ink-3 block truncate text-sm">
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
  className = '',
}: {
  m: Model
  analysis: LineupAnalysis | null
  week: number
  className?: string
}) {
  const [view, setView] = useState<View>('optimized')
  const toggle = (
    <div
      role="group"
      aria-label="Lineup view"
      className="border-line bg-panel flex rounded-lg border p-0.5 text-sm font-bold"
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
          className={`min-h-9 rounded-md px-3 transition-colors ${view === v ? 'bg-active text-ink shadow-[inset_0_0_0_1px_var(--plan-line)]' : 'text-ink-3 hover:text-ink'}`}
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
      subtitle={
        plan
          ? `Week ${week} · ${f1(plan.current.proj)} as set → ${f1(plan.recommended.proj)} optimized`
          : `Week ${week}`
      }
      icon={Zap}
      className={className}
      aside={analysis ? toggle : undefined}
      footer={<CardLink to="/lineup">View full lineup &amp; optimization</CardLink>}
    >
      {!plan ? (
        <EmptyState>No Week {week} matchup is posted for your team yet.</EmptyState>
      ) : (
        <div className="@container overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-[15px]">
            <caption className="sr-only">
              {view === 'optimized' ? 'Optimized lineup' : 'Your current lineup'} for Week {week}
            </caption>
            <thead>
              <tr className="text-ink-3 border-line border-b text-sm">
                <th scope="col" className="w-14 pb-2.5 text-left font-semibold">
                  Pos
                </th>
                <th scope="col" className="pb-2.5 text-left font-semibold">
                  Player
                </th>
                <th
                  scope="col"
                  className="hidden w-24 pb-2.5 text-left font-semibold @sm:table-cell"
                >
                  Opp
                </th>
                <th scope="col" className="w-16 pb-2.5 text-right font-semibold">
                  Proj
                </th>
                <th scope="col" className="w-20 pb-2.5 pl-3 text-right font-semibold">
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
                    <td className="text-ink-2 py-2.5 font-bold">{s.label}</td>
                    <td className="py-2.5 pr-3">
                      <PlayerCell m={m} c={c} />
                    </td>
                    <td className="text-ink-2 hidden py-2.5 whitespace-nowrap @sm:table-cell">
                      {c?.bye ? 'Bye' : c?.opponent ? `vs ${c.opponent}` : '—'}
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums">
                      {c ? f1(c.out ? 0 : c.proj) : '—'}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <Status kind={kind} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  )
}

/* ---------------- Top Waiver Targets ---------------- */

const WAIVER_TARGETS = 6

export function WaiverTargets({
  m,
  report,
  loading,
  className = '',
}: {
  m: Model
  report: WaiverReport | null
  loading: boolean
  className?: string
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
      subtitle="Free agents in your league, by lineup gain"
      icon={Plus}
      tone="good"
      className={className}
      footer={<CardLink to="/waivers">Open Waiver Sniper</CardLink>}
    >
      {loading && !report ? (
        <ListSkeleton rows={4} />
      ) : list.length === 0 ? (
        <EmptyState>No free agent in your league beats your lineup right now.</EmptyState>
      ) : (
        <ol className="grid grid-cols-1">
          {list.map((c, i) => (
            <li
              key={c.id}
              className="border-line/60 flex items-center gap-3.5 border-b py-3 first:pt-0 last:border-0"
            >
              <span className="text-ink-3 w-5 shrink-0 text-center text-sm font-extrabold">
                {i + 1}
              </span>
              <PlayerAvatar player={m.players[c.id]} className="size-11 text-sm" />
              <div className="min-w-0 flex-1">
                <Link to={`/players/${c.id}`} className="block truncate font-bold hover:underline">
                  {c.name}
                </Link>
                <div className="text-ink-3 truncate text-sm">
                  {c.pos} – {c.team || 'FA'}
                  {c.drop ? ` · drop ${c.drop.name}` : ' · open roster spot'}
                </div>
                <div className="text-good flex items-center gap-1 truncate text-sm font-semibold">
                  <TrendingUp size={14} aria-hidden className="shrink-0" />
                  <span className="truncate">
                    {c.kind === 'upgrade'
                      ? (c.signals[0] ?? 'Projected lineup upgrade')
                      : `Stash: ${c.signals.slice(0, 2).join(', ')}`}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-extrabold tabular-nums">
                  {c.kind === 'upgrade' ? `+${f1(c.gainPerWeek)}` : 'Stash'}
                </div>
                <div className="text-ink-3 text-xs">
                  {c.kind === 'upgrade' ? 'pts/wk' : 'speculative'}
                </div>
              </div>
              <Link
                to="/waivers"
                aria-label={`Review adding ${c.name}`}
                title={`Add ${c.name}${c.drop ? `, drop ${c.drop.name}` : ''}`}
                className="border-good/50 text-good hover:bg-good/12 grid size-10 shrink-0 place-items-center rounded-lg border-2 transition-colors"
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

function Thumb({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || !isHttpUrl(src) || failed)
    return (
      <span
        aria-hidden
        className="border-line bg-panel text-ink-3 grid h-16 w-24 shrink-0 place-items-center rounded-lg border @3xl:h-32 @3xl:w-full"
      >
        <Newspaper size={22} />
      </span>
    )
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-16 w-24 shrink-0 rounded-lg object-cover @3xl:h-32 @3xl:w-full"
    />
  )
}

const NEWS_ITEMS = 4

export function FantasyNews({
  news,
  className = '',
}: {
  news: UseQueryResult<NewsResponse>
  className?: string
}) {
  const [now] = useState(() => Date.now())
  const items = newestFirst(news.data?.articles ?? []).slice(0, NEWS_ITEMS)
  const unavailable = news.data?.unavailable ?? []
  return (
    <DashboardCard
      title="Latest Fantasy News"
      subtitle={
        unavailable.length
          ? `Not available (no public feed): ${unavailable.map((u) => u.name).join(', ')}.`
          : 'From connected publishers'
      }
      icon={Newspaper}
      className={className}
      footer={<CardLink to="/news">All news &amp; articles</CardLink>}
    >
      {news.isPending ? (
        <ListSkeleton rows={4} />
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
        <div className="@container">
          <ul className="grid grid-cols-1 @3xl:grid-cols-4 @3xl:gap-5">
            {items.map((a) => {
              const pub = a.publisher ?? 'Publisher'
              return (
                <li
                  key={a.id}
                  className="border-line/60 border-b py-3 first:pt-0 last:border-0 @3xl:border-0 @3xl:py-0"
                >
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-4 @3xl:flex-col @3xl:gap-3"
                  >
                    <Thumb src={a.image} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`mb-1 inline-block rounded px-1.5 py-px text-[11px] font-extrabold ${pubTone(pub)}`}
                      >
                        {pub}
                      </span>
                      <span className="line-clamp-2 block leading-snug font-bold group-hover:underline">
                        {a.title}
                      </span>
                      <span className="text-ink-3 block text-sm">
                        {relTime(tsOf(a), now)}
                        <span className="sr-only"> (opens the publisher's site)</span>
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </DashboardCard>
  )
}
