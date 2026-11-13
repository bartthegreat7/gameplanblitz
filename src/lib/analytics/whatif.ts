import type { Model } from '../model'
import { winProbability } from '../scoring'
import { optimalAssignment } from './lineupPlan'
import type { Valuer } from './lineupValue'
import { isBye } from './schedule'

/*
 * Alternate Reality Simulator: what a hypothetical change does to your team, computed with the same
 * projections and optimizer as the real tools. Nothing here touches Sleeper. Weekly totals are the
 * best lineup from the roster each week (or your forced choices this week).
 */

export interface Scenario {
  /** this week only: players you insist on starting / benching */
  forceStart: string[]
  forceBench: string[]
  /** free agents added and players dropped */
  adds: string[]
  drops: string[]
  /** a trade with one team */
  trade: { rosterId: number; give: string[]; get: string[] } | null
  /** players treated as out for their next N weeks (any team) */
  injuries: { id: string; weeks: number }[]
}

export const EMPTY_SCENARIO: Scenario = { forceStart: [], forceBench: [], adds: [], drops: [], trade: null, injuries: [] }

export const isEmpty = (s: Scenario) =>
  !s.forceStart.length && !s.forceBench.length && !s.adds.length && !s.drops.length && !s.trade && !s.injuries.length

export interface SideResult {
  /** this week's projected points */
  week0: number
  /** projected points per horizon week */
  weekly: number[]
  avg: number
  /** this week's starters (ids by slot) */
  starters: (string | null)[]
  /** risk: starters this week with an injury designation */
  designated: string[]
  /** risk: the horizon week with the most best-lineup starters lost to byes */
  byeHit: { week: number; count: number } | null
  /** risk: best three bench players' projections this week */
  benchDepth: number
}

export interface WhatIf {
  mine: { current: SideResult; proposed: SideResult }
  /** this week's opponent */
  opp: { rosterId: number; current: SideResult; proposed: SideResult } | null
  /** a trade partner who isn't this week's opponent */
  partner: { rosterId: number; current: SideResult; proposed: SideResult } | null
  win: { current: number; proposed: number } | null
}

const BIG = 1000

function side(
  m: Model,
  v: Valuer,
  weeks: number[],
  ids: string[],
  out: Map<string, number>,
  force: { start: Set<string>; bench: Set<string> },
): SideResult {
  const value = (id: string, k: number) => ((out.get(id) ?? 0) > k ? 0 : v.valueAt(id, k))
  const best = (k: number) => {
    const pool = k === 0 ? ids.filter((id) => !force.bench.has(id)) : ids
    const assigned = optimalAssignment(
      m.startSlots,
      pool.map((id) => ({ id, pos: m.pos(id), value: value(id, k) + (k === 0 && force.start.has(id) ? BIG : 0) })),
    )
    return { assigned, total: assigned.reduce((t, id) => t + (id ? value(id, k) : 0), 0) }
  }
  const per = weeks.map((_, k) => best(k))
  const starters = per[0]?.assigned ?? []
  const set = new Set(starters.filter(Boolean) as string[])
  // this week's starters who are on a bye in a later horizon week
  let byeHit: SideResult['byeHit'] = null
  if (v.ctx)
    for (let k = 0; k < weeks.length; k++) {
      const count = [...set].filter((id) => isBye(v.ctx![k], m.team(id))).length
      if (count > (byeHit?.count ?? 0)) byeHit = { week: weeks[k], count }
    }
  const bench = ids
    .filter((id) => !set.has(id))
    .map((id) => value(id, 0))
    .sort((a, b) => b - a)
    .slice(0, 3)
  const weekly = per.map((p) => p.total)
  return {
    week0: weekly[0] ?? 0,
    weekly,
    avg: weekly.length ? weekly.reduce((a, b) => a + b, 0) / weekly.length : 0,
    starters,
    designated: [...set].filter((id) => m.injury(id)),
    byeHit,
    benchDepth: bench.reduce((a, b) => a + b, 0),
  }
}

/** Evaluates a scenario against the current rosters. `weeks` are the horizon weeks behind `v`. */
export function evaluateScenario(m: Model, v: Valuer, weeks: number[], s: Scenario, oppRosterId: number | null): WhatIf {
  const rosterOf = (id: number) => (m.rosterById(id)?.players ?? []).filter((p) => !(m.rosterById(id)?.reserve ?? []).includes(p))
  const noOut = new Map<string, number>()
  const out = new Map(s.injuries.map((i) => [i.id, i.weeks]))
  const none = { start: new Set<string>(), bench: new Set<string>() }
  const force = { start: new Set(s.forceStart), bench: new Set(s.forceBench) }

  const me = m.myRosterId
  const mineNow = rosterOf(me)
  let mineNext = mineNow.filter((id) => !s.drops.includes(id)).concat(s.adds.filter((id) => !mineNow.includes(id)))
  const partnerId = s.trade?.rosterId ?? null
  let partnerNext: string[] | null = null
  if (s.trade && partnerId !== null) {
    mineNext = mineNext.filter((id) => !s.trade!.give.includes(id)).concat(s.trade.get)
    partnerNext = rosterOf(partnerId).filter((id) => !s.trade!.get.includes(id)).concat(s.trade.give)
  }

  const mine = { current: side(m, v, weeks, mineNow, noOut, none), proposed: side(m, v, weeks, mineNext, out, force) }
  const sideFor = (id: number) => ({
    rosterId: id,
    current: side(m, v, weeks, rosterOf(id), noOut, none),
    proposed: side(m, v, weeks, id === partnerId && partnerNext ? partnerNext : rosterOf(id), out, none),
  })
  const opp = oppRosterId !== null ? sideFor(oppRosterId) : null
  const partner = partnerId !== null && partnerId !== oppRosterId ? sideFor(partnerId) : null
  const win = opp
    ? {
        current: Math.round(100 * winProbability(mine.current.week0, opp.current.week0)),
        proposed: Math.round(100 * winProbability(mine.proposed.week0, opp.proposed.week0)),
      }
    : null
  return { mine, opp, partner, win }
}
