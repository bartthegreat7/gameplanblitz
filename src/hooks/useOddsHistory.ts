import { useEffect, useMemo } from 'react'

import { oddsChange, recordOdds, type OddsSnapshot } from '../lib/analytics/command'

const KEY = (leagueId: string) => `gb-odds-${leagueId}`
const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function read(leagueId: string): OddsSnapshot[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(leagueId)) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * Playoff odds over time, kept in this browser (one snapshot per day). Returns the change since
 * the latest earlier day, or null when this browser has no earlier snapshot.
 */
export function useOddsHistory(leagueId: string, week: number, pct: number | null) {
  const history = useMemo(() => read(leagueId), [leagueId])
  const today = localDay()
  useEffect(() => {
    if (pct === null) return
    try {
      localStorage.setItem(KEY(leagueId), JSON.stringify(recordOdds(read(leagueId), { day: today, week, pct })))
    } catch {
      /* storage unavailable: no history */
    }
  }, [leagueId, week, pct, today])
  return pct === null ? null : oddsChange(history, today, pct)
}
