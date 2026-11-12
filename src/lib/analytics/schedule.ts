import type { ScheduleGame } from '../sleeper'

export interface WeekContext {
  /** team → opponent this week */
  opponent: Map<string, string>
  /** team → game status this week ("pre_game", "complete", ...) */
  status: Map<string, string>
  /** every team that appears anywhere in the season schedule (to avoid false bye flags) */
  known: Set<string>
}

export function weekContext(games: ScheduleGame[], week: number): WeekContext {
  const opponent = new Map<string, string>()
  const status = new Map<string, string>()
  const known = new Set<string>()
  for (const g of games) {
    known.add(g.home)
    known.add(g.away)
    if (g.week !== week) continue
    opponent.set(g.home, g.away)
    opponent.set(g.away, g.home)
    status.set(g.home, g.status)
    status.set(g.away, g.status)
  }
  return { opponent, status, known }
}

/**
 * On bye: a known team with no game in a week that does have games. Unknown teams are never
 * flagged, and neither is anyone when the schedule has no games at all for the week (missing
 * data must not read as "everyone is on a bye").
 */
export const isBye = (ctx: WeekContext, team: string) =>
  !!team && ctx.opponent.size > 0 && ctx.known.has(team) && !ctx.opponent.has(team)

/**
 * Game already started or finished, so the player is locked in Sleeper. Anything other than
 * "pre_game" counts as started (conservative: never recommends moving a locked player).
 */
export const hasStarted = (ctx: WeekContext, team: string) => {
  const s = ctx.status.get(team)
  return s !== undefined && s !== 'pre_game'
}
