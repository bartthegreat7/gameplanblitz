import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import type { Ready } from '../../hooks/useLeagueData'
import { useLeagueBoard } from '../../hooks/useLeagueBoard'
import { useLeagueSeason } from '../../hooks/useLeagueSeason'
import { recordsThrough, standingsOrder } from '../../lib/analytics/league'
import { projectedRecords } from '../../lib/analytics/scoreboard'
import { ScoreList } from './ScoreList'

/**
 * Game Day Live's league section: every matchup as it happens, and the standings if every game
 * ends as currently projected (model), with the playoff line.
 */
export function LeagueLive({ data }: { data: Ready }) {
  const { model: m, week, league } = data
  const board = useLeagueBoard(data)
  const { season } = useLeagueSeason(data)
  const playoffTeams = league.settings.playoff_teams ?? 6
  const { before, after, rec } = useMemo(() => {
    const base = recordsThrough(season, week - 1)
    const proj = projectedRecords(base, board.games)
    return { before: standingsOrder(base), after: standingsOrder(proj), rec: proj }
  }, [season, week, board.games])
  const entering = useMemo(() => recordsThrough(season, week - 1), [season, week])
  const record = (id: number) => {
    const r = entering.get(id)
    return r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : null
  }
  if (!board.games.length) return null
  return (
    <section aria-label="Scores Around the League" className="border-line bg-card mt-4 grid gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold">Scores Around the League</h2>
        <Link to="/scores" className="text-accent text-sm font-bold hover:underline">
          Full league report →
        </Link>
      </div>
      <ScoreList m={m} games={board.games} record={record} />
      {after.length > 0 && (
        <div>
          <h3 className="mb-1 font-extrabold">If every game ends as projected</h3>
          <p className="text-ink-3 mb-2 text-xs">
            Records after Week {week} using the current projected finals (model). Top {playoffTeams} make the playoffs.
          </p>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {after.map((id, i) => {
              const r = rec.get(id)!
              const was = before.indexOf(id)
              const move = was < 0 ? 0 : was - i
              const crossing = was >= 0 && (was < playoffTeams) !== (i < playoffTeams)
              return (
                <li
                  key={id}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${id === m.myRosterId ? 'bg-active/60 font-bold' : ''} ${i === playoffTeams - 1 ? 'border-accent/50 border-b border-dashed' : ''}`}
                >
                  <span className="truncate">
                    <span className="text-ink-3 mr-2 inline-block w-4 text-xs">{i + 1}</span>
                    {m.teamName(id)}
                    {crossing && <span className={`ml-1.5 text-xs font-bold ${i < playoffTeams ? 'text-good' : 'text-bad'}`}>{i < playoffTeams ? 'into a playoff spot' : 'out of a playoff spot'}</span>}
                  </span>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    {move !== 0 && (
                      <span className={`inline-flex items-center text-xs font-bold ${move > 0 ? 'text-good' : 'text-bad'}`}>
                        {move > 0 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
                        <span className="sr-only">{move > 0 ? 'up' : 'down'}</span>
                        {Math.abs(move)}
                      </span>
                    )}
                    {r.w}-{r.l}
                    {r.t ? `-${r.t}` : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
