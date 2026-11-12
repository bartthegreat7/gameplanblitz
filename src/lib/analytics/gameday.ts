import { flexLabel, OUT_INJ, SLOT_ELIG } from '../lineup'
import type { Model } from '../model'
import type { ScheduleGame, SleeperMatchup } from '../sleeper'
import { isBye, type WeekContext } from './schedule'

/* Game Day: Sleeper's live scores (facts) next to projections of what is still to come (model). */

export type GameState = 'not-started' | 'in-progress' | 'final' | 'bye' | 'unknown'

/**
 * A player's game state. The schedule's status can lag a live game, so points already scored
 * also count as "in progress" while it still says pre_game.
 */
export function gameState(ctx: WeekContext | null, team: string, points: number): GameState {
  if (!ctx) return points > 0 ? 'in-progress' : 'unknown'
  if (isBye(ctx, team)) return 'bye'
  const s = ctx.status.get(team)
  if (s === 'complete') return 'final'
  if (s === undefined) return points > 0 ? 'in-progress' : 'unknown'
  if (s === 'pre_game') return points > 0 ? 'in-progress' : 'not-started'
  return 'in-progress'
}

export interface LivePlayer {
  id: string
  name: string
  pos: string
  slot: string
  /** Sleeper's live points (fact) */
  points: number
  /** Sleeper's full-game projection, league scoring (model) */
  proj: number
  /** projected points still to come (model): full projection before kickoff, the rest during the game */
  remaining: number
  state: GameState
  injury: string
}

export interface LiveSide {
  rosterId: number
  name: string
  /** Sleeper's live total (fact) */
  points: number
  /** live total + projected remaining (model) */
  projectedFinal: number
  remaining: number
  /** sum of full-game projections, for "how much of the game is left" */
  totalProj: number
  players: LivePlayer[]
}

/** Points a player can still add, by the model: 0 once final, on a bye, or Out before kickoff. */
export function remainingFor(state: GameState, proj: number, points: number, injury: string): number {
  if (state === 'final' || state === 'bye') return 0
  if (state === 'not-started' || state === 'unknown') return OUT_INJ.has(injury) ? 0 : proj
  return Math.max(0, proj - points)
}

export function liveSide(m: Model, matchup: SleeperMatchup, ctx: WeekContext | null): LiveSide {
  const starters = matchup.starters ?? []
  const pts = matchup.players_points ?? {}
  const players = m.startSlots.map<LivePlayer>((slot, i) => {
    const id = starters[i]
    if (!id || id === '0')
      return { id: '', name: 'Empty', pos: '', slot: flexLabel(slot), points: 0, proj: 0, remaining: 0, state: 'unknown', injury: '' }
    const points = pts[id] ?? matchup.starters_points?.[i] ?? 0
    const proj = m.projPts(id)
    const injury = m.injury(id)
    const state = gameState(ctx, m.team(id), points)
    return { id, name: m.shortName(id), pos: m.pos(id), slot: flexLabel(slot), points, proj, remaining: remainingFor(state, proj, points, injury), state, injury }
  })
  const remaining = players.reduce((a, p) => a + p.remaining, 0)
  const points = matchup.points ?? players.reduce((a, p) => a + p.points, 0)
  return {
    rosterId: matchup.roster_id,
    name: m.teamName(matchup.roster_id),
    points,
    projectedFinal: points + remaining,
    remaining,
    totalProj: players.reduce((a, p) => a + p.proj, 0),
    players,
  }
}

/** Spread of the standard win model at kickoff; it narrows as the projected points left shrink. */
export const KICKOFF_SPREAD = 28

/**
 * Live win probability (model): logistic on the projected-final margin, with a spread of
 * 28 × √(share of projected points still to come). At kickoff this is the app's standard model;
 * when every game is final it is 100 / 50 / 0.
 */
