import { OUT_INJ } from '../lineup'
import type { Model } from '../model'
import { pointsFor } from '../scoring'
import type { ScheduleGame, SleeperRoster, StatLine } from '../sleeper'
import { optimalAssignment } from './lineupPlan'
import { hasStarted, isBye, weekContext } from './schedule'

/** Players with these designations are out for the whole horizon; "Out"/"DNR"/"COV" only for the current week. */
export const LONG_TERM = new Set(['IR', 'PUP', 'Sus', 'NA'])

export interface HorizonWeek {
  week: number
  /** Sleeper projections for that week (player id → stat line); empty if unpublished */
  proj: Map<string, StatLine>
}

/** Roster players who count toward the roster limit and can start: everyone except IR and taxi. */
export const lineupIdsOf = (r: Pick<SleeperRoster, 'players' | 'reserve' | 'taxi'> | undefined) => {
  const away = new Set([...(r?.reserve ?? []), ...(r?.taxi ?? [])])
  return (r?.players ?? []).filter((id) => !away.has(id))
}

/**
 * Per-week projected value of players and of the best lineup built from any set of them.
 * Shared by the Waiver Sniper (your roster) and the Trade War Room (any roster).
 *
 * Rules: a player counts 0 in a week he cannot play. Out/DNR/COV = this week only; IR/PUP/Sus/NA
 * = every week; the schedule is authoritative for byes (no game, no points, whatever a projection
 * says). Week index 0 is the current week.
 */
export function createValuer(m: Model, horizon: HorizonWeek[], schedule: ScheduleGame[] | null) {
  const ctx = schedule ? horizon.map((h) => weekContext(schedule, h.week)) : null

  const raw = (id: string, k: number) => pointsFor(horizon[k].proj.get(id), m.scoring)

  const valueAt = (id: string, k: number) => {
    const inj = m.injury(id)
    if (LONG_TERM.has(inj) || (k === 0 && OUT_INJ.has(inj))) return 0
    if (ctx && isBye(ctx[k], m.team(id))) return 0
    return raw(id, k)
  }

  /** Total projected points of the best lineup from `ids` in horizon week `k`. */
  const total = (ids: string[], k: number) => {
    const val = new Map(ids.map((id) => [id, valueAt(id, k)] as const))
    const assigned = optimalAssignment(m.startSlots, ids.map((id) => ({ id, pos: m.pos(id), value: val.get(id)! })))
    return assigned.reduce((t, id) => t + (id ? val.get(id)! : 0), 0)
  }

  /** Who starts, by slot, in the best lineup from `ids` in week `k`. */
  const starters = (ids: string[], k: number) =>
    optimalAssignment(m.startSlots, ids.map((id) => ({ id, pos: m.pos(id), value: valueAt(id, k) })))

  /** The player's game this week has started: he cannot be added or dropped on waivers. */
  const started0 = (id: string) => (ctx ? hasStarted(ctx[0], m.team(id)) : false)

  return { ctx, raw, valueAt, total, starters, started0 }
}

export type Valuer = ReturnType<typeof createValuer>
