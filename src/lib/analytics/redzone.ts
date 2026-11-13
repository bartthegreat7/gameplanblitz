import { f1 } from '../format'
import type { BoardGame, BoardSide } from './scoreboard'

/*
 * Fantasy League RedZone: Sleeper publishes running fantasy points, not plays. So scoring events
 * here are changes GamePlanBitz observed between two Sleeper updates while the page was open:
 * a starter jumping by BIG_PLAY points or more (often a touchdown or a long play), a score going
 * down (a stat correction), and a matchup changing hands. They are labeled as observed changes.
 */

export const BIG_PLAY = 6
export const CORRECTION = -2
export const MAX_EVENTS = 100

export interface Snap {
  at: number
  week: number
  /** roster id → team points and starters' points */
  sides: Record<number, { points: number; players: Record<string, number> }>
}

export type EventKind = 'big-play' | 'correction' | 'lead-change' | 'tied' | 'final'

export interface RzEvent {
  key: string
  at: number
  kind: EventKind
  matchupId: number
  rosterId: number
  playerId: string | null
  /** points gained (or lost) between the two updates */
  delta: number
  text: string
}

const sidesOf = (g: BoardGame): BoardSide[] => (g.b ? [g.a, g.b] : [g.a])

export function snapOf(games: BoardGame[], at: number, week: number): Snap {
  const sides: Snap['sides'] = {}
  for (const g of games)
    for (const s of sidesOf(g))
      sides[s.rosterId] = { points: s.points, players: Object.fromEntries(s.live.players.filter((p) => p.id).map((p) => [p.id, p.points])) }
  return { at, week, sides }
}

export interface Names {
  team: (rosterId: number) => string
  player: (playerId: string) => string
}

/** Events between two snapshots of the same week (none for the first snapshot or a new week). */
export function diffSnaps(prev: Snap | null, next: Snap, games: BoardGame[], names: Names): RzEvent[] {
  if (!prev || prev.week !== next.week || prev.at === next.at) return []
  const out: RzEvent[] = []
  for (const g of games) {
    for (const s of sidesOf(g)) {
      const before = prev.sides[s.rosterId]
      if (!before) continue
      for (const [pid, pts] of Object.entries(next.sides[s.rosterId]?.players ?? {})) {
        const was = before.players[pid]
        if (was === undefined) continue
        const delta = pts - was
        if (delta >= BIG_PLAY)
          out.push({
            key: `${next.at}:big:${pid}`,
            at: next.at,
            kind: 'big-play',
            matchupId: g.matchupId,
            rosterId: s.rosterId,
            playerId: pid,
            delta,
            text: `${names.player(pid)} +${f1(delta)} for ${names.team(s.rosterId)} (now ${f1(pts)})`,
          })
        else if (delta <= CORRECTION)
          out.push({
            key: `${next.at}:fix:${pid}`,
            at: next.at,
            kind: 'correction',
            matchupId: g.matchupId,
            rosterId: s.rosterId,
            playerId: pid,
            delta,
            text: `${names.player(pid)} −${f1(-delta)} for ${names.team(s.rosterId)}: a stat correction or adjustment (now ${f1(pts)})`,
          })
      }
    }
    if (!g.b) continue
    const pa = prev.sides[g.a.rosterId]?.points
    const pb = prev.sides[g.b.rosterId]?.points
    if (pa === undefined || pb === undefined) continue
    const before = pa - pb
    const now = g.a.points - g.b.points
    const [lead, trail] = now > 0 ? [g.a, g.b] : [g.b, g.a]
    if (before !== 0 && now !== 0 && Math.sign(before) !== Math.sign(now))
      out.push({
        key: `${next.at}:lead:${g.matchupId}`,
        at: next.at,
        kind: 'lead-change',
        matchupId: g.matchupId,
        rosterId: lead.rosterId,
        playerId: null,
        delta: Math.abs(now),
        text: `${names.team(lead.rosterId)} takes the lead over ${names.team(trail.rosterId)}, ${f1(lead.points)}–${f1(trail.points)}`,
      })
    else if (before !== 0 && now === 0 && g.a.points > 0)
      out.push({
        key: `${next.at}:tie:${g.matchupId}`,
        at: next.at,
        kind: 'tied',
        matchupId: g.matchupId,
        rosterId: g.a.rosterId,
        playerId: null,
        delta: 0,
        text: `${names.team(g.a.rosterId)} and ${names.team(g.b.rosterId)} are tied at ${f1(g.a.points)}`,
      })
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
}

/** Newest first, without duplicates, capped. */
export function mergeEvents(log: RzEvent[], fresh: RzEvent[], max = MAX_EVENTS): RzEvent[] {
  const seen = new Set(log.map((e) => e.key))
  return [...fresh.filter((e) => !seen.has(e.key)), ...log].sort((a, b) => b.at - a.at).slice(0, max)
}

export interface Leader {
  matchupId: number
  leader: number
  trailer: number
  margin: number
  playersLeft: number
}

/** Each live or finished head-to-head game's current leader, closest first. */
export function currentLeaders(games: BoardGame[]): Leader[] {
  return games
    .filter((g): g is BoardGame & { b: BoardSide } => !!g.b && g.status !== 'scheduled' && g.a.points + g.b.points > 0)
    .map((g) => {
      const [l, t] = g.a.points >= g.b.points ? [g.a, g.b] : [g.b, g.a]
      return { matchupId: g.matchupId, leader: l.rosterId, trailer: t.rosterId, margin: l.points - t.points, playersLeft: g.a.playersLeft + g.b.playersLeft }
    })
    .sort((x, y) => x.margin - y.margin)
}

export interface StarterAlert {
  matchupId: number
  rosterId: number
  playerId: string
  injury: string
}

const CANT_PLAY = new Set(['Out', 'IR', 'PUP', 'Sus', 'NA', 'Doubtful'])

/** Starters across the league listed Out/Doubtful/IR whose games haven't started (Sleeper facts). */
export function starterAlerts(games: BoardGame[]): StarterAlert[] {
  return games.flatMap((g) =>
    sidesOf(g).flatMap((s) =>
      s.live.players
        .filter((p) => p.id && p.state === 'not-started' && CANT_PLAY.has(p.injury))
        .map((p) => ({ matchupId: g.matchupId, rosterId: s.rosterId, playerId: p.id, injury: p.injury })),
    ),
  )
}
