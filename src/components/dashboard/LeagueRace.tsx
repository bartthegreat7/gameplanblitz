import { BarChart3, Trophy } from 'lucide-react'

import { byeCount, type TeamOdds } from '../../lib/analytics/playoffs'
import { ordinal } from '../../lib/format'
import { standings } from '../../lib/insights'
import type { Model } from '../../lib/model'
import { TeamAvatar } from '../ui/Avatar'
import { EmptyState, Skeleton } from '../ui/states'
import { CardLink, DashboardCard, ModelTag } from './DashboardCard'
import { CARD, PAD } from './styles'

const pct = (x: number) =>
  x >= 99.95 ? '100%' : x > 0 && x < 0.05 ? '<0.1%' : `${x.toFixed(x >= 10 ? 0 : 1)}%`
const STANDINGS_ROWS = 6
const pts = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function Standings({
  m,
  leagueName,
  playoffTeams,
}: {
  m: Model
  leagueName: string
  playoffTeams: number
}) {
  const rows = standings(m)
  const myIdx = rows.findIndex((r) => r.me)
  const shown =
    myIdx < STANDINGS_ROWS
      ? rows.slice(0, STANDINGS_ROWS).map((r, i) => ({ r, i }))
      : [
          ...rows.slice(0, STANDINGS_ROWS - 1).map((r, i) => ({ r, i })),
          { r: rows[myIdx], i: myIdx },
        ]
  return (
    <DashboardCard
      plain
      className={PAD}
      title="League Standings"
      subtitle={leagueName}
      icon={BarChart3}
      footer={<CardLink to="/standings">View full standings</CardLink>}
    >
      {rows.length === 0 ? (
        <EmptyState>No teams in this league yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-[15px]">
            <caption className="sr-only">League standings (top teams and yours)</caption>
            <thead>
              <tr className="text-ink-3 border-line border-b text-sm">
                <th scope="col" className="w-10 pb-2.5 text-left font-semibold">
                  #
                </th>
                <th scope="col" className="pb-2.5 text-left font-semibold">
                  Team
                </th>
                <th scope="col" className="w-16 pb-2.5 text-right font-semibold">
                  W-L
                </th>
                <th scope="col" className="w-24 pb-2.5 text-right font-semibold">
                  Pts For
                </th>
                <th
                  scope="col"
                  className="hidden w-32 pr-3 pb-2.5 text-right font-semibold sm:table-cell"
                >
                  Pts Against
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ r, i }) => (
                <tr
                  key={r.rosterId}
                  aria-current={r.me ? 'true' : undefined}
                  className={`${r.me ? 'bg-active font-bold' : ''} ${i === playoffTeams - 1 && i < rows.length - 1 ? 'border-accent/40 border-b border-dashed' : 'border-line/60 border-b last:border-0'}`}
                >
                  <td className={`py-2.5 pl-2 ${r.me ? 'rounded-l-lg' : ''}`}>{i + 1}</td>
                  <td className="py-2.5 pr-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <TeamAvatar user={m.ownerOf(r.rosterId)} className="size-7 text-[11px]" />
                      <span className="truncate">{m.teamName(r.rosterId)}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {r.w}-{r.l}
                    {r.t ? `-${r.t}` : ''}
                  </td>
                  <td
                    className={`py-2.5 pr-3 text-right tabular-nums sm:pr-0 ${r.me ? 'rounded-r-lg sm:rounded-none' : ''}`}
                  >
                    {pts(r.pf)}
                  </td>
                  <td
                    className={`text-ink-2 hidden py-2.5 pr-3 text-right tabular-nums sm:table-cell ${r.me ? 'rounded-r-lg' : ''}`}
                  >
                    {pts(r.pa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {playoffTeams < rows.length && (
            <p className="text-ink-3 mt-3 text-sm">
              Dashed line: the {ordinal(playoffTeams)} and final playoff spot.
            </p>
          )}
        </div>
      )}
    </DashboardCard>
  )
}

function Donut({ value }: { value: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 120 120" className="size-40 shrink-0 -rotate-90" aria-hidden>
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="11" className="stroke-panel" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="11"
        strokeLinecap="round"
        className="stroke-good"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, value))) / 100} ${c}`}
      />
    </svg>
  )
}

function PlayoffRace({
  odds,
  loading,
  seasonDone,
  playoffTeams,
  divisions,
}: {
  odds: TeamOdds | null
  loading: boolean
  seasonDone: boolean
  playoffTeams: number
  divisions: number
}) {
  const byes = byeCount(playoffTeams)
  const rows = odds
    ? [
        { label: 'Make Playoffs', value: pct(odds.playoffPct), dot: 'bg-good' },
        ...(divisions > 0
          ? [{ label: 'Win Division', value: 'Not modeled', dot: 'bg-accent' }]
          : []),
        ...(byes > 0
          ? [{ label: `Bye (Top ${byes})`, value: pct(odds.byePct), dot: 'bg-purple' }]
          : []),
        { label: 'Win League', value: pct(odds.championPct), dot: 'bg-amber' },
      ]
    : []
  return (
    <DashboardCard
      plain
      className={`border-line border-t lg:border-t-0 lg:border-l ${PAD}`}
      title="Playoff Race"
      subtitle={odds ? `${playoffTeams} playoff spots · seeded simulation` : undefined}
      icon={Trophy}
      tone="purple"
      aside={odds ? <ModelTag /> : undefined}
      footer={<CardLink to="/playoffs">Open Playoff Simulator</CardLink>}
    >
      {loading ? (
        <div className="flex items-center gap-6">
          <Skeleton className="size-40 !rounded-full" />
          <div className="grid flex-1 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        </div>
      ) : !odds ? (
        <EmptyState>
          {seasonDone
            ? 'The regular season is over: final standings set the bracket.'
            : "Playoff odds are unavailable: Sleeper hasn't posted the rest of the regular-season schedule."}
        </EmptyState>
      ) : (
        <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-5">
          <div className="relative">
            <Donut value={odds.playoffPct} />
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-3xl font-extrabold tabular-nums">{pct(odds.playoffPct)}</div>
                <div className="text-ink-3 text-xs font-semibold">Playoff odds</div>
              </div>
            </div>
          </div>
          <dl className="grid min-w-44 flex-1 gap-3.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-2.5">
                <span className={`size-2.5 shrink-0 rounded-full ${r.dot}`} aria-hidden />
                <dt className="text-ink-2 flex-1">{r.label}</dt>
                <dd className="text-lg font-extrabold tabular-nums">{r.value}</dd>
              </div>
            ))}
            <div className="border-line mt-1 grid grid-cols-2 gap-4 border-t pt-3.5">
              <div>
                <dt className="text-ink-3 text-sm">Projected seed</dt>
                <dd className="text-lg font-extrabold tabular-nums">{odds.avgSeed.toFixed(1)}</dd>
              </div>
              <div>
                <dt className="text-ink-3 text-sm">Projected wins</dt>
                <dd className="text-lg font-extrabold tabular-nums">{odds.avgWins.toFixed(1)}</dd>
              </div>
            </div>
          </dl>
        </div>
      )}
    </DashboardCard>
  )
}

/** Standings and playoff odds as one panel: where you stand, and where that leads. */
export function LeagueRace(p: {
  m: Model
  leagueName: string
  playoffTeams: number
  odds: TeamOdds | null
  loading: boolean
  seasonDone: boolean
  divisions: number
}) {
  return (
    <div className={`${CARD} grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]`}>
      <Standings m={p.m} leagueName={p.leagueName} playoffTeams={p.playoffTeams} />
      <PlayoffRace
        odds={p.odds}
        loading={p.loading}
        seasonDone={p.seasonDone}
        playoffTeams={p.playoffTeams}
        divisions={p.divisions}
      />
    </div>
  )
}
