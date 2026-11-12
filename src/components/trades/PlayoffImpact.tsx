import { useMemo } from 'react'

import { oddsWithShift, type SimInput, type TeamOdds } from '../../lib/analytics/playoffs'
import type { TradeEvaluation } from '../../lib/analytics/trades'
import type { Model } from '../../lib/model'
import { Skeleton } from '../ui/states'

const pct = (x: number) => `${x >= 99.95 ? '100' : x.toFixed(1)}%`
const delta = (a: number, b: number) => {
  const d = b - a
  return (
    <span
      className={d > 0.05 ? 'text-good' : d < -0.05 ? 'text-bad' : 'text-ink-3'}
    >{`${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1)}`}</span>
  )
}

/** How the trade moves both teams' playoff and title odds (model). */
export function PlayoffImpact({
  m,
  e,
  sim,
  loading,
}: {
  m: Model
  e: TradeEvaluation
  sim: SimInput | null
  loading: boolean
}) {
  const weeks = Math.max(1, e.activeWeeks)
  const res = useMemo(
    () =>
      sim
        ? oddsWithShift(sim, [
            { rosterId: m.myRosterId, perWeek: e.you.total / weeks },
            { rosterId: e.theirRosterId, perWeek: e.them.total / weeks },
          ])
        : null,
    [sim, m.myRosterId, e, weeks],
  )
  if (loading) return <Skeleton className="mt-4 h-28" />
  if (!res)
    return (
      <p className="text-ink-3 mt-4 text-sm">
        Playoff impact is unavailable: the regular season is over or the remaining schedule
        hasn&apos;t loaded.
      </p>
    )
  const find = (o: TeamOdds[], id: number) => o.find((t) => t.rosterId === id)!
  const rows = [
    { id: m.myRosterId, name: 'You', shift: e.you.total / weeks },
    { id: e.theirRosterId, name: e.theirName, shift: e.them.total / weeks },
  ]
  return (
    <section aria-label="Playoff impact" className="border-line mt-4 border-t pt-4">
      <h3 className="mb-2 flex items-center justify-between gap-2 font-bold">
        Playoff impact{' '}
        <span className="text-amber text-[11px] font-extrabold tracking-wider uppercase">
          Model
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-ink-3 border-line border-b text-xs">
              <th scope="col" className="py-2 text-left font-semibold">
                Team
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Weekly change
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Make playoffs
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Win title
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = find(res.before, r.id)
              const a = find(res.after, r.id)
              return (
                <tr key={r.id} className="border-line/60 border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-bold">
                    {r.name}
                  </th>
                  <td className="py-2 text-right tabular-nums">{`${r.shift >= 0 ? '+' : '−'}${Math.abs(r.shift).toFixed(1)} pts`}</td>
                  <td className="py-2 text-right tabular-nums">
                    {pct(b.playoffPct)} → <b>{pct(a.playoffPct)}</b> (
                    {delta(b.playoffPct, a.playoffPct)})
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {pct(b.championPct)} → <b>{pct(a.championPct)}</b> (
                    {delta(b.championPct, a.championPct)})
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-ink-3 mt-2 text-xs">
        Each team&apos;s expected weekly score shifts by its average best-lineup change over the
        next {e.activeWeeks || 1} week{e.activeWeeks === 1 ? '' : 's'}, assumed to hold for the rest
        of the regular season, in the Playoff Simulator&apos;s seeded model (same random draws
        before and after). This is a lineup effect, separate from trade fairness.
      </p>
    </section>
  )
}
