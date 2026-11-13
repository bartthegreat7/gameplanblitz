import { useMemo } from 'react'

import { recordsThrough } from '../lib/analytics/league'
import type { Ready } from './useLeagueData'
import { useLeagueSeason } from './useLeagueSeason'

/** Records entering the viewed week, rebuilt from Sleeper's scores, as "W-L(-T)". */
export function useEnteringRecord(data: Ready) {
  const { season } = useLeagueSeason(data)
  const entering = useMemo(() => recordsThrough(season, data.week - 1), [season, data.week])
  return (id: number) => {
    const r = entering.get(id)
    return r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : null
  }
}
