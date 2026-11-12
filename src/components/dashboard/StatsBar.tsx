import {
  BarChart3,
  ChevronRight,
  ListOrdered,
  Play,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { TeamOdds } from '../../lib/analytics/playoffs'
import { f1, ordinal, signed } from '../../lib/format'
import { standings, type GameDay } from '../../lib/insights'
import type { Model } from '../../lib/model'
import { CARD } from './styles'

const pct = (x: number) => (x >= 99.95 ? '100%' : x > 0 && x < 0.5 ? '<1%' : `${Math.round(x)}%`)

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  to,
  chevron = false,
}: {
  icon: LucideIcon
  tone: string
  label: string
  value: ReactNode
  sub?: ReactNode
  to: string
  chevron?: boolean
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="group hover:bg-bg/30 flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors"
    >
      <Icon size={28} aria-hidden className={`shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="text-ink-2 block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xl font-extrabold tracking-tight tabular-nums 2xl:text-2xl">
          {value}
        </span>
        {sub && <span className="block truncate text-xs font-semibold">{sub}</span>}
      </span>
      {chevron && (
        <ChevronRight size={20} aria-hidden className="text-ink-3 group-hover:text-ink shrink-0" />
      )}
    </Link>
  )
}

/** Compact strip of the week's headline numbers, each linking to the tool behind it. */
export function StatsBar({
  m,
  gd,
  leagueAvg,
  odds,
  oddsLoading,
  actions,
}: {
  m: Model
  gd: GameDay | null
  leagueAvg: number | null
  odds: TeamOdds | null
  oddsLoading: boolean
  actions: number
}) {
  const rows = standings(m)
  const rank = rows.findIndex((r) => r.me) + 1
  const me = rows.find((r) => r.me)
  const diff = gd && leagueAvg !== null ? gd.myProj - leagueAvg : null
  return (
    <section
      aria-label="This week at a glance"
      className={`${CARD} divide-line/60 grid grid-cols-1 divide-y sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-y-0`}
    >
      <Stat
        icon={BarChart3}
        tone="text-accent"
        label="Projected Points"
        value={gd ? f1(gd.myProj) : '—'}
        sub={
          diff !== null ? (
            <span
              className={diff >= 0 ? 'text-good' : 'text-bad'}
            >{`${diff >= 0 ? '▲' : '▼'} ${signed(diff)} vs. league avg`}</span>
          ) : (
            <span className="text-ink-3">No matchup posted</span>
          )
        }
        to="/lineup"
      />
      <Stat
        icon={Trophy}
        tone="text-amber"
        label="Win Probability"
        value={gd && gd.oppRosterId !== null ? `${gd.winPct}%` : '—'}
        sub={
          gd && gd.oppRosterId !== null ? (
            <span className="text-ink-3">vs. {gd.oppName} · model</span>
          ) : undefined
        }
        to="/gameday"
      />
      <Stat
        icon={Play}
        tone="text-good"
        label="Playoff Odds"
        value={odds ? pct(odds.playoffPct) : oddsLoading ? '…' : '—'}
        sub={
          odds ? (
            <span className="text-ink-3">Title {pct(odds.championPct)} · model</span>
          ) : undefined
        }
        to="/playoffs"
      />
      <Stat
        icon={ListOrdered}
        tone="text-accent"
        label="League Standing"
        value={rank ? `${ordinal(rank)} of ${rows.length}` : '—'}
        sub={
          me ? (
            <span className="text-ink-3">{`${me.w}-${me.l}${me.t ? `-${me.t}` : ''} · ${f1(me.pf)} pts for`}</span>
          ) : undefined
        }
        to="/standings"
      />
      <Stat
        icon={Zap}
        tone="text-amber"
        label="The Edge"
        value={actions ? `${actions} Action${actions === 1 ? '' : 's'}` : 'All clear'}
        sub={<span className="text-ink-3">Ranked by urgency</span>}
        to="/edge"
        chevron
      />
    </section>
  )
}
