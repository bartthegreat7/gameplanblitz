import { useMemo } from 'react'

import { scoreboard } from '../lib/analytics/scoreboard'
import type { Ready } from './useLeagueData'
import { useLiveMatchups } from './useLiveMatchups'
import { useSession } from './useSession'

/** The league scoreboard for the viewed week, kept live during games. */
export function useLeagueBoard(data: Ready) {
  const live = useLiveMatchups(data)
  const { currentWeek } = useSession()
  const past = data.week < currentWeek
  const games = useMemo(
    () => scoreboard(data.model, live.matchups, live.ctx, past),
    [data.model, live.matchups, live.ctx, past],
  )
  return { ...live, games, past }
}
