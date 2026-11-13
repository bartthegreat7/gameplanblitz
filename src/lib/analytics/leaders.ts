import type { SleeperMatchup } from '../sleeper'

/* Weekly leaders: the week's scores as Sleeper reports them (facts, in league scoring). Covers
   every player on a roster in this league; free agents are not in Sleeper's matchup data. */

export interface TeamScore {
  rosterId: number
  points: number
  /** this week's opponent and their points, null on a bye */
  oppRosterId: number | null
  oppPoints: number | null
}

export interface PlayerScore {
  id: string
  pos: string
  points: number
  rosterId: number
  /** in that team's starting lineup (bench points don't count toward the team score) */
  started: boolean
}

export interface WeekLeaders {
  /** every team, highest score first */
  teams: TeamScore[]
  /** position -> players on rosters, highest first */
  byPosition: Map<string, PlayerScore[]>
  /** any points scored yet this week */
  scored: boolean
}

export const LEADER_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** A player's points this week: the per-player map, else his starter slot's points. */
function pointsOf(m: SleeperMatchup): Map<string, number> {
  const out = new Map<string, number>()
  m.starters.forEach((id, i) => {
    const p = m.starters_points?.[i]
    if (id && id !== '0' && typeof p === 'number') out.set(id, p)
  })
  for (const [id, p] of Object.entries(m.players_points ?? {})) if (typeof p === 'number') out.set(id, p)
  return out
}

export function weekLeaders(matchups: SleeperMatchup[], posOf: (id: string) => string): WeekLeaders {
  const teams: TeamScore[] = matchups.map((m) => {
    const opp =
      m.matchup_id === null ? undefined : matchups.find((o) => o.matchup_id === m.matchup_id && o.roster_id !== m.roster_id)
    return { rosterId: m.roster_id, points: m.points ?? 0, oppRosterId: opp?.roster_id ?? null, oppPoints: opp ? (opp.points ?? 0) : null }
  })
  teams.sort((a, b) => b.points - a.points || a.rosterId - b.rosterId)

  const byPosition = new Map<string, PlayerScore[]>()
  const seen = new Set<string>()
  for (const m of matchups) {
    const starters = new Set(m.starters)
    for (const [id, points] of pointsOf(m)) {
      if (seen.has(id)) continue
      seen.add(id)
      const pos = posOf(id)
      if (!pos) continue
      const list = byPosition.get(pos) ?? []
      list.push({ id, pos, points, rosterId: m.roster_id, started: starters.has(id) })
      byPosition.set(pos, list)
    }
  }
  for (const list of byPosition.values()) list.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))
  const scored = teams.some((t) => t.points !== 0) || [...byPosition.values()].some((l) => l.some((p) => p.points !== 0))
  return { teams, byPosition, scored }
}

/** Positions to show: the standard ones first (when present), then any other position with scores. */
export function leaderPositions(byPosition: Map<string, PlayerScore[]>): string[] {
  const extra = [...byPosition.keys()].filter((p) => !LEADER_POSITIONS.includes(p)).sort()
  return [...LEADER_POSITIONS.filter((p) => byPosition.has(p)), ...extra]
}
