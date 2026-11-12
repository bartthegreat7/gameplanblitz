import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { usageBook } from '../lib/analytics/opportunity'
import { getModelFile, ModelNotPublished } from '../lib/projection/client'
import { formatFor, xfpOf } from '../lib/projection/engine'
import { pointsFor } from '../lib/scoring'
import type { Ready } from './useLeagueData'
import { useLineupInputs } from './useLineupInputs'

/** This season's per-player usage (completed weeks before the viewed week), in league scoring. */
export function useUsageBook(data: Ready) {
  const { model: m, season, week } = data
  const inputs = useLineupInputs(season, week)
  const modelQ = useQuery({
    queryKey: ['projectionModel'],
    queryFn: getModelFile,
    staleTime: 30 * 60_000,
    retry: (n, e) => !(e instanceof ModelNotPublished) && n < 1,
  })
  const xfp = modelQ.data?.formats[formatFor(m.scoring.rec)]?.xfp
  const book = useMemo(
    () =>
      usageBook(
        inputs.weeks.filter((w) => w.week < week),
        (s) => pointsFor(s, m.scoring),
        (id, s) => xfpOf(m.pos(id), s, xfp?.[m.pos(id)]),
      ),
    [inputs.weeks, week, m, xfp],
  )
  return {
    book,
    loading: inputs.historyLoading,
    failed: inputs.historyFailed,
    weeksLoaded: inputs.weeks.length,
    hasXfp: !!xfp,
  }
}
