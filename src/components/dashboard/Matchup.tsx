import { Swords } from 'lucide-react'

import { f1, ordinal, signed } from '../../lib/format'
import { findMyMatchup, findOpponent, standings, type GameDay } from '../../lib/insights'
import type { Model } from '../../lib/model'
import type { SleeperMatchup } from '../../lib/sleeper'
import { TeamAvatar } from '../ui/Avatar'
import { EmptyState } from '../ui/states'
import { CardLink, DashboardCard, ModelTag } from './DashboardCard'

function Side({
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
  const right = align === 'right'
  return (
    <div className={`flex min-w-0 flex-col gap-3 ${right ? 'items-end text-right' : ''}`}>
      <div className={`flex min-w-0 items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
        <TeamAvatar user={m.ownerOf(rosterId)} className="size-12 text-base" />
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold">{m.teamName(rosterId)}</div>
          {r && (
            <div className="text-ink-3 text-sm font-semibold">
              {r.w}-{r.l}
              {r.t ? `-${r.t}` : ''} ({ordinal(rank)})
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="text-5xl font-extrabold tracking-tight tabular-nums 2xl:text-6xl">
          {f1(live ?? proj)}
        </div>
        <div className="text-ink-3 mt-1 text-sm font-semibold">
          {live !== null ? `Live · proj. ${f1(proj)}` : `Proj. ${f1(proj)}`}
        </div>
      </div>
    </div>
  )
}

/** Projected points edge per lineup position, summed over the slot battles behind the headline projection. */
function PositionEdges({ gd }: { gd: GameDay }) {
  const groups = new Map<string, number>()
  for (const b of gd.battles) groups.set(b.slot, (groups.get(b.slot) ?? 0) + b.me.pj - b.opp.pj)
  if (groups.size === 0) return null
  return (
    <div className="mt-5">
      <div className="text-ink-3 mb-2.5 text-sm font-semibold">Projected edge by position</div>
      <ul className="flex flex-wrap gap-2">
        {[...groups].map(([slot, d]) => (
          <li
            key={slot}
            className={`rounded-lg border px-2.5 py-1.5 text-sm font-bold tabular-nums ${d > 0.05 ? 'border-good/30 bg-good/10 text-good' : d < -0.05 ? 'border-bad/30 bg-bad/10 text-bad' : 'border-line bg-panel text-ink-2'}`}
          >
            <span className="text-ink-2 mr-1.5 font-semibold">{slot}</span>
            {signed(d)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Primary focal card: both teams, their projected (or live) scores, and the win probability. */
export function MatchupHero({
  m,
  matchups,
  gd,
  week,
  className = '',
}: {
  m: Model
  matchups: SleeperMatchup[]
  gd: GameDay | null
  week: number
  className?: string
}) {
  const mine = findMyMatchup(matchups, m.myRosterId)
  const opp = findOpponent(matchups, m.myRosterId)
  const started = (mine?.points ?? 0) > 0 || (opp?.points ?? 0) > 0
  const hasOpp = !!gd && gd.oppRosterId !== null
  return (
    <DashboardCard
      title="This Week's Matchup"
      icon={Swords}
      className={className}
      aside={
        started ? (
          <span className="border-good/40 bg-good/12 text-good rounded-full border px-3 py-1 text-sm font-bold">
            Live
          </span>
        ) : (
          <span className="text-ink-3 text-sm font-semibold">Week {week}</span>
        )
      }
      footer={
        gd && (
          <>
            <CardLink to="/gameday">Open Game Day</CardLink>
            {hasOpp && <CardLink to="/scouting">Scout {gd.oppName}</CardLink>}
          </>
        )
      }
    >
      {!gd || !mine ? (
        <EmptyState>No Week {week} matchup is posted for your team yet.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-5">
            <Side
              m={m}
              rosterId={m.myRosterId}
              proj={gd.myProj}
              live={started ? (mine.points ?? 0) : null}
              align="left"
            />
            <span className="border-line bg-panel text-ink-3 mt-3 grid size-10 place-items-center rounded-full border text-xs font-extrabold">
              VS
            </span>
            {hasOpp ? (
              <Side
                m={m}
                rosterId={gd.oppRosterId!}
                proj={gd.oppProj}
                live={started ? (opp?.points ?? 0) : null}
                align="right"
              />
            ) : (
              <div className="text-ink-3 self-center text-right">Bye week</div>
            )}
          </div>
          {hasOpp && (
            <div className="border-line mt-6 border-t pt-5">
              <div className="mb-2.5 flex items-center justify-between gap-3 text-sm">
                <span>
                  <b className="text-good text-2xl font-extrabold tabular-nums">{gd.winPct}%</b>{' '}
                  <span className="text-ink-2">Win Chance</span>
                </span>
                <ModelTag />
                <span className="text-ink-2">
                  {100 - gd.winPct}% {gd.oppName}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Win probability"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={gd.winPct}
                className="bg-panel flex h-2.5 overflow-hidden rounded-full"
              >
                <div className="bg-good h-full rounded-full" style={{ width: `${gd.winPct}%` }} />
              </div>
              <PositionEdges gd={gd} />
            </div>
          )}
        </>
      )}
    </DashboardCard>
  )
}
