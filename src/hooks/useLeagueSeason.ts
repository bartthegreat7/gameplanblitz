import { useMemo } from 'react'

import { pairGames, type WeekGames } from '../lib/analytics/league'
import type { Ready } from './useLeagueData'
import { useLeagueMatchups } from './useLeagueMatchups'
import { useSession } from './useSession'

/** Every week of this season through the viewed week, paired into games (Sleeper's scores). */
export function useLeagueSeason(data: Ready) {
  const { league, week } = data
  const { currentWeek } = useSession()
  const weeks = useMemo(() => Array.from({ length: Math.max(0, week) }, (_, i) => i + 1), [week])
  const q = useLeagueMatchups(league.league_id, weeks)
  const season = useMemo<WeekGames[]>(() => q.weeks.map((w) => ({ week: w.week, games: pairGames(w.matchups) })), [q.weeks])
  /** weeks whose games are over (every week before the current NFL week) */
  const completed = useMemo(() => season.filter((w) => w.week < currentWeek), [season, currentWeek])
  return { season, completed, loading: q.loading, failed: q.failed }
}
