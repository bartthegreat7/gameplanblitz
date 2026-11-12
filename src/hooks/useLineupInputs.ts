import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { WeekRows } from '../lib/analytics/history'
import { getProjectionRows, getSchedule } from '../lib/sleeper'
import { loadWeeklyRows } from '../lib/weeklyCache'

/**
 * Inputs for the Lineup Optimizer beyond the league itself: this week's projection rows,
 * the season schedule, and completed weeks of actual stats. Everything soft-fails: the
 * optimizer still runs without history or schedule, it just has less context.
 */
export function useLineupInputs(season: string, week: number) {
  const projQ = useQuery({
    queryKey: ['projections', season, week],
    queryFn: () => getProjectionRows(season, week),
    retry: 1,
  })
  const scheduleQ = useQuery({
    queryKey: ['schedule', season],
    queryFn: () => getSchedule(season),
    staleTime: 30 * 60_000,
    retry: 1,
  })

  const completed = Array.from({ length: Math.max(0, week - 1) }, (_, i) => i + 1)
  const weekQs = useQueries({
    queries: completed.map((w) => ({
      queryKey: ['weeklyStats', season, w],
      queryFn: () => loadWeeklyRows(season, w),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1,
    })),
  })

  // `useQueries` returns a new array each render; rebuild `weeks` only when a week's data changes
  const stamp = weekQs.map((q) => q.dataUpdatedAt).join(',')
  const weeks = useMemo<WeekRows[]>(
    () => weekQs.flatMap((q, i) => (q.data ? [{ week: i + 1, rows: q.data }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stamp],
  )

  return {
    projectionRows: projQ.data ?? [],
    projectionsUpdatedAt: projQ.dataUpdatedAt || null,
    schedule: scheduleQ.data ?? null,
    scheduleFailed: scheduleQ.isError,
    weeks,
    totalWeeks: completed.length,
    historyLoading: weekQs.some((q) => q.isPending),
    historyFailed: completed.length > 0 && weekQs.every((q) => q.isError),
    historyPartial: weeks.length > 0 && weeks.length < completed.length && !weekQs.some((q) => q.isPending),
  }
}
