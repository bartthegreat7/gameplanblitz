import { BarChart3, CalendarDays, ChevronDown, ShieldCheck, Trophy, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useSession } from '../../hooks/useSession'
import { greetingFor, outlookLine, type OddsSnapshot, type TeamHealth } from '../../lib/analytics/command'
import type { TeamOdds } from '../../lib/analytics/playoffs'
import { f1 } from '../../lib/format'
import type { GameDay } from '../../lib/insights'
import { useAppStore } from '../../store/app'
import { CARD } from '../dashboard/styles'
import { Skeleton } from '../ui/states'

const pct = (x: number) => (x >= 99.95 ? '100%' : x > 0 && x < 0.5 ? '<1%' : `${Math.round(x)}%`)
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`
const up = (d: number) => (d >= 0 ? '▲' : '▼')

function StatCard({
  icon: Icon,
  tone,
  label,
  to,
  children,
  aside,
}: {
  icon: LucideIcon
  tone: string
  label: string
  to: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="group border-line/70 bg-card-2/70 hover:border-accent/50 hover:bg-card-2 flex min-w-0 flex-col rounded-xl border px-4 py-3 transition-colors"
    >
      <span className="flex items-center gap-2 text-[15px] font-bold">
        <Icon size={22} aria-hidden className={`shrink-0 ${tone}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1">{children}</span>
        {aside}
      </span>
    </Link>
  )
}

const Big = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`mt-1.5 block text-[1.75rem] leading-none font-extrabold tracking-tight tabular-nums ${className}`}>
    {children}
  </span>
)
const Sub = ({ children, className = 'text-ink-2' }: { children: ReactNode; className?: string }) => (
  <span className={`mt-1.5 block truncate text-[13px] font-semibold ${className}`}>{children}</span>
)

