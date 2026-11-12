import { pointsFor, type Scoring } from '../scoring'
import type { StatRow } from '../sleeper'
import type { WeekRows } from './history'

export interface DefenseVsPos {
  /** fantasy points allowed per game to the position, all players, league scoring */
  perGame: number
  /** 1 = most generous to the position */
  rank: number
  /** defenses ranked */
  of: number
  /** league-average points allowed per game to the position */
  leagueAvg: number
}

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])
const played = (s: StatRow['stats']) => (s.gp || s.gms_active || 0) > 0
export const defenseKey = (team: string, pos: string) => `${team}|${pos}`

/**
 * Points each NFL defense has allowed to QB/RB/WR/TE this season, from completed weeks.
 * Context only: Sleeper projections may already reflect matchups, so this is never added to them.
 */
export function defenseVsPosition(
  weeks: WeekRows[],
  scoring: Scoring,
  posOf: (playerId: string) => string,
): Map<string, DefenseVsPos> {
  const sums = new Map<string, number>() // team|pos → points allowed
  const weeksPlayed = new Map<string, Set<number>>() // team → weeks seen
  for (const { week, rows } of weeks) {
    for (const r of rows) {
      const pos = posOf(r.player_id)
      if (!r.opponent || !POSITIONS.has(pos) || !played(r.stats)) continue
      const k = defenseKey(r.opponent, pos)
      sums.set(k, (sums.get(k) ?? 0) + pointsFor(r.stats, scoring))
      const set = weeksPlayed.get(r.opponent) ?? new Set<number>()
      set.add(week)
      weeksPlayed.set(r.opponent, set)
    }
  }

  const out = new Map<string, DefenseVsPos>()
  for (const pos of POSITIONS) {
    const rows = [...weeksPlayed]
      .map(([team, set]) => ({ team, perGame: (sums.get(defenseKey(team, pos)) ?? 0) / set.size }))
      .sort((a, b) => b.perGame - a.perGame)
    if (rows.length === 0) continue
    const leagueAvg = rows.reduce((a, r) => a + r.perGame, 0) / rows.length
    rows.forEach((r, i) =>
      out.set(defenseKey(r.team, pos), { perGame: r.perGame, rank: i + 1, of: rows.length, leagueAvg }),
    )
  }
  return out
}
