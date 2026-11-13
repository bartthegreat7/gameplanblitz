import { ArrowRight, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'

import { f1, ordinal } from '../../lib/format'
import { findMyMatchup, findOpponent, standings, type GameDay } from '../../lib/insights'
import type { Model } from '../../lib/model'
import type { SleeperMatchup } from '../../lib/sleeper'
import { CARD } from '../dashboard/styles'
import { TeamAvatar } from '../ui/Avatar'
import { EmptyState } from '../ui/states'

function Side({ m, rosterId, mine }: { m: Model; rosterId: number; mine: boolean }) {
  const rows = standings(m)
  const rank = rows.findIndex((r) => r.rosterId === rosterId) + 1
  const r = rows.find((x) => x.rosterId === rosterId)
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <TeamAvatar user={m.ownerOf(rosterId)} className={`size-12 text-base ${mine ? 'ring-accent/60 ring-2' : ''}`} />
      <div className="mt-2 line-clamp-2 w-full leading-tight font-extrabold">{m.teamName(rosterId)}</div>
      {r && (
        <div className="text-ink-2 text-sm font-semibold">
          {r.w}-{r.l}
          {r.t ? `-${r.t}` : ''} ({ordinal(rank)})
        </div>
      )}
    </div>
  )
}

/** This week's matchup at a glance: both teams, the projection, the win chance and a link to the full analysis. */
export function MatchupCompact({
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
  const hasOpp = !!gd && gd.oppRosterId !== null
  const live = (mine?.points ?? 0) > 0 || (opp?.points ?? 0) > 0
  return (
    <section aria-label="This Week's Matchup" className={`${CARD} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <h2 className="mb-2 flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
        <Swords size={22} aria-hidden className="text-amber" /> This Week&apos;s Matchup
      </h2>
      {!gd || !mine ? (
        <EmptyState>No Week {week} matchup is posted for your team yet.</EmptyState>
      ) : (
        <div className="grid flex-1 grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <Side m={m} rosterId={m.myRosterId} mine />
            <span className="border-line bg-bg/60 text-ink-2 grid size-11 place-items-center rounded-full border text-sm font-extrabold">
              VS
            </span>
            {hasOpp ? <Side m={m} rosterId={gd.oppRosterId!} mine={false} /> : <div className="text-ink-3 text-center">Bye week</div>}
          </div>
          {hasOpp && (
            <div className="border-line/70 grid gap-1.5 border-t pt-3 sm:min-w-36 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
              <div>
                <div className="text-ink-2 text-xs font-semibold">{live ? 'Live score' : 'Projection'}</div>
                <div className="text-lg font-extrabold tabular-nums">
                  {live ? `${f1(mine.points ?? 0)} – ${f1(opp?.points ?? 0)}` : `${f1(gd.myProj)} – ${f1(gd.oppProj)}`}
                </div>
              </div>
              <div>
                <div className="text-ink-2 text-xs font-semibold">Win Chance · model</div>
                <div
                  role="progressbar"
                  aria-label="Win probability"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={gd.winPct}
                  className={`text-lg font-extrabold tabular-nums ${gd.winPct >= 50 ? 'text-good' : 'text-bad'}`}
                >
                  {gd.winPct}%<span className="sr-only"> Win Chance</span>
                </div>
              </div>
              <Link
                to="/?tab=matchup"
                className="bg-select text-select-ink hover:bg-accent-deep mt-1 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors"
              >
                Full Analysis <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