/** Circular meter (0-100) drawn from the value itself. */
function Ring({ value, label }: { value: number; label: string }) {
  const r = 24
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 60 60" role="img" aria-label={label} className="size-14 shrink-0 -rotate-90">
      <circle cx="30" cy="30" r={r} fill="none" strokeWidth="7" className="stroke-line/80" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`}
        className="stroke-good"
      />
    </svg>
  )
}

/** The week box: which NFL week the dashboard shows (a working picker) and where that week stands. */
function WeekBox({ note }: { note: string | null }) {
  const { week, currentWeek } = useSession()
  const setViewWeek = useAppStore((s) => s.setViewWeek)
  return (
    <label className="border-line/70 bg-bg/50 focus-within:border-accent relative flex shrink-0 items-center gap-3 rounded-xl border py-2 pr-8 pl-3 backdrop-blur-md">
      <CalendarDays size={26} aria-hidden className="text-ink-2 shrink-0" />
      <span className="leading-tight">
        <span className="block text-lg font-extrabold">Week {week}</span>
        {note && <span className="text-ink-2 block text-xs font-semibold">{note}</span>}
      </span>
      <ChevronDown size={16} aria-hidden className="text-ink-3 absolute right-2.5" />
      <select
        aria-label="NFL week"
        value={week}
        onChange={(e) => {
          const w = Number(e.target.value)
          setViewWeek(w === currentWeek ? null : w)
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {Array.from({ length: currentWeek }, (_, i) => currentWeek - i).map((w) => (
          <option key={w} value={w} className="bg-card text-ink">
            NFL Week {w}
            {w === currentWeek ? ' (current)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

const HEALTH = {
  ready: 'text-good',
  monitor: 'text-amber',
  action: 'text-bad',
} as const

/** Greeting, the week's outlook and the four headline numbers. */
export function Welcome({
  name,
  week,
  weekNote,
  gd,
  health,
  odds,
  oddsLoading,
  oddsChange,
  seasonDone,
}: {
  name: string
  week: number
  weekNote: string | null
  gd: GameDay | null
  health: TeamHealth | null
  odds: TeamOdds | null
  oddsLoading: boolean
  oddsChange: { delta: number; since: OddsSnapshot } | null
  seasonDone: boolean
}) {
  const [hour] = useState(() => new Date().getHours())
  const hasOpp = !!gd && gd.oppRosterId !== null
  const outlook = outlookLine(week, gd?.myProj ?? null, gd && hasOpp ? gd.oppProj : null)
  const margin = outlook.margin
  const questionable = health?.concerns.filter((c) => c.level === 'questionable').length ?? 0
  const blocking = (health?.concerns.length ?? 0) - questionable
  return (
    <section aria-label="Welcome" className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-[1.75rem] md:leading-tight">
            {greetingFor(hour)}, {name}
          </h2>
          <p className="text-ink-2 mt-0.5 md:text-lg">
            {outlook.text}
            {margin !== null && margin !== 0 && (
              <>
                {' '}
                <b className={margin > 0 ? 'text-good' : 'text-bad'}>{f1(Math.abs(margin))} points</b>.
              </>
            )}
          </p>
        </div>
        <WeekBox note={weekNote} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 @[46rem]/main:grid-cols-4">
        <StatCard
          icon={Trophy}
          tone="text-good"
          label="Win Probability"
          to="/?tab=matchup"
          aside={gd && hasOpp ? <Ring value={gd.winPct} label={`${gd.winPct}% win probability`} /> : undefined}
        >
          {gd && hasOpp ? (
            <>
              <Big>{gd.winPct}%</Big>
              <Sub className={margin! >= 0 ? 'text-good' : 'text-bad'}>
                {up(margin!)} {margin! >= 0 ? '+' : '−'}
                {f1(Math.abs(margin!))} pts
              </Sub>
              <span className="sr-only">Projected margin against {gd.oppName} (model).</span>
            </>
          ) : (
            <>
              <Big>—</Big>
              <Sub>{gd ? 'Bye week' : 'No matchup posted'}</Sub>
            </>
          )}
        </StatCard>

        <StatCard icon={BarChart3} tone="text-accent" label="Projected Points" to="/lineup">
          {gd ? (
            <>
              <Big>{f1(gd.myProj)}</Big>
              <Sub>{hasOpp ? `Opp: ${f1(gd.oppProj)}` : 'No opponent this week'}</Sub>
            </>
          ) : (
            <>
              <Big>—</Big>
              <Sub>No matchup posted</Sub>
            </>
          )}
        </StatCard>

        <StatCard icon={ShieldCheck} tone="text-good" label="Team Health" to="/injuries">
          {health ? (
            <>
              <Big className={HEALTH[health.status]}>{Math.round(health.readiness)}%</Big>
              <Sub>
                {health.status === 'ready'
                  ? 'All starters available'
                  : blocking
                    ? `${health.concerns.length} concern${health.concerns.length === 1 ? '' : 's'} · ${blocking} can't play`
                    : `${questionable} minor concern${questionable === 1 ? '' : 's'}`}
              </Sub>
              <span className="sr-only">
                {health.ready} of {health.slots} starters available.{' '}
                {health.concerns.map((c) => (c.id ? `${c.name} (${c.status})` : `${c.slot} empty`)).join(', ')}
              </span>
            </>
          ) : (
            <>
              <Big>—</Big>
              <Sub>No lineup posted</Sub>
            </>
          )}
        </StatCard>

        <StatCard icon={Trophy} tone="text-amber" label="Playoff Odds" to="/playoffs">
          {odds ? (
            <>
              <Big>{pct(odds.playoffPct)}</Big>
              {oddsChange && Math.abs(oddsChange.delta) >= 0.5 ? (
                <Sub className={oddsChange.delta > 0 ? 'text-good' : 'text-bad'}>
                  {up(oddsChange.delta)} {oddsChange.delta > 0 ? '+' : '−'}
                  {Math.round(Math.abs(oddsChange.delta))}% since {md(oddsChange.since.day)}
                </Sub>
              ) : (
                <Sub>{oddsChange ? `No change since ${md(oddsChange.since.day)}` : `Title ${pct(odds.championPct)}`}</Sub>
              )}
              {!oddsChange && <span className="sr-only">First snapshot in this browser.</span>}
            </>
          ) : oddsLoading ? (
            <span className="mt-2 block">
              <Skeleton className="h-8 w-20" />
            </span>
          ) : (
            <>
              <Big>—</Big>
              <Sub>{seasonDone ? 'Regular season over' : 'Schedule not loaded'}</Sub>
            </>
          )}
        </StatCard>
      </div>
    </section>
  )
}
