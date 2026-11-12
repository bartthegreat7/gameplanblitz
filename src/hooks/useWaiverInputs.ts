import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getTransactions, getTrending, type SleeperTransaction } from '../lib/sleeper'
import { useProjectionHorizon } from './useProjectionHorizon'

export { HORIZON_WEEKS } from './useProjectionHorizon'

/**
 * Inputs for the Waiver Sniper beyond the league and game history: projections for the next few
 * weeks, Sleeper-wide trending adds, and this season's processed transactions (for FAAB
 * calibration). Everything soft-fails; the page degrades with a notice.
 */
export function useWaiverInputs(season: string, week: number, leagueId: string) {
  const proj = useProjectionHorizon(season, week)
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

  const txStamp = txQs.map((q) => q.dataUpdatedAt).join(',')
  const transactions = useMemo<SleeperTransaction[]>(
    () => txQs.flatMap((q) => q.data ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txStamp],
  )

  return {
    horizon: proj.horizon,
    horizonLoading: proj.loading,
    horizonFailedWeeks: proj.failedWeeks,
    trending: trendingQ.data ?? null,
    trendingFailed: trendingQ.isError,
    transactions,
    transactionsLoading: txQs.some((q) => q.isPending),
    transactionsFailed: rounds.length > 0 && txQs.every((q) => q.isError),
  }
}
