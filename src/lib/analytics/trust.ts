import { winProbability } from '../scoring'
import type { SleeperMatchup } from '../sleeper'
import type { WeekReview } from './academy'
import { pairGames } from './league'

/* Prediction Trust: how the app's estimates held up in this league. Win probabilities use the same
   logistic model as everywhere else, fed with each week's Sleeper projections for the lineups that
   were actually set. No claim is made that a recommendation caused a result. */

export interface CalPoint {
  /** the favorite's predicted win probability (0.5-1) */
  p: number
  won: boolean
}

/** One point per decided matchup in each completed week. */
export function matchupPoints(weeks: { matchups: SleeperMatchup[]; projOf: (id: string) => number }[]): CalPoint[] {
  const out: CalPoint[] = []
  for (const { matchups, projOf } of weeks)
    for (const g of pairGames(matchups)) {
      if (!g.b || g.a.points === g.b.points) continue
      const proj = (s: typeof g.a) => s.starters.reduce((t, id) => t + projOf(id), 0)
      const pa = winProbability(proj(g.a), proj(g.b))
      const aFav = pa >= 0.5
      out.push({ p: aFav ? pa : 1 - pa, won: aFav ? g.a.points > g.b.points : g.b.points > g.a.points })
    }
  return out
}

export interface Calibration {
  n: number
  /** mean squared error of the probabilities; a coin flip scores 0.25, lower is better */
  brier: number
  bins: { label: string; n: number; predicted: number; observed: number }[]
}

const BINS: [number, number][] = [
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1.0001],
]

export function calibration(points: CalPoint[]): Calibration {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return {
    n: points.length,
    brier: mean(points.map((x) => (x.p - (x.won ? 1 : 0)) ** 2)),
    bins: BINS.map(([lo, hi]) => {
      const inBin = points.filter((x) => x.p >= lo && x.p < hi)
      return {
        label: `${Math.round(lo * 100)}-${Math.min(100, Math.round(hi * 100))}%`,
        n: inBin.length,
        predicted: mean(inBin.map((x) => x.p)),
        observed: mean(inBin.map((x) => (x.won ? 1 : 0))),
      }
    }).filter((b) => b.n > 0),
  }
}

export interface AdviceRecord {
  weeks: number
  /** weeks your lineup matched the best projected lineup (within half a point) */
  followed: number
  /** weeks it differed, and in how many of those the recommended lineup scored more */
  differed: number
  adviceScoredMore: number
  /** actual points the recommended lineup scored minus yours, summed over the weeks they differed */
  net: number
}

/** How the lineup advice (the best projected lineup) compared with the lineup you set. */
export function adviceRecord(reviews: WeekReview[]): AdviceRecord {
  const diff = reviews.filter((r) => r.processGap >= 0.5)
  return {
    weeks: reviews.length,
    followed: reviews.length - diff.length,
    differed: diff.length,
    adviceScoredMore: diff.filter((r) => r.bestProjActual > r.setActual).length,
    net: diff.reduce((a, r) => a + (r.bestProjActual - r.setActual), 0),
  }
}

export interface Miss {
  id: string
  proj: number
  actual: number
  error: number
}

/** The biggest projection misses among the starters you set in a week (Sleeper projection vs points). */
export function biggestMisses(mine: SleeperMatchup, projOf: (id: string) => number, n = 5): Miss[] {
  return (mine.starters ?? [])
    .filter((id) => id && id !== '0')
    .map((id) => {
      const proj = projOf(id)
      const actual = mine.players_points?.[id] ?? 0
      return { id, proj, actual, error: actual - proj }
    })
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))
    .slice(0, n)
}
