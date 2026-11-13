import { HardHat, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { LineupAnalysis } from '../../lib/analytics/lineupAnalysis'
import { f1 } from '../../lib/format'
import { InjuryTag } from '../dashboard/Insights'
import { CARD } from '../dashboard/styles'
import { EmptyState } from '../ui/states'

/**
 * The recommended lineup, compact: slot, player (with Sleeper's designation), opponent and the
 * engine projection. The full view (as set vs optimized, weather, Sleeper's numbers) is on My Team.
 */
export function LineupCompact({
  analysis,
  week,
  projOf,
  className = '',
}: {
  analysis: LineupAnalysis | null
  week: number
  projOf: (id: string) => number
  className?: string
}) {
  const plan = analysis?.plan
  const value = (c: { id: string; out: boolean; proj: number }) => (c.out ? 0 : projOf(c.id))
  const total = plan?.slots.reduce((a, s) => a + (s.recommended ? value(s.recommended) : 0), 0) ?? 0
  return (
    <section aria-label="Optimal Lineup" className={`${CARD} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="mb-2 flex items-center gap-2.5">
        <HardHat size={22} aria-hidden className="text-accent shrink-0" />
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight">Optimal Lineup</h2>
        {plan && <span className="text-accent shrink-0 text-sm font-bold tabular-nums">Proj. {f1(total)}</span>}
      </div>
      {!plan ? (
        <EmptyState>No Week {week} matchup is posted for your team yet.</EmptyState>
      ) : (
        <table className="w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">Optimized lineup for Week {week} (GamePlanBlitz projections)</caption>
          <thead>
            <tr>
              <th scope="col" className="w-9 p-0">
                <span className="sr-only">Position</span>
              </th>
              <th scope="col" className="p-0">
                <span className="sr-only">Player</span>
              </th>
              <th scope="col" className="w-14 p-0">
                <span className="sr-only">Opponent</span>
              </th>
              <th scope="col" className="w-10 p-0">
                <span className="sr-only">Projection</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.slots.map((s, i) => {
              const c = s.recommended
              return (
                <tr key={`${s.slot}-${i}`} className="border-line/50 border-b last:border-0">
                  <td className="text-ink-2 w-9 py-[3px] text-[11px] font-bold">{s.label}</td>
                  <td className="truncate py-[3px] pr-1.5 font-semibold">
                    {c ? (
                      <>
                        <Link to={`/players/${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                        <InjuryTag status={c.injury} />
                      </>
                    ) : (
                      <span className="text-ink-3">Empty slot</span>
                    )}
                  </td>
                  <td className="text-ink-2 w-12 py-[3px] text-[11px] whitespace-nowrap">
                    {c?.bye ? 'Bye' : c?.opponent ? `vs ${c.opponent}` : '—'}
                  </td>
                  <td className="w-10 py-[3px] text-right font-bold tabular-nums">{c ? f1(value(c)) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="mt-auto pt-2.5">
        <Link
          to="/lineup"
          className="bg-select text-select-ink hover:bg-accent-deep inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold transition-colors"
        >
          <Sparkles size={16} aria-hidden /> Optimize Lineup
        </Link>
      </div>
    </section>
  )
}
