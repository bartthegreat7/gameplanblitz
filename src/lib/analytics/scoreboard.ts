import type { Model } from '../model'
import type { SleeperMatchup } from '../sleeper'
import { liveSide, liveWinProbability, type LiveSide } from './gameday'
import { pairGames, type TeamRecord } from './league'
import type { WeekContext } from './schedule'

/* The league scoreboard for one week: Sleeper's live points (facts) next to projected finals and
   win odds (model). Projections use the week's Sleeper projections for the set lineups. */

export type BoardStatus = 'scheduled' | 'live' | 'final'

export interface BoardSide {
  rosterId: number
  points: number
  projectedFinal: number
  /** full-game projection of the starting lineup (pre-game expectation) */
  pregame: number
  /** starters whose games haven't finished */
  playersLeft: number
  live: LiveSide
}

export interface BoardGame {
  matchupId: number
  a: BoardSide
  b: BoardSide | null
  status: BoardStatus
  /** a's win probability (model), null for a solo game */
  aWinPct: number | null
  /** projected (or final) margin under 10 points */
  close: boolean
  /** the pre-game underdog is winning (live) or won (final) */
  upset: boolean
}

const boardSide = (m: Model, row: SleeperMatchup, ctx: WeekContext | null): BoardSide => {
  const live = liveSide(m, row, ctx)
  return {
    rosterId: row.roster_id,
    points: live.points,
    projectedFinal: live.projectedFinal,
    pregame: live.totalProj,
    playersLeft: live.players.filter((p) => p.id && (p.state === 'not-started' || p.state === 'in-progress' || p.state === 'unknown')).length,
    live,
  }
}

/**
 * Every matchup this week. A game is final when the week is over (`past`) or every starter's NFL
 * game is final; live once any starter has scored or kicked off; otherwise scheduled.
 */
export function scoreboard(m: Model, matchups: SleeperMatchup[], ctx: WeekContext | null, past: boolean): BoardGame[] {
  const rows = new Map(matchups.map((r) => [r.roster_id, r]))
  return pairGames(matchups).map((g) => {
    const a = boardSide(m, rows.get(g.a.rosterId)!, ctx)
    const b = g.b ? boardSide(m, rows.get(g.b.rosterId)!, ctx) : null
    const players = [...a.live.players, ...(b?.live.players ?? [])].filter((p) => p.id)
    const done = players.length > 0 && players.every((p) => p.state === 'final' || p.state === 'bye')
    const started = players.some((p) => p.state === 'in-progress' || p.state === 'final' || p.points !== 0)
    const status: BoardStatus = past || done ? 'final' : started ? 'live' : 'scheduled'
    if (status === 'final') {
      // final: the score is the result; nothing left to project
      a.projectedFinal = a.points
      a.playersLeft = 0
      if (b) {
        b.projectedFinal = b.points
        b.playersLeft = 0
      }
    }
    const aWinPct = !b ? null : status === 'final' ? (a.points > b.points ? 100 : a.points < b.points ? 0 : 50) : liveWinProbability(a.live, b.live)
    const margin = b ? Math.abs(a.projectedFinal - b.projectedFinal) : Infinity
    const favorite = b && a.pregame !== b.pregame ? (a.pregame > b.pregame ? 'a' : 'b') : null
    const leading = aWinPct === null ? null : aWinPct > 50 ? 'a' : aWinPct < 50 ? 'b' : null
    const upset = !!favorite && !!leading && status !== 'scheduled' && favorite !== leading
    return { matchupId: g.matchupId, a, b, status, aWinPct, close: !!b && margin < 10, upset }
  })
}

/** Records after this week if every game ends as currently projected (live) or as it ended (final). */
export function projectedRecords(base: Map<number, TeamRecord>, games: BoardGame[]): Map<number, TeamRecord> {
  const out = new Map([...base].map(([id, r]) => [id, { ...r }]))
  const get = (id: number) => out.get(id) ?? (out.set(id, { w: 0, l: 0, t: 0, pf: 0, pa: 0 }), out.get(id)!)
  for (const g of games) {
    if (!g.b) continue
    const a = get(g.a.rosterId)
    const b = get(g.b.rosterId)
    a.pf += g.a.projectedFinal
    b.pf += g.b.projectedFinal
    if (g.a.projectedFinal > g.b.projectedFinal) {
      a.w++
      b.l++
    }
    else if (g.a.projectedFinal < g.b.projectedFinal) {
      a.l++
      b.w++
    }
    else {
      a.t++
      b.t++
    }
  }
  return out
}
