import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { fcParamsFor, getFantasyCalc } from '../lib/fantasycalc'
import { startSlotsOf } from '../lib/lineup'
import { createModel, type Model } from '../lib/model'
import {
  clearPlayersCache,
  getLeague,
  getLeagueUsers,
  getMatchups,
  getProjectionRows,
  getRosters,
  getSeasonStats,
  loadPlayers,
  statRowsToMap,
  type SleeperLeague,
  type SleeperMatchup,
} from '../lib/sleeper'
import { useSession } from './useSession'

export interface LeagueFlags {
  /** Sleeper projections request failed */
  projFailed: boolean
  /** request succeeded but Sleeper has not published projections yet */
  projEmpty: boolean
  /** season stats unavailable (bust calls fall back to injuries only) */
  statsMissing: boolean
  /** FantasyCalc values unavailable (Trade Machine disabled) */
  fcFailed: boolean
}

export type LeagueData =
  | { status: 'loading'; refetch: () => void }
  | { status: 'error'; error: Error; refetch: () => void }
  | {
      status: 'ready'
      model: Model
      league: SleeperLeague
      matchups: SleeperMatchup[]
      week: number
      season: string
      flags: LeagueFlags
      isFetching: boolean
      refetch: () => void
    }

export type Ready = Extract<LeagueData, { status: 'ready' }>

/**
 * Everything the dashboard needs for the selected league. League, rosters, users and the player
 * book are required; matchups, projections, season stats and trade values soft-fail into flags.
 */
export function useLeagueData(): LeagueData {
  const qc = useQueryClient()
  const session = useSession()
  const { leagueId, userId, week } = session
  const on = !!leagueId

  const leagueQ = useQuery({ queryKey: ['league', leagueId], queryFn: () => getLeague(leagueId!), enabled: on })
  const rostersQ = useQuery({ queryKey: ['rosters', leagueId], queryFn: () => getRosters(leagueId!), enabled: on })
  const usersQ = useQuery({ queryKey: ['leagueUsers', leagueId], queryFn: () => getLeagueUsers(leagueId!), enabled: on })
  const playersQ = useQuery({ queryKey: ['players'], queryFn: () => loadPlayers(), staleTime: Infinity, gcTime: Infinity })

  const league = leagueQ.data
  const season = league?.season || session.season
  const rosters = rostersQ.data

  const [matchupsQ, projQ, statsQ, fcQ] = useQueries({
    queries: [
      { queryKey: ['matchups', leagueId, week], queryFn: () => getMatchups(leagueId!, week), enabled: on },
      // cache holds the full rows (opponent, provider) shared with the Lineup page; the dashboard selects the map
      {
        queryKey: ['projections', season, week],
        queryFn: () => getProjectionRows(season!, week),
        select: statRowsToMap,
        enabled: !!season,
        retry: 1,
      },
      { queryKey: ['seasonStats', season], queryFn: () => getSeasonStats(season!), enabled: !!season, retry: 1, staleTime: 10 * 60_000 },
      {
        queryKey: ['fantasycalc', leagueId, league?.scoring_settings?.rec, league?.roster_positions?.join()],
        queryFn: () =>
          getFantasyCalc(
            fcParamsFor({
              numTeams: league!.settings.num_teams,
              rosterCount: rosters!.length,
              scoring: league!.scoring_settings,
              startSlots: startSlotsOf(league!.roster_positions),
            }),
          ),
        enabled: !!league && !!rosters,
        retry: 1,
        staleTime: 30 * 60_000,
      },
    ],
  })

  const refetch = useCallback(() => {
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'players' })
  }, [qc])

  const model = useMemo(() => {
    if (!league || !rosters || !usersQ.data || !playersQ.data) return null
    const myRoster =
      rosters.find((r) => r.owner_id === userId) ?? rosters.find((r) => (r.co_owners ?? []).includes(userId ?? ''))
    return createModel({
      players: playersQ.data,
      rosters,
      users: usersQ.data,
      scoring: league.scoring_settings ?? {},
      startSlots: startSlotsOf(league.roster_positions ?? []),
      proj: projQ.data ?? new Map(),
      seasonStats: statsQ.data ?? null,
      fc: fcQ.data ?? null,
      myRosterId: myRoster?.roster_id ?? rosters[0]?.roster_id ?? 0,
    })
  }, [league, rosters, usersQ.data, playersQ.data, projQ.data, statsQ.data, fcQ.data, userId])

  const required = [leagueQ, rostersQ, usersQ, playersQ]
  const failed = required.find((q) => q.error)
  if (failed) return { status: 'error', error: failed.error as Error, refetch }
  if (!model || !league || !season) return { status: 'loading', refetch }

  return {
    status: 'ready',
    model,
    league,
    matchups: matchupsQ.data ?? [],
    week,
    season,
    flags: {
      projFailed: projQ.isError,
      projEmpty: projQ.isSuccess && projQ.data.size === 0,
      statsMissing: statsQ.isError || (statsQ.isSuccess && !statsQ.data),
      fcFailed: fcQ.isError,
    },
    isFetching: [leagueQ, rostersQ, usersQ, matchupsQ, projQ, statsQ, fcQ].some((q) => q.isFetching),
    refetch,
  }
}

/** Force a fresh download of the Sleeper player book (injury statuses etc.), then refetch everything. */
export function useRefreshPlayers() {
  const qc = useQueryClient()
  return useCallback(async () => {
    await clearPlayersCache()
    await qc.invalidateQueries()
  }, [qc])
}
