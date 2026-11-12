import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { HorizonWeek } from '../lib/analytics/lineupValue'
import { getProjectionRows, statRowsToMap } from '../lib/sleeper'

/** Weeks of Sleeper projections to value players over (this week plus the next two). */
export const HORIZON_WEEKS = 3
const LAST_REGULAR_WEEK = 18

/**
 * Sleeper projections for the current week and the next few, shared by the Waiver Sniper and the
 * Trade War Room. A week Sleeper has not published comes back with an empty map (not an error).
 */
export function useProjectionHorizon(season: string, week: number) {
  const weeks = Array.from({ length: HORIZON_WEEKS }, (_, i) => week + i).filter((w) => w <= LAST_REGULAR_WEEK)
  const qs = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['projections', season, w],
      queryFn: () => getProjectionRows(season, w),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  })

  // `useQueries` returns a fresh array each render; rebuild only when a week's data actually changes
  const stamp = `${weeks.join(',')}|${qs.map((q) => q.dataUpdatedAt).join(',')}`
  const horizon = useMemo<HorizonWeek[]>(
    () => weeks.map((w, i) => ({ week: w, proj: statRowsToMap(qs[i].data ?? []) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stamp],
  )
  return {
    horizon,
    loading: qs.some((q) => q.isPending),
    /** weeks whose request failed (as opposed to returning no projections) */
    failedWeeks: weeks.filter((_, i) => qs[i].isError),
  }
}
