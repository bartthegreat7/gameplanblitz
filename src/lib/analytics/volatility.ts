import { MIN_GAMES } from '../evidence'
import type { GameLog, HistoryMap } from './history'

/** z-score for the 10th/90th percentile of a normal distribution. */
export const Z80 = 1.2815515655446004
/** Prior strength: how many games of positional-average volatility each player is blended with. */
export const SHRINK_K = 3

export interface Spread {
  /** games behind the estimate */
  n: number
  /** average points over those games (league scoring) */
  mean: number | null
  /** week-to-week standard deviation after shrinking toward the position; null if unknowable */
  sd: number | null
  /** fewer than MIN_GAMES games */
  lowSample: boolean
}

export function sampleSd(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const m = values.reduce((a, b) => a + b, 0) / n
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1))
}

/**
 * Pooled week-to-week sd per position, from players with at least MIN_GAMES games:
 * sqrt(Σ(n_i−1)·s_i² / Σ(n_i−1)). Returns an empty map when no player qualifies.
 */
export function positionSds(history: HistoryMap, posOf: (id: string) => string): Map<string, number> {
  const acc = new Map<string, { ss: number; df: number }>()
  for (const [id, games] of history) {
    if (games.length < MIN_GAMES) continue
    const pos = posOf(id)
    if (!pos) continue
    const s = sampleSd(games.map((g) => g.pts))
    const a = acc.get(pos) ?? { ss: 0, df: 0 }
    a.ss += (games.length - 1) * s * s
    a.df += games.length - 1
    acc.set(pos, a)
  }
  return new Map([...acc].filter(([, a]) => a.df > 0).map(([pos, a]) => [pos, Math.sqrt(a.ss / a.df)]))
}

/**
 * A player's volatility: his own sd blended with the positional sd,
 * var = ((n−1)·s² + K·σ_pos²) / ((n−1) + K). With ≤1 game it is the positional sd.
 * Without a positional sd and fewer than 2 games, the sd is unknown (null).
 */
export function playerSpread(games: GameLog[] | undefined, posSd: number | undefined): Spread {
  const pts = (games ?? []).map((g) => g.pts)
  const n = pts.length
  const mean = n ? pts.reduce((a, b) => a + b, 0) / n : null
  const lowSample = n < MIN_GAMES
  let sd: number | null
  if (posSd === undefined) sd = n >= 2 ? sampleSd(pts) : null
  else if (n < 2) sd = posSd
  else {
    const s = sampleSd(pts)
    sd = Math.sqrt(((n - 1) * s * s + SHRINK_K * posSd * posSd) / (n - 1 + SHRINK_K))
  }
  return { n, mean, sd, lowSample }
}

/** Projection ± 1.28 sd (≈10th–90th percentile), floored at 0. Null when volatility is unknown. */
export function projectionRange(proj: number, sd: number | null): { floor: number; ceiling: number } | null {
  if (sd === null) return null
  return { floor: Math.max(0, proj - Z80 * sd), ceiling: proj + Z80 * sd }
}
