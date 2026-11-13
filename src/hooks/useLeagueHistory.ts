import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { weekAwards } from '../lib/analytics/league'
import { regularWeeks, tallyAwards, type SeasonData } from '../lib/analytics/leagueHistory'
import {
  getDraftPicks,
  getLeague,
  getLeagueUsers,
  getMatchups,
  getRosters,
  getTransactions,
  getWinnersBracket,
  type SleeperDraftPick,
  type SleeperLeague,
  type SleeperTransaction,
} from '../lib/sleeper'
import type { Ready } from './useLeagueData'
import { useLeagueSeason } from './useLeagueSeason'
import { useSession } from './useSession'

/** Previous seasons to load, following Sleeper's previous_league_id chain. */
export const HQ_HISTORY_SEASONS = 3

export interface HistorySeason extends SeasonData {
  draft: SleeperDraftPick[] | null
}

const quiet = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback)

async function loadSeason(league: SleeperLeague): Promise<HistorySeason> {
  const last = (league.settings.playoff_week_start ?? 15) - 1
  const [rosters, users, bracket, draft, weeks] = await Promise.all([
    getRosters(league.league_id),
    getLeagueUsers(league.league_id),
    quiet(getWinnersBracket(league.league_id), null),
    league.draft_id ? quiet(getDraftPicks(league.draft_id), null) : Promise.resolve(null),
    Promise.all(Array.from({ length: last }, (_, i) => i + 1).map(async (week) => ({ week, matchups: await quiet(getMatchups(league.league_id, week), []) }))),
  ])
  return {
    season: league.season,
    leagueId: league.league_id,
    name: league.name,
    rosters,
    users,
    weeks: regularWeeks(weeks, last + 1),
    bracket: bracket?.length ? bracket : null,
    draft,
  }
}

/** Up to HQ_HISTORY_SEASONS previous seasons, newest first. A season that cannot be read ends the chain. */
async function loadPast(league: SleeperLeague): Promise<{ seasons: HistorySeason[]; gaps: number }> {
  const seasons: HistorySeason[] = []
  let prevId = league.previous_league_id ?? null
  for (let i = 0; i < HQ_HISTORY_SEASONS && prevId && prevId !== '0'; i++) {
    try {
      const prev = await getLeague(prevId)
      seasons.push(await loadSeason(prev))
      prevId = prev.previous_league_id ?? null
    } catch {
      return { seasons, gaps: 1 }
    }
  }
  return { seasons, gaps: 0 }
}

/** League Headquarters data: this season (from the loaded league) plus past seasons, trades and drafts. */
export function useLeagueHistory(data: Ready) {
  const { league, model: m } = data
  const { currentWeek } = useSession()
  const { completed, loading: seasonLoading } = useLeagueSeason(data)
  const playoffStart = league.settings.playoff_week_start ?? 15

  const pastQ = useQuery({
    queryKey: ['leagueHistory', league.league_id, league.previous_league_id],
    queryFn: () => loadPast(league),
    enabled: !!league.previous_league_id && league.previous_league_id !== '0',
    staleTime: 12 * 60 * 60_000,
    retry: 1,
  })
  const bracketQ = useQuery({
    queryKey: ['winnersBracket', league.league_id],
    queryFn: () => getWinnersBracket(league.league_id),
    enabled: currentWeek >= playoffStart,
    staleTime: 10 * 60_000,
    retry: 1,
  })
  const draftQ = useQuery({
    queryKey: ['draftPicks', league.draft_id],
    queryFn: () => getDraftPicks(league.draft_id!),
    enabled: !!league.draft_id,
    staleTime: 60 * 60_000,
    retry: 1,
  })
  // same cache keys as League X-Ray
  const txQs = useQueries({
    queries: Array.from({ length: Math.max(0, currentWeek) }, (_, i) => i + 1).map((r) => ({
      queryKey: ['transactions', league.league_id, r],
      queryFn: () => getTransactions(league.league_id, r),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  })
  const txStamp = txQs.map((q) => q.dataUpdatedAt).join(',')
  const trades = useMemo<SleeperTransaction[]>(
    () =>
      txQs
        .flatMap((q) => q.data ?? [])
        .filter((t) => t.type === 'trade' && (t.status ?? 'complete') === 'complete')
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txStamp],
  )

  const current = useMemo<HistorySeason>(
    () => ({
      season: league.season,
      leagueId: league.league_id,
      name: league.name,
      rosters: m.rosters,
      users: m.users,
      weeks: completed.filter((w) => w.week < playoffStart),
      bracket: bracketQ.data?.length ? bracketQ.data : null,
      draft: draftQ.data ?? null,
    }),
    [league, m.rosters, m.users, completed, playoffStart, bracketQ.data, draftQ.data],
  )
  const seasons = useMemo(() => [current, ...(pastQ.data?.seasons ?? [])], [current, pastQ.data])
  const awardTally = useMemo(() => tallyAwards(current.weeks.map((w) => weekAwards(w.games).awards)), [current.weeks])

  return {
    seasons,
    current,
    awardTally,
    trades,
    pastLoading: pastQ.isFetching && !pastQ.data,
    pastFailed: pastQ.isError || (pastQ.data?.gaps ?? 0) > 0,
    seasonLoading,
    tradesLoading: txQs.some((q) => q.isPending),
    draftLoading: draftQ.isPending && !!league.draft_id,
  }
}
