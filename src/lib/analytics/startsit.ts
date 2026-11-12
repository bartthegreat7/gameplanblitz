import { mulberry32 } from './playoffs'

/*
 * Start/Sit simulation. Each player's outcome is drawn from his projection plus the published
 * distribution of past projection errors at his position and projection size (5th..95th
 * percentiles; tails are held at those percentiles, which slightly understates extremes).
 * Players are drawn independently: a stated simplification (teammates' outcomes are related).
 */

export const SIMS = 10_000
export const SEED = 20261112

/** Inverse-CDF sample from a 19-point quantile grid (5%..95%). */
export function sampleDist(dist: number[], u: number): number {
  const x = Math.min(dist.length - 1, Math.max(0, u * (dist.length + 1) - 1))
  const lo = Math.floor(x)
  const hi = Math.min(dist.length - 1, lo + 1)
  return dist[lo] + (dist[hi] - dist[lo]) * (x - lo)
}

export interface SimResult {
  /** share of simulations (0-1) in which each player scored the most; ties split */
  best: number[]
}

export function simulateStartSit(dists: number[][], sims = SIMS, seed = SEED): SimResult {
  const rng = mulberry32(seed)
  const best = new Array(dists.length).fill(0)
  if (dists.length === 0) return { best }
  for (let s = 0; s < sims; s++) {
    let top = -Infinity
    let leaders: number[] = []
    dists.forEach((d, i) => {
      const v = sampleDist(d, rng())
      if (v > top + 1e-9) {
        top = v
        leaders = [i]
      } else if (Math.abs(v - top) <= 1e-9) leaders.push(i)
    })
    for (const i of leaders) best[i] += 1 / leaders.length
  }
  return { best: best.map((b) => b / sims) }
}

export type Lean = 'floor' | 'ceiling' | 'median'

/**
 * Which part of the distribution matters this week, from your matchup win probability: a clear
 * favorite (60%+) wants a dependable floor, a clear underdog (40% or less) needs upside, and a
 * close matchup goes by the middle.
 */
export function leanFor(winPct: number | null): Lean {
  if (winPct === null) return 'median'
  if (winPct >= 60) return 'floor'
  if (winPct <= 40) return 'ceiling'
  return 'median'
}

/** index into the 19-point grid: 10th, 50th, 90th percentile */
export const IDX = { floor: 1, median: 9, ceiling: 17 } as const

export function pickFor(lean: Lean, dists: (number[] | null)[]): number | null {
  let best: number | null = null
  dists.forEach((d, i) => {
    if (!d) return
    if (best === null || d[IDX[lean]] > dists[best]![IDX[lean]]) best = i
  })
  return best
}
