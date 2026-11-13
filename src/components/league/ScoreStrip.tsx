import { Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { Ready } from '../../hooks/useLeagueData'
import { useLeagueBoard } from '../../hooks/useLeagueBoard'
import { f1 } from '../../lib/format'
import { CARD } from '../dashboard/styles'

/**
 * Every league matchup at a glance, horizontally scrollable: actual points once games start
 * (projected before kickoff, labeled), close games and upsets flagged. Each opens its analysis.
 */
export function ScoreStrip({ data }: { data: Ready }) {
  const { games } = useLeagueBoard(data)
  const m = data.model
  if (!games.length) return null
  return (
    <section aria-label="League scoreboard" className={`${CARD} flex min-w-0 items-stretch gap-2 p-2`}>
      <Link
        to="/scores"
        className="hover:bg-raised flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-3 text-center transition-colors"
      >
        <Trophy size={18} aria-hidden className="text-amber" />
        <span className="text-[11px] leading-tight font-bold">
          Week {data.week}
          <br />
          Scores
        </span>
      </Link>
      <ul aria-label={`Week ${data.week} matchups`} tabIndex={0} className="nav-scroll relative flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {games.map((g) => {
          const mine = g.a.rosterId === m.myRosterId || g.b?.rosterId === m.myRosterId
          const sides = g.b ? [g.a, g.b] : [g.a]
          const shown = (s: (typeof sides)[number]) => (g.status === 'scheduled' ? s.projectedFinal : s.points)
          const lead = g.b ? (shown(g.a) > shown(g.b) ? g.a.rosterId : shown(g.b) > shown(g.a) ? g.b.rosterId : null) : null
          return (
            <li key={g.matchupId} className="shrink-0">
              <Link
                to={`/scores?m=${g.matchupId}`}
                className={`hover:border-accent/60 flex w-44 flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 transition-colors ${mine ? 'border-accent/60 bg-accent/10' : 'border-line/60 bg-bg/40'}`}
              >
                <span className="flex items-center justify-between text-[10px] font-bold tracking-wide uppercase">
                  <span className={g.status === 'live' ? 'text-bad' : 'text-ink-3'}>
                    {g.status === 'scheduled' ? 'Projected' : g.status}
                  </span>
                  {g.upset ? (
                    <span className="text-amber">{g.status === 'final' ? 'Upset' : 'Upset alert'}</span>
                  ) : g.close && g.status !== 'final' ? (
                    <span className="text-amber">Close</span>
                  ) : null}
                </span>
                {sides.map((s) => (
                  <span key={s.rosterId} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className={`truncate ${lead === s.rosterId ? 'font-extrabold' : 'text-ink-2'}`}>{m.teamName(s.rosterId)}</span>
                    <span className={`tabular-nums ${lead === s.rosterId ? 'font-extrabold' : 'text-ink-2'} ${g.status === 'scheduled' ? 'italic' : ''}`}>
                      {f1(shown(s))}
                    </span>
                  </span>
                ))}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
