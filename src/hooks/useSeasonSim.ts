import { useMemo } from 'react'

import { DEFAULT_SEED, DEFAULT_SIMS, prepareSeason, type SimInput } from '../lib/analytics/playoffs'
import type { Ready } from './useLeagueData'
import { useLeagueMatchups } from './useLeagueMatchups'

/** The Playoff Simulator's default inputs (blend basis, 5,000 seeded runs) for other tools to reuse. Null once the regular season is over. */
export function useSeasonSim(data: Ready): { input: SimInput | null; loading: boolean } {
  const { model: m, league, week } = data
  const lastRegular = (league.settings.playoff_week_start ?? 15) - 1
  const playoffTeams = league.settings.playoff_teams ?? 6
  const weeks = useMemo(
    () => (week <= lastRegular ? Array.from({ length: lastRegular }, (_, i) => i + 1) : []),
    [week, lastRegular],
  )
  const sched = useLeagueMatchups(league.league_id, weeks)
  const input = useMemo(() => {
    if (weeks.length === 0 || sched.loading) return null
    const prep = prepareSeason({ m, weeks: sched.weeks, week, lastRegular, basis: 'blend' })
    if (prep.remaining.length === 0) return null
    return {
      teams: prep.teams,
      standings: prep.standings,
      remaining: prep.remaining,
      playoffTeams,
      sims: DEFAULT_SIMS,
      seed: DEFAULT_SEED,
    }
  }, [weeks.length, sched.loading, sched.weeks, m, week, lastRegular, playoffTeams])
  return { input, loading: weeks.length > 0 && sched.loading }
}
