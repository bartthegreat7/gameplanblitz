import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import {
  gamesByPlayer,
  getModelFile,
  ModelNotPublished,
  projectPlayer,
  type PlayerProjection,
} from '../lib/projection/client'
import { getSeasonStats } from '../lib/sleeper'
import type { Ready } from './useLeagueData'
import { useLineupInputs } from './useLineupInputs'

/**
 * The GamePlanBlitz projection engine for this league: the published model (model.json), this
 * season's completed weeks, and last season's totals. Every part soft-fails; without the model the
 * engine returns Sleeper's projection unchanged.
 */
export function useProjectionEngine(data: Ready) {
  const { model: m, season, week } = data
  const modelQ = useQuery({
    queryKey: ['projectionModel'],
    queryFn: getModelFile,
    staleTime: 30 * 60_000,
    retry: (n, e) => !(e instanceof ModelNotPublished) && n < 1,
  })
  const inputs = useLineupInputs(season, week)
  const prevSeason = String(Number(season) - 1)
  const prevQ = useQuery({
    queryKey: ['seasonStats', prevSeason],
    queryFn: () => getSeasonStats(prevSeason),
    staleTime: 60 * 60_000,
    retry: 1,
  })

  const games = useMemo(
    () => gamesByPlayer(inputs.weeks.filter((w) => w.week < week)),
    [inputs.weeks, week],
  )
  const scoring = m.scoring
  const modelFile = modelQ.data ?? null
  const prev = prevQ.data ?? null

  const projectionFor = useCallback(
    (id: string): PlayerProjection =>
      projectPlayer(id, m.pos(id), m.projPts(id), {
        model: modelFile,
        scoring,
        games,
        prevSeason: prev,
      }),
    [m, modelFile, scoring, games, prev],
  )

  return {
    projectionFor,
    model: modelFile,
    modelLoading: modelQ.isPending,
    modelMissing: modelQ.error instanceof ModelNotPublished,
    modelFailed: modelQ.isError && !(modelQ.error instanceof ModelNotPublished),
    historyLoading: inputs.historyLoading,
    prevLoading: prevQ.isPending,
    prevFailed: prevQ.isError,
  }
}
