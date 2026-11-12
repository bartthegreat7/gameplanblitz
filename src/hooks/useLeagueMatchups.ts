import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getMatchups, type SleeperMatchup } from '../lib/sleeper'

/**
 * Sleeper matchups for several weeks (same cache keys as the dashboard's current week).
 * Past weeks carry final scores; future weeks carry the schedule (who plays whom).
 */
export function useLeagueMatchups(leagueId: string, weeks: number[]) {
  const qs = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['matchups', leagueId, w],
      queryFn: () => getMatchups(leagueId, w),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  })
  const stamp = `${weeks.join(',')}|${qs.map((q) => q.dataUpdatedAt).join(',')}`
  const data = useMemo(
    () => weeks.flatMap((week, i) => (qs[i].data ? [{ week, matchups: qs[i].data as SleeperMatchup[] }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stamp],
  )
  return {
    weeks: data,
    loading: qs.some((q) => q.isPending),
    failed: weeks.length > 0 && qs.every((q) => q.isError),
    partial: data.length > 0 && data.length < weeks.length && !qs.some((q) => q.isPending),
  }
}
