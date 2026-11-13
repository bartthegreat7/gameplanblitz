import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { reviewWeek, type WeekReview } from '../lib/analytics/academy'
import { findMyMatchup, findOpponent } from '../lib/insights'
import { pointsFor } from '../lib/scoring'
import { getProjectionRows, statRowsToMap, type SleeperMatchup } from '../lib/sleeper'
import type { Ready } from './useLeagueData'
import { useLeagueMatchups } from './useLeagueMatchups'
import { useSession } from './useSession'

export interface PastWeek {
  week: number
  matchups: SleeperMatchup[]
  /** that week's Sleeper projection in league scoring */
  projOf: (id: string) => number
}

/** Every completed week with its matchups and projections, plus my lineup review for each. */
export function usePastWeeks(data: Ready) {
  const { model: m, league, season } = data
  const { currentWeek } = useSession()
  const weeks = useMemo(() => Array.from({ length: Math.max(0, currentWeek - 1) }, (_, i) => i + 1), [currentWeek])
  const sched = useLeagueMatchups(league.league_id, weeks)
  const projQs = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['projections', season, w],
      queryFn: () => getProjectionRows(season, w),
      staleTime: 60 * 60_000,
      retry: 1,
    })),
  })
  const projStamp = projQs.map((q) => q.dataUpdatedAt).join(',')
  const past = useMemo<PastWeek[]>(
    () =>
      sched.weeks.flatMap(({ week, matchups }) => {
        const rows = projQs[week - 1]?.data
        if (!rows) return []
        const proj = statRowsToMap(rows)
        return [{ week, matchups, projOf: (id: string) => pointsFor(proj.get(id), m.scoring) }]
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sched.weeks, projStamp, m],
  )
  const reviews = useMemo<WeekReview[]>(
    () =>
      past
        .flatMap(({ week, matchups, projOf }) => {
          const mine = findMyMatchup(matchups, m.myRosterId)
          if (!mine || !(mine.points > 0)) return []
          return [reviewWeek({ week, mine, opp: findOpponent(matchups, m.myRosterId) ?? null, startSlots: m.startSlots, posOf: m.pos, projOf })]
        })
        .sort((a, b) => b.week - a.week),
    [past, m],
  )
  return { past, reviews, loading: sched.loading || projQs.some((q) => q.isPending) }
}
