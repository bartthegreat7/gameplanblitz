import { BarChart3, Star, Trophy } from 'lucide-react'

import { byeCount, type TeamOdds } from '../../lib/analytics/playoffs'
import { f1, ordinal } from '../../lib/format'
import { findMyMatchup, findOpponent, standings, type GameDay } from '../../lib/insights'
import type { Model } from '../../lib/model'
import type { SleeperMatchup } from '../../lib/sleeper'
import { TeamAvatar } from '../ui/Avatar'
import { EmptyState, Skeleton } from '../ui/states'
import { CardLink, DashboardCard, ModelTag } from './DashboardCard'

const pct = (x: number) =>
  x >= 99.95 ? '100%' : x > 0 && x < 0.05 ? '<0.1%' : `${x.toFixed(x >= 10 ? 0 : 1)}%`

/* ---------------- This Week's Matchup ---------------- */

function TeamBox({
  m,
  rosterId,
  proj,
  live,
  align,
}: {
  m: Model
  rosterId: number
  proj: number
  live: number | null
  align: 'left' | 'right'
}) {
  const rows = standings(m)
  const rank = rows.findIndex((r) => r.rosterId === rosterId) + 1
  const r = rows.find((x) => x.rosterId === rosterId)
  return (
    <div
      className={`border-line bg-card-2 flex min-w-0 flex-1 flex-col gap-2 rounded-xl border p-3 ${align === 'right' ? 'items-end text-right' : ''}`}
    >
      <div
        className={`flex min-w-0 items-center gap-2.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        <TeamAvatar user={m.ownerOf(rosterId)} className="size-10 text-sm" />
        <div className="min-w-0">
          <div className="truncate font-extrabold">{m.teamName(rosterId)}</div>
          {r && (
            <div className="text-ink-3 text-xs font-semibold">
              {r.w}-{r.l}
              {r.t ? `-${r.t}` : ''} ({ordinal(rank)})
            </div>
          )}
        </div>
      </div>
      <div className="text-3xl font-extrabold tabular-nums">{f1(live ?? proj)}</div>
      <div className="text-ink-3 -mt-1.5 text-xs font-semibold">
        {live !== null ? `Live · proj. ${f1(proj)}` : `Proj. ${f1(proj)}`}
      </div>
    </div>
  )
}

export function MatchupCard({
  m,
  matchups,
  gd,
  week,
}: {
  m: Model
  matchups: SleeperMatchup[]
  gd: GameDay | null
  week: number
}) {
  const mine = findMyMatchup(matchups, m.myRosterId)
  const opp = findOpponent(matchups, m.myRosterId)
  const started = (mine?.points ?? 0) > 0 || (opp?.points ?? 0) > 0
  return (
    <DashboardCard
      title="This Week's Matchup"
      icon={Star}
      tone="accent"
      aside={<span className="text-ink-3 text-sm font-semibold">Week {week}</span>}
      footer={gd && <CardLink to="/gameday">Open Game Day</CardLink>}
    >
      {!gd || !mine ? (
        <EmptyState>No Week {week} matchup is posted for your team yet.</EmptyState>
      ) : (
        <>
          <div className="relative flex gap-3">
            <TeamBox
              m={m}
              rosterId={m.myRosterId}
              proj={gd.myProj}
              live={started ? (mine.points ?? 0) : null}
              align="left"
            />
            <span className="border-line bg-panel text-ink-2 absolute top-1/2 left-1/2 z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-xs font-extrabold">
              vs
            </span>
            {gd.oppRosterId !== null ? (
              <TeamBox
                m={m}
                rosterId={gd.oppRosterId}
                proj={gd.oppProj}
                live={started ? (opp?.points ?? 0) : null}
                align="right"
              />
            ) : (
              <div className="border-line text-ink-3 grid flex-1 place-items-center rounded-xl border border-dashed p-3 text-sm">
                Bye week
              </div>
            )}
          </div>
          {gd.oppRosterId !== null && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="border-good/40 bg-good/12 text-good rounded-full border px-3 py-1 text-sm font-extrabold">
                {gd.winPct}% Win Chance
              </span>
              <ModelTag />
            </div>
          )}
        </>
      )}
    </DashboardCard>
  )
}

/* ---------------- League Standings ---------------- */

const STANDINGS_ROWS = 4

export function StandingsTable({ m, leagueName }: { m: Model; leagueName: string }) {
  const rows = standings(m)
  const myIdx = rows.findIndex((r) => r.me)
  // top rows, keeping my team visible
  const shown =
    myIdx < STANDINGS_ROWS
      ? rows.slice(0, STANDINGS_ROWS).map((r, i) => ({ r, i }))
      : [
          ...rows.slice(0, STANDINGS_ROWS - 1).map((r, i) => ({ r, i })),
          { r: rows[myIdx], i: myIdx },
        ]
  return (
    <DashboardCard
      title="League Standings"
      icon={BarChart3}
      tone="accent"
      aside={
        <span className="text-ink-3 max-w-[45%] truncate text-sm font-semibold">{leagueName}</span>
      }
      footer={
        <div className="text-center">
          <CardLink to="/standings">View Full Standings</CardLink>
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState>No teams in this league yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">League standings (top teams and yours)</caption>
            <thead>
              <tr className="text-ink-3 border-line border-b text-xs">
                <th scope="col" className="w-8 py-2 text-left font-semibold">
                  #
                </th>
                <th scope="col" className="py-2 text-left font-semibold">
                  Team
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  W-L
                </th>
                <th scope="col" className="py-2 pr-2 text-right font-semibold">
                  Pts For
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ r, i }) => (
                <tr
                  key={r.rosterId}
                  aria-current={r.me ? 'true' : undefined}
                  className={r.me ? 'bg-active font-bold' : 'border-line/60 border-b'}
                >
                  <td className={`py-2.5 pl-2 ${r.me ? 'rounded-l-lg' : ''}`}>{i + 1}</td>
                  <td className="max-w-0 truncate py-2.5 pr-2">{m.teamName(r.rosterId)}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {r.w}-{r.l}
                    {r.t ? `-${r.t}` : ''}
                  </td>
                  <td
                    className={`py-2.5 pr-2 text-right tabular-nums ${r.me ? 'rounded-r-lg' : ''}`}
                  >
                    {r.pf.toLocaleString(undefined, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  )
}

/* ---------------- Playoff Race ---------------- */

function Donut({ value }: { value: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 120 120" className="size-32 shrink-0 -rotate-90" aria-hidden>
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-panel" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        className="stroke-good"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, value))) / 100} ${c}`}
      />
    </svg>
  )
}

export function PlayoffProbability({
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
  const rows: { label: string; value: string; dot: string }[] = odds
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
      title="Playoff Race"
      icon={Trophy}
      tone="purple"
      aside={odds ? <ModelTag /> : undefined}
      footer={<CardLink to="/playoffs">Open Playoff Simulator</CardLink>}
    >
      {loading ? (
        <div className="flex items-center gap-4">
          <Skeleton className="size-32 !rounded-full" />
          <div className="grid flex-1 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-5" />
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <Donut value={odds.playoffPct} />
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{pct(odds.playoffPct)}</div>
                <div className="text-ink-3 text-[11px] font-semibold">Playoff odds</div>
              </div>
            </div>
          </div>
          <dl className="grid min-w-40 flex-1 gap-2.5 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-full ${r.dot}`} aria-hidden />
                <dt className="text-ink-2 flex-1">{r.label}</dt>
                <dd className="font-extrabold tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {odds && (
        <p className="text-ink-3 mt-2 text-xs">
          Seeded simulation of the remaining schedule ({playoffTeams} playoff spots).
        </p>
      )}
    </DashboardCard>
  )
}
