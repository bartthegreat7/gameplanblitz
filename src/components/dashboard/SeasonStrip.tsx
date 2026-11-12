import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { f1, ordinal, signed } from '../../lib/format'
import { bids, standings } from '../../lib/insights'
import { OUT_INJ } from '../../lib/lineup'
import type { Model } from '../../lib/model'
import type { SleeperLeague, SleeperMatchup } from '../../lib/sleeper'
import { ModelTag } from './DashboardCard'
import { CARD } from './styles'

function Cell({
  label,
  value,
  sub,
  to,
  tone,
  model = false,
}: {
  label: string
  value: ReactNode
  sub: ReactNode
  to: string
  tone?: 'good' | 'bad'
  model?: boolean
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="bg-card hover:bg-card-2 flex min-w-0 flex-col gap-1.5 p-5 transition-colors sm:p-6"
    >
      <span className="text-ink-2 flex items-center justify-between gap-2 text-sm font-semibold">
        {label}
        {model && <ModelTag />}
      </span>
      <span
        className={`text-3xl font-extrabold tracking-tight tabular-nums ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : ''}`}
      >
        {value}
      </span>
      <span className="text-ink-3 truncate text-sm">{sub}</span>
    </Link>
  )
}

/**
 * Four season facts that appear nowhere else on the dashboard: points for and rank, this week's
 * projection against the league, roster health, and the waiver budget.
 */
export function SeasonStrip({
  m,
  league,
  matchups,
  myProj,
  leagueAvg,
}: {
  m: Model
  league: SleeperLeague
  matchups: SleeperMatchup[]
  myProj: number | null
  leagueAvg: number | null
}) {
  const rows = standings(m)
  const me = rows.find((r) => r.me)
  const pfRank = [...rows].sort((a, b) => b.pf - a.pf).findIndex((r) => r.me) + 1
  const games = me ? me.w + me.l + me.t : 0

  const roster = m.myRoster()?.players ?? []
  const out = roster.filter((id) => OUT_INJ.has(m.injury(id))).length
  const q = roster.filter((id) => m.injury(id) && !OUT_INJ.has(m.injury(id))).length

  const b = bids(m, league, matchups)
  const priority = m.myRoster()?.settings?.waiver_position

  return (
    <section
      aria-label="Season at a glance"
      className={`${CARD} bg-line grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-2 xl:grid-cols-4`}
    >
      <Cell
        label="Season points"
        value={
          me
            ? me.pf.toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })
            : '—'
        }
        sub={
          games
            ? `${ordinal(pfRank)} of ${rows.length} · ${f1(me!.pf / games)} per game`
            : 'No games played yet'
        }
        to="/standings"
      />
      <Cell
        label="Projection vs league"
        model
        value={myProj !== null && leagueAvg !== null ? signed(myProj - leagueAvg) : '—'}
        tone={
          myProj !== null && leagueAvg !== null ? (myProj >= leagueAvg ? 'good' : 'bad') : undefined
        }
        sub={
          myProj !== null && leagueAvg !== null
            ? `${f1(myProj)} vs ${f1(leagueAvg)} league average`
            : 'No matchup posted'
        }
        to="/lineup"
      />
      <Cell
        label="Roster health"
        value={out ? `${out} Out` : q ? `${q} Questionable` : 'All clear'}
        tone={out ? 'bad' : q ? undefined : 'good'}
        sub={`${roster.length} players · ${q} questionable · ${out} out`}
        to="/players"
      />
      <Cell
        label="Waiver budget"
        value={b.usesFAAB ? `$${b.left}` : priority ? `#${priority}` : '—'}
        sub={
          b.usesFAAB
            ? `of $${b.budget} FAAB · ${ordinal(b.place)}-most in league`
            : priority
              ? 'Waiver priority'
              : 'Rolling waivers'
        }
        to="/waivers"
      />
    </section>
  )
}
