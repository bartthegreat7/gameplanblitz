import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { IDLE_POLL_MS, pollInterval } from '../lib/analytics/gameday'
import { weekContext } from '../lib/analytics/schedule'
import { getMatchups, getSchedule, type SleeperMatchup } from '../lib/sleeper'
import type { Ready } from './useLeagueData'

/**
 * This week's matchups, refreshed like Game Day Live: every minute while NFL games are on, every
 * five minutes otherwise, never in a background tab. Shares cache keys with the rest of the app.
 */
export function useLiveMatchups(data: Ready) {
  const { league, week, season } = data
  const scheduleQ = useQuery({
    queryKey: ['schedule', season],
    queryFn: () => getSchedule(season),
    staleTime: 60_000,
    refetchInterval: IDLE_POLL_MS,
    retry: 1,
  })
  const matchupsQ = useQuery({
    queryKey: ['matchups', league.league_id, week],
    queryFn: () => getMatchups(league.league_id, week),
    refetchInterval: (q) => pollInterval(q.state.data as SleeperMatchup[] | undefined, scheduleQ.data, week),
    refetchIntervalInBackground: false,
  })
  const ctx = useMemo(() => (scheduleQ.data ? weekContext(scheduleQ.data, week) : null), [scheduleQ.data, week])
  return {
    matchups: matchupsQ.data ?? data.matchups,
    schedule: scheduleQ.data ?? null,
    ctx,
    scheduleFailed: scheduleQ.isError,
    updatedAt: matchupsQ.dataUpdatedAt || null,
  }
}
