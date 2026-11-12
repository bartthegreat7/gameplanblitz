import { HeartPulse, Target, TrendingDown, TrendingUp, Trophy, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { greetingFor, type OddsSnapshot, type TeamHealth } from '../../lib/analytics/command'
import type { TeamOdds } from '../../lib/analytics/playoffs'
import { f1, signed } from '../../lib/format'
import type { GameDay } from '../../lib/insights'
import { CARD } from '../dashboard/styles'
import { Skeleton } from '../ui/states'

const pct = (x: number) => (x >= 99.95 ? '100%' : x > 0 && x < 0.5 ? '<1%' : `${Math.round(x)}%`)
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`

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
      className="group border-line/60 bg-card-2/70 hover:border-accent/50 hover:bg-card-2 flex min-w-0 items-center gap-3 rounded-xl border p-4 transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="text-ink-2 flex items-center gap-1.5 text-sm font-semibold">
          <Icon size={16} aria-hidden className={tone} />
          {label}
        </span>
        {children}
      </span>
      {aside}
    </Link>
  )
}

const Big = ({ children }: { children: ReactNode }) => (
  <span className="mt-1.5 block text-[1.75rem] leading-none font-extrabold tracking-tight tabular-nums">
    {children}
  </span>
)
const Sub = ({ children, className = 'text-ink-3' }: { children: ReactNode; className?: string }) => (
  <span className={`mt-1.5 block truncate text-xs font-semibold ${className}`}>{children}</span>
)

/** Circular meter (0-100) drawn from the value itself. */
function Ring({ value, label }: { value: number; label: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={label} className="size-16 shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-line/70" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`}
        className="stroke-accent-deep"
      />
    </svg>
  )
}

const HEALTH = {
  ready: { label: 'Ready', cls: 'text-good' },
  monitor: { label: 'Monitor', cls: 'text-amber' },
  action: { label: 'Action needed', cls: 'text-bad' },
} as const

/** Greeting plus the four headline numbers of the week. */
export function Welcome({
  name,
  week,
  leagueName,
  gd,
  health,
  odds,
  oddsLoading,
  oddsChange,
  seasonDone,
}: {
  name: string
  week: number
  leagueName: string
  gd: GameDay | null
  health: TeamHealth | null
  odds: TeamOdds | null
  oddsLoading: boolean
  oddsChange: { delta: number; since: OddsSnapshot } | null
  seasonDone: boolean
}) {
  const [hour] = useState(() => new Date().getHours())
  const hasOpp = !!gd && gd.oppRosterId !== null
  const margin = gd && hasOpp ? gd.myProj - gd.oppProj : 0
  return (
    <section aria-label="Welcome" className={`${CARD} p-5 sm:p-6`}>
      <h2 className="text-2xl font-extrabold tracking-tight md:text-[1.75rem]">
        {greetingFor(hour)}, {name}
      </h2>
      <p className="text-ink-2 mt-0.5">
        NFL Week {week} · {leagueName}
      </p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 @[52rem]/main:grid-cols-4">
        <StatCard
          icon={Trophy}
          tone="text-amber"
          label="Win Probability"
          to="/?tab=matchup"
          aside={
            gd && hasOpp ? <Ring value={gd.winPct} label={`${gd.winPct}% win probability`} /> : undefined
          }
        >
          {gd && hasOpp ? (
            <>
              <Big>{gd.winPct}%</Big>
              <Sub className={margin >= 0 ? 'text-good' : 'text-bad'}>Proj. margin {signed(margin)}</Sub>
              <Sub>vs {gd.oppName} · model</Sub>
            </>
          ) : (
            <>
              <Big>—</Big>
              <Sub>{gd ? 'Bye week: no opponent' : 'No matchup posted yet'}</Sub>
            </>
          )}
        </StatCard>

        <StatCard icon={Target} tone="text-accent" label="Projected Points" to="/lineup">
          {gd ? (
            <>
              <Big>{f1(gd.myProj)}</Big>
              <Sub>
                {hasOpp ? (
                  <>
                    Opponent <b className="text-ink-2">{f1(gd.oppProj)}</b> · best lineups
                  </>
                ) : (
                  'No opponent this week'
                )}
              </Sub>
              {hasOpp && (
                <span aria-hidden className="bg-line/60 mt-2 flex h-1.5 overflow-hidden rounded-full">
                  <span
                    className="bg-accent-deep h-full rounded-full"
                    style={{ width: `${(gd.myProj / Math.max(0.1, gd.myProj + gd.oppProj)) * 100}%` }}
                  />
                </span>
              )}
            </>
          ) : (
            <>
              <Big>—</Big>
              <Sub>No matchup posted yet</Sub>
            </>
          )}
        </StatCard>

        <StatCard icon={HeartPulse} tone="text-good" label="Team Health" to="/injuries">
          {health ? (
            <>
              <Big>
                <span className={HEALTH[health.status].cls}>{HEALTH[health.status].label}</span>
              </Big>
              <Sub>
                {health.ready} of {health.slots} starters available
              </Sub>
              <Sub className={health.concerns.length ? 'text-amber' : 'text-ink-3'}>
                {health.concerns.length
                  ? `${health.concerns.length} need${health.concerns.length === 1 ? 's' : ''} attention: ${health.concerns
                      .slice(0, 2)
                      .map((c) => (c.id ? `${c.name} (${c.status})` : `${c.slot} empty`))
                      .join(', ')}`
                  : 'No designations in your lineup · Sleeper'}
              </Sub>
            </>
          ) : (
            <>
              <Big>—</Big>
              <Sub>No lineup posted yet</Sub>
            </>
          )}
        </StatCard>

        <StatCard icon={TrendingUp} tone="text-good" label="Playoff Odds" to="/playoffs">
          {odds ? (
            <>
              <Big>{pct(odds.playoffPct)}</Big>
              {oddsChange && Math.abs(oddsChange.delta) >= 0.5 ? (
                <Sub className={oddsChange.delta > 0 ? 'text-good' : 'text-bad'}>
                  <span className="inline-flex items-center gap-1">
                    {oddsChange.delta > 0 ? (
                      <TrendingUp size={13} aria-hidden />
                    ) : (
                      <TrendingDown size={13} aria-hidden />
                    )}
                    {oddsChange.delta > 0 ? '+' : '−'}
                    {Math.round(Math.abs(oddsChange.delta))} pts since {md(oddsChange.since.day)}
                  </span>
                </Sub>
              ) : (
                <Sub>
                  {oddsChange
                    ? `No change since ${md(oddsChange.since.day)}`
                    : 'First snapshot in this browser'}
                </Sub>
              )}
              <Sub>Title {pct(odds.championPct)} · simulation</Sub>
            </>
          ) : oddsLoading ? (
            <span className="mt-2 block">
              <Skeleton className="h-7 w-20" />
            </span>
          ) : (
            <>
              <Big>—</Big>
              <Sub>
                {seasonDone ? 'The regular season is over' : 'Unavailable: schedule not loaded'}
              </Sub>
            </>
          )}
        </StatCard>
      </div>
    </section>
  )
}
