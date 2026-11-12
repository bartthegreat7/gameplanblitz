import { pointsFor, type Scoring } from '../scoring'
import type { StatRow } from '../sleeper'

/** One game a player actually played, scored in the league's scoring. */
export interface GameLog {
  week: number
  pts: number
  /** offensive snap share 0-1, when Sleeper reports snaps for the player */
  snapShare: number | null
  opponent: string | null
  team: string | null
}

export type HistoryMap = Map<string, GameLog[]>
export interface WeekRows {
  week: number
  rows: StatRow[]
}

const played = (s: StatRow['stats']) => (s.gp || s.gms_active || 0) > 0

/** Per-player game logs (ascending by week) from completed weekly stat rows. */
export function buildHistory(weeks: WeekRows[], scoring: Scoring): HistoryMap {
  const map: HistoryMap = new Map()
  for (const { week, rows } of [...weeks].sort((a, b) => a.week - b.week)) {
    for (const r of rows) {
      if (!played(r.stats)) continue
      const off = r.stats.off_snp
      const tm = r.stats.tm_off_snp
      const log: GameLog = {
        week,
        pts: pointsFor(r.stats, scoring),
        snapShare: off > 0 && tm > 0 ? off / tm : null,
        opponent: r.opponent ?? null,
        team: r.team ?? null,
      }
      const list = map.get(r.player_id)
      if (list) list.push(log)
      else map.set(r.player_id, [log])
    }
  }
  return map
}
