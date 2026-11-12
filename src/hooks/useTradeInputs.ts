import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { fcParamsFor, getFantasyCalcData } from '../lib/fantasycalc'
import { startSlotsOf } from '../lib/lineup'
import type { Model } from '../lib/model'
import { getSchedule, getTradedPicks, type SleeperLeague } from '../lib/sleeper'
import { ownedPicks, futurePickSeasons, type PickAsset } from '../lib/analytics/picks'
import { useProjectionHorizon } from './useProjectionHorizon'

/**
 * Inputs for the Trade War Room: multi-week projections, the schedule, FantasyCalc values and,
 * in dynasty leagues, picks. Players and picks always come from the same FantasyCalc scale:
 * dynasty values for dynasty leagues (the only scale that prices picks), redraft values otherwise.
 * Everything soft-fails; the page degrades with a notice.
 */
export function useTradeInputs(league: SleeperLeague, season: string, week: number, model: Model) {
  const proj = useProjectionHorizon(season, week)
  const scale: 'dynasty' | 'redraft' = league.settings.type === 2 ? 'dynasty' : 'redraft'

  const scheduleQ = useQuery({ queryKey: ['schedule', season], queryFn: () => getSchedule(season), staleTime: 30 * 60_000, retry: 1 })

  const fcParams = fcParamsFor({
    numTeams: league.settings.num_teams,
    rosterCount: model.rosters.length,
    scoring: league.scoring_settings,
    startSlots: startSlotsOf(league.roster_positions),
  })
  const fcQ = useQuery({
    queryKey: ['fantasycalc-trades', league.league_id, scale, fcParams],
    queryFn: () => getFantasyCalcData(fcParams, scale === 'dynasty'),
    staleTime: 30 * 60_000,
    retry: 1,
  })
  const tradedQ = useQuery({
    queryKey: ['tradedPicks', league.league_id],
    queryFn: () => getTradedPicks(league.league_id),
    enabled: scale === 'dynasty',
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const picks = useMemo<Map<number, PickAsset[]>>(() => {
    if (scale !== 'dynasty' || !fcQ.data || !tradedQ.data) return new Map()
    return ownedPicks({
      rosterIds: model.rosters.map((r) => r.roster_id),
      seasons: futurePickSeasons(fcQ.data.picks, league.season),
      rounds: league.settings.draft_rounds ?? 4,
      traded: tradedQ.data,
      values: fcQ.data.picks,
      teamName: model.teamName,
    })
  }, [scale, fcQ.data, tradedQ.data, model, league.season, league.settings.draft_rounds])

  return {
    scale,
    horizon: proj.horizon,
    horizonLoading: proj.loading,
    schedule: scheduleQ.data ?? null,
    scheduleFailed: scheduleQ.isError,
    values: fcQ.data?.players ?? null,
    valuesLoading: fcQ.isPending,
    valuesFailed: fcQ.isError,
    picks,
    picksFailed: scale === 'dynasty' && tradedQ.isError,
    picksLoading: scale === 'dynasty' && tradedQ.isPending,
  }
}
