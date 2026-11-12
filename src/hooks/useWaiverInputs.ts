import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { HorizonWeek } from '../lib/analytics/waivers'
import { getProjectionRows, getTransactions, getTrending, statRowsToMap, type SleeperTransaction } from '../lib/sleeper'

/** Weeks of Sleeper projections to value an add over (this week plus the next two). */
export const HORIZON_WEEKS = 3
const LAST_REGULAR_WEEK = 18

/**
 * Inputs for the Waiver Sniper beyond the league and game history: projections for the next few
 * weeks, Sleeper-wide trending adds, and this season's processed transactions (for FAAB
 * calibration). Everything soft-fails; the page degrades with a notice.
 */
export function useWaiverInputs(season: string, week: number, leagueId: string) {
  const weeks = Array.from({ length: HORIZON_WEEKS }, (_, i) => week + i).filter((w) => w <= LAST_REGULAR_WEEK)

  const projQs = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['projections', season, w],
      queryFn: () => getProjectionRows(season, w),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  })
  const trendingQ = useQuery({
    queryKey: ['trending', 'add'],
    queryFn: () => getTrending('add', 24, 50),
    staleTime: 10 * 60_000,
    retry: 1,
  })
  const rounds = Array.from({ length: Math.max(0, week) }, (_, i) => i + 1)
  const txQs = useQueries({
    queries: rounds.map((r) => ({
      queryKey: ['transactions', leagueId, r],
      queryFn: () => getTransactions(leagueId, r),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  })

  // `useQueries` returns a fresh array each render; rebuild only when a week's data actually changes
  const projStamp = `${weeks.join(',')}|${projQs.map((q) => q.dataUpdatedAt).join(',')}`
  const horizon = useMemo<HorizonWeek[]>(
    () => weeks.map((w, i) => ({ week: w, proj: statRowsToMap(projQs[i].data ?? []) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projStamp],
  )
  const txStamp = txQs.map((q) => q.dataUpdatedAt).join(',')
  const transactions = useMemo<SleeperTransaction[]>(
    () => txQs.flatMap((q) => q.data ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txStamp],
  )

  return {
    horizon,
    horizonLoading: projQs.some((q) => q.isPending),
    /** a future week's request failed (as opposed to returning no projections) */
    horizonFailedWeeks: weeks.filter((_, i) => projQs[i].isError),
    trending: trendingQ.data ?? null,
    trendingFailed: trendingQ.isError,
    transactions,
    transactionsLoading: txQs.some((q) => q.isPending),
    transactionsFailed: rounds.length > 0 && txQs.every((q) => q.isError),
  }
}