export function liveWinProbability(me: LiveSide, opp: LiveSide): number {
  const left = me.remaining + opp.remaining
  const diff = me.projectedFinal - opp.projectedFinal
  if (left <= 0) return diff > 0 ? 100 : diff < 0 ? 0 : 50
  const total = Math.max(me.totalProj + opp.totalProj, left)
  const spread = KICKOFF_SPREAD * Math.sqrt(Math.max(left / total, 0.02))
  return Math.round(100 / (1 + Math.exp(-diff / spread)))
}

export interface Alert {
  kind: 'empty' | 'out' | 'bye' | 'swap'
  severity: 'high' | 'medium'
  /** facts come from Sleeper; swaps are a model suggestion */
  source: 'fact' | 'model'
  text: string
}

/** Problems with my set lineup that I can still fix (players whose games haven't started). */
export function lineupAlerts(m: Model, side: LiveSide, matchup: SleeperMatchup, ctx: WeekContext | null): Alert[] {
  const out: Alert[] = []
  const open = (p: LivePlayer) => p.state === 'not-started' || p.state === 'unknown'
  side.players.forEach((p) => {
    if (!p.id) out.push({ kind: 'empty', severity: 'high', source: 'fact', text: `Your ${p.slot} slot is empty.` })
    else if (p.state === 'bye') out.push({ kind: 'bye', severity: 'high', source: 'fact', text: `${p.name} (${p.slot}) is on a bye this week.` })
    else if (open(p) && OUT_INJ.has(p.injury)) out.push({ kind: 'out', severity: 'high', source: 'fact', text: `${p.name} (${p.slot}) is listed ${p.injury}.` })
  })
  // bench players who haven't played and project higher than a not-yet-played starter they can replace
  const starters = new Set(side.players.map((p) => p.id).filter(Boolean))
  const bench = (matchup.players ?? []).filter((id) => !starters.has(id))
  const usedBench = new Set<string>()
  side.players.forEach((p, i) => {
    if (!p.id || !open(p)) return
    const elig = SLOT_ELIG[m.startSlots[i]] ?? [m.startSlots[i]]
    const starterValue = OUT_INJ.has(p.injury) ? 0 : p.proj
    const best = bench
      .filter((id) => !usedBench.has(id) && elig.includes(m.pos(id)) && !OUT_INJ.has(m.injury(id)))
      .filter((id) => {
        // only bench players whose own game hasn't started can still be moved in
        const st = gameState(ctx, m.team(id), matchup.players_points?.[id] ?? 0)
        return st === 'not-started' || st === 'unknown'
      })
      .sort((a, b) => m.projPts(b) - m.projPts(a))[0]
    if (best && m.projPts(best) > starterValue + 0.5) {
      usedBench.add(best)
      out.push({
        kind: 'swap',
        severity: 'medium',
        source: 'model',
        text: `Consider starting ${m.shortName(best)} (${m.projPts(best).toFixed(1)} proj) over ${p.name} (${starterValue.toFixed(1)}) at ${p.slot}.`,
      })
    }
  })
  return out
}

/** Any game in progress, or any not yet started: decides how often to poll. */
export const isLive = (sides: LiveSide[]) => sides.some((s) => s.players.some((p) => p.state === 'in-progress'))

/* ---------- polling ---------- */

export const LIVE_POLL_MS = 60_000
export const IDLE_POLL_MS = 5 * 60_000

/** Poll fast only while a game is underway: something has started and something is not final. */
export function pollInterval(matchups: SleeperMatchup[] | undefined, schedule: ScheduleGame[] | undefined, week: number): number {
  const scored = (matchups ?? []).some((x) => (x.points ?? 0) > 0)
  if (!schedule) return scored ? LIVE_POLL_MS : IDLE_POLL_MS
  const thisWeek = schedule.filter((g) => g.week === week)
  const started = thisWeek.some((g) => g.status !== 'pre_game') || scored
  const unfinished = thisWeek.some((g) => g.status !== 'complete')
  return started && unfinished ? LIVE_POLL_MS : IDLE_POLL_MS
}
