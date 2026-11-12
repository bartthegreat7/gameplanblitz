import { OUT_INJ } from '../lineup'
import type { Model } from '../model'
import type { ScheduleGame, SleeperMatchup, StatRow } from '../sleeper'
import { findMyMatchup } from '../insights'
import type { HistoryMap, WeekRows } from './history'
import { planLineup, type Candidate, type LineupPlan, type RiskMode } from './lineupPlan'
import { defenseKey, defenseVsPosition } from './matchup'
import { hasStarted, isBye, weekContext } from './schedule'
import { usageTrend } from './usage'
import { playerSpread, positionSds, projectionRange } from './volatility'
import { buildHistory } from './history'

export interface AnalysisInput {
  model: Model
  matchups: SleeperMatchup[]
  /** this week's Sleeper projection rows (opponent, provider); may be empty */
  projectionRows: StatRow[]
  /** completed weeks of actual stats; empty when unavailable */
  weeks: WeekRows[]
  /** null when the schedule could not be loaded */
  schedule: ScheduleGame[] | null
  week: number
  mode: RiskMode
}

export interface LineupAnalysis {
  plan: LineupPlan
  /** every rostered player, with his analytics */
  candidates: Candidate[]
  /** projection provider named on Sleeper's rows */
  provider: string | null
  historyWeeks: number
  hasSchedule: boolean
}

/** Most common non-empty value, or null. */
function mode<T>(xs: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>()
  for (const x of xs) if (x) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Builds the explainable lineup recommendation for the signed-in team. Returns null when the
 * team has no matchup this week. Every input beyond the model is optional: missing history
 * means no ranges, missing schedule means no bye/lock/matchup context. The plan still works.
 */
export function analyzeLineup(input: AnalysisInput): LineupAnalysis | null {
  const { model: m, matchups, projectionRows, weeks, schedule, mode: risk } = input
  const me = findMyMatchup(matchups, m.myRosterId)
  if (!me) return null

  const history: HistoryMap | null = weeks.length ? buildHistory(weeks, m.scoring) : null
  const posSd = history ? positionSds(history, m.pos) : new Map<string, number>()
  const defense = weeks.length ? defenseVsPosition(weeks, m.scoring, m.pos) : null
  const ctx = schedule ? weekContext(schedule, input.week) : null
  const projOpp = new Map(projectionRows.map((r) => [r.player_id, r.opponent ?? null] as const))

  const ids = [...new Set([...(m.myRoster()?.players ?? []), ...(me.starters ?? [])])].filter((id) => id && id !== '0')
  const candidates = new Map<string, Candidate>()
  for (const id of ids) {
    const pos = m.pos(id)
    const team = m.team(id)
    const games = history?.get(id)
    const proj = m.projPts(id)
    const spread = playerSpread(games, posSd.get(pos))
    const range = projectionRange(proj, spread.sd)
    const opponent = ctx?.opponent.get(team) ?? projOpp.get(id) ?? null
    const injury = m.injury(id)
    candidates.set(id, {
      id,
      name: m.shortName(id),
      pos,
      team,
      opponent,
      proj,
      sd: spread.sd,
      floor: range?.floor ?? null,
      ceiling: range?.ceiling ?? null,
      n: spread.n,
      injury,
      out: OUT_INJ.has(injury),
      bye: ctx ? isBye(ctx, team) : false,
      started: ctx ? hasStarted(ctx, team) : false,
      usage: usageTrend(games),
      matchup: opponent ? (defense?.get(defenseKey(opponent, pos)) ?? null) : null,
    })
  }

  const provider = mode(projectionRows.map((r) => r.company))
  const plan = planLineup({
    startSlots: m.startSlots,
    currentStarters: me.starters ?? [],
    candidates,
    mode: risk,
    provider,
  })
  return { plan, candidates: [...candidates.values()], provider, historyWeeks: weeks.length, hasSchedule: !!ctx }
}
