import type { FcValue } from '../fantasycalc'
import { availabilityOf, type Usage } from './opportunity'

/*
 * Player Stock Market. Market value and its 30-day change come from FantasyCalc (the provider's
 * own history of trade-market values); opportunity and efficiency come from Sleeper usage. Signals:
 *   Buy low   value down 10%+ in 30 days while opportunity holds or grows, and not ruled out
 *   Sell high value up 10%+ in 30 days while recent scoring outruns usage by 3+ pts/game,
 *             or opportunity is shrinking
 * Evidence for a trade conversation, not a prediction.
 */

export const MARKET = {
  move: 0.1,
  efficiency: 3,
  oppDrop: -3,
  recentGames: 2,
  minEarlier: 2,
} as const

export type Signal = 'buy-low' | 'sell-high' | null

export interface OppTrend {
  /** touches + targets per game, last 2 games vs earlier games */
  recent: number
  earlier: number
  /** recent points minus recent expected points from usage (efficiency), per game */
  overExpected: number | null
}

export function oppTrend(games: Usage[] | undefined): OppTrend | null {
  const g = games ?? []
  if (g.length < MARKET.recentGames + MARKET.minEarlier) return null
  const r = g.slice(-MARKET.recentGames)
  const e = g.slice(0, -MARKET.recentGames)
  const per = (xs: Usage[]) => xs.reduce((a, u) => a + u.touches + u.targets, 0) / xs.length
  const xs = r.map((u) => u.xfp)
  const over = xs.every((x) => x !== null)
    ? r.reduce((a, u) => a + u.pts - (u.xfp as number), 0) / r.length
    : null
  return { recent: per(r), earlier: per(e), overExpected: over }
}

/** 30-day change as a share of the value 30 days ago. */
export const pctChange = (fc: FcValue | undefined) =>
  fc && typeof fc.trend30 === 'number' && fc.value - fc.trend30 > 0
    ? fc.trend30 / (fc.value - fc.trend30)
    : null

export function signalFor(
  fc: FcValue | undefined,
  trend: OppTrend | null,
  injury: string,
): { signal: Signal; reason: string | null } {
  const pct = pctChange(fc)
  if (pct === null || !trend) return { signal: null, reason: null }
  const oppDelta = trend.recent - trend.earlier
  if (pct <= -MARKET.move && oppDelta >= 0 && availabilityOf(injury) !== 'out')
    return {
      signal: 'buy-low',
      reason: `Market value down ${Math.round(-pct * 100)}% in 30 days, but his opportunity is ${oppDelta > 0.5 ? 'up' : 'steady'} (${trend.earlier.toFixed(1)} → ${trend.recent.toFixed(1)} touches + targets per game).`,
    }
  if (pct >= MARKET.move && trend.overExpected !== null && trend.overExpected >= MARKET.efficiency)
    return {
      signal: 'sell-high',
      reason: `Market value up ${Math.round(pct * 100)}% in 30 days while he has scored ${trend.overExpected.toFixed(1)} pts per game more than his usage usually produces.`,
    }
  if (pct >= MARKET.move && oppDelta <= MARKET.oppDrop)
    return {
      signal: 'sell-high',
      reason: `Market value up ${Math.round(pct * 100)}% in 30 days while his opportunity fell (${trend.earlier.toFixed(1)} → ${trend.recent.toFixed(1)} touches + targets per game).`,
    }
  return { signal: null, reason: null }
}

/* ---------------- local value snapshots ---------------- */

export interface Snapshot {
  /** YYYY-MM-DD */
  date: string
  values: Record<string, number>
}

export const SNAPSHOT_DAYS = 60

/** Add today's snapshot (replacing one from the same day) and keep the last 60 days. */
export function addSnapshot(list: Snapshot[], snap: Snapshot): Snapshot[] {
  const rest = list.filter((s) => s.date !== snap.date)
  return [...rest, snap].sort((a, b) => a.date.localeCompare(b.date)).slice(-SNAPSHOT_DAYS)
}

/** Change since the oldest snapshot that has the player (needs 2+ distinct days). */
export function trackedChange(
  list: Snapshot[],
  id: string,
): { change: number; since: string } | null {
  const have = list.filter((s) => typeof s.values[id] === 'number')
  if (have.length < 2) return null
  const first = have[0]
  const last = have[have.length - 1]
  if (first.date === last.date) return null
  return { change: last.values[id] - first.values[id], since: first.date }
}
