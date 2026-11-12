import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { fcParamsFor, getFantasyCalcData } from '../lib/fantasycalc'
import { startSlotsOf } from '../lib/lineup'
import { getDraftPicks, getLeague, type SleeperDraftPick, type SleeperLeague } from '../lib/sleeper'

/** Seasons of draft history to walk back through for "years kept". */
export const KEEPER_HISTORY_SEASONS = 3

export interface DraftHistory {
  /** this season's draft picks, or null when the league has no draft on Sleeper */
  current: SleeperDraftPick[] | null
  /** picks per season, newest first, starting with this season */
  seasons: SleeperDraftPick[][]
  /** previous seasons that could not be read */
  gaps: number
}

/** This season's draft and up to 3 previous seasons, following Sleeper's previous_league_id chain. */
async function loadHistory(league: SleeperLeague): Promise<DraftHistory> {
  const current = league.draft_id ? await getDraftPicks(league.draft_id) : null
  const seasons: SleeperDraftPick[][] = current ? [current] : []
  let gaps = 0
  let prevId = league.previous_league_id ?? null
  for (let i = 0; i < KEEPER_HISTORY_SEASONS && prevId && prevId !== '0'; i++) {
    try {
      const prev = await getLeague(prevId)
      if (prev.draft_id) seasons.push(await getDraftPicks(prev.draft_id))
      prevId = prev.previous_league_id ?? null
    } catch {
      gaps++
      break
    }
  }
  return { current, seasons, gaps }
}

export function useKeeperInputs(league: SleeperLeague, rosterCount: number) {
  const historyQ = useQuery({
    queryKey: ['keeperHistory', league.league_id, league.draft_id, league.previous_league_id],
    queryFn: () => loadHistory(league),
    staleTime: 30 * 60_000,
    retry: 1,
  })
  const params = fcParamsFor({
    numTeams: league.settings.num_teams,
    rosterCount,
    scoring: league.scoring_settings,
    startSlots: startSlotsOf(league.roster_positions),
  })
  // long-term value lives on FantasyCalc's dynasty scale (same cache key as the Trade War Room)
  const fcQ = useQuery({
    queryKey: ['fantasycalc-trades', league.league_id, 'dynasty', params],
    queryFn: () => getFantasyCalcData(params, true),
    staleTime: 30 * 60_000,
    retry: 1,
  })

  /** rank among players only (FantasyCalc's own overall rank also counts draft picks) */
  const dynasty = useMemo(() => {
    if (!fcQ.data) return null
    const sorted = [...fcQ.data.players].sort((a, b) => b[1].value - a[1].value)
    return new Map(sorted.map(([id, v], i) => [id, { rank: i + 1, value: v.value }]))
  }, [fcQ.data])

  return {
    history: historyQ.data ?? null,
    historyLoading: historyQ.isPending,
    historyFailed: historyQ.isError,
    dynasty,
    valuesLoading: fcQ.isPending,
    valuesFailed: fcQ.isError,
  }
}
