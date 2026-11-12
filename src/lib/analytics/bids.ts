import { clamp } from '../format'
import type { SleeperTransaction } from '../sleeper'

/* FAAB guidance. Calibrated on what actually won in the user's league when that history is
   available; otherwise a clearly labeled rule of thumb. Never presented as a prediction. */

export interface BidStats {
  n: number
  median: number
  p75: number
  max: number
}

export interface BidHistory {
  all: BidStats | null
  byPos: Map<string, BidStats>
}

/** Fewer winning bids than this and the history is not used. */
export const MIN_BID_SAMPLE = 3
/** Below this weekly gain (points per week) an add is not worth a real bid. */
export const MARGINAL_GAIN = 1.5
/** At or above this weekly gain an add is a priority: bid at the top of what has been winning. */
export const PRIORITY_GAIN = 4
/** Priority adds scale from the 75th percentile (at PRIORITY_GAIN) up to the max, reached this many points a week higher. */
export const PRIORITY_SPAN = 6
/** Rule-of-thumb: fraction of remaining budget = gain/20, kept within [2%, 25%]. */
export const THUMB = { divisor: 20, min: 0.02, max: 0.25 }

/** Linear-interpolated percentile of an ascending array (p in 0..1). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = (sorted.length - 1) * clamp(p, 0, 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function bidStats(values: number[]): BidStats | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  return { n: s.length, median: percentile(s, 0.5), p75: percentile(s, 0.75), max: s[s.length - 1] }
}

/** Winning bids from completed waiver claims, overall and by the added player's position. */
export function bidHistory(txs: SleeperTransaction[], posOf: (playerId: string) => string): BidHistory {
  const all: number[] = []
  const byPos = new Map<string, number[]>()
  for (const t of txs) {
    if (t.type !== 'waiver' || t.status !== 'complete') continue
    const bid = t.settings?.waiver_bid
    if (typeof bid !== 'number' || !Number.isFinite(bid) || bid < 0) continue
    for (const id of Object.keys(t.adds ?? {})) {
      all.push(bid)
      const pos = posOf(id)
      if (pos) byPos.set(pos, [...(byPos.get(pos) ?? []), bid])
    }
  }
  const stats = new Map<string, BidStats>()
  for (const [pos, v] of byPos) {
    const s = bidStats(v)
    if (s) stats.set(pos, s)
  }
  return { all: bidStats(all), byPos: stats }
}

export interface BidSuggestion {
  suggested: number
  low: number
  high: number
  basis: 'league-history' | 'rule-of-thumb' | 'marginal'
  /** winning bids behind the suggestion (0 when not history-based) */
  sample: number
  explanation: string
}

const dollars = (n: number) => `$${Math.round(n)}`

/**
 * Suggested FAAB bid for an add worth `gainPerWeek` projected points per week. Returns null when
 * there is no budget left. All bids are whole dollars, capped at the remaining budget.
 */
export function suggestBid(opts: {
  left: number
  gainPerWeek: number
  pos: string
  history: BidHistory | null
}): BidSuggestion | null {
  const { gainPerWeek, pos } = opts
  // bids are whole dollars: a budget under $1 leaves nothing to bid
  const left = Math.floor(opts.left)
  if (left <= 0) return null
  const cap = (n: number) => clamp(Math.round(n), 0, left)

  if (gainPerWeek < MARGINAL_GAIN) {
    const one = 1
    return {
      suggested: one,
      low: 0,
      high: one,
      basis: 'marginal',
      sample: 0,
      explanation: `A small upgrade (under ${MARGINAL_GAIN} points a week): not worth spending real budget. A minimum bid is enough.`,
    }
  }

  const h = opts.history
  const posStats = h?.byPos.get(pos)
  const usePos = !!posStats && posStats.n >= MIN_BID_SAMPLE
  const stats = usePos ? posStats : h?.all && h.all.n >= MIN_BID_SAMPLE ? h.all : null
  if (stats) {
    const priority = gainPerWeek >= PRIORITY_GAIN
    // Band: median..p75 for a solid add, p75..max for a priority add. Where in the band depends on how
    // big the upgrade is, so a 14-point-a-week add bids higher than a 4-point one.
    const lo = priority ? stats.p75 : stats.median
    const hi = priority ? stats.max : stats.p75
    const t = priority
      ? clamp((gainPerWeek - PRIORITY_GAIN) / PRIORITY_SPAN, 0, 1)
      : clamp((gainPerWeek - MARGINAL_GAIN) / (PRIORITY_GAIN - MARGINAL_GAIN), 0, 1)
    const low = cap(lo)
    const high = Math.max(low, cap(hi))
    const suggested = clamp(cap(lo + t * (hi - lo)), low, high)
    return {
      suggested,
      low,
      high,
      basis: 'league-history',
      sample: stats.n,
      explanation: `${stats.n} winning bids for ${usePos ? `${pos}s` : 'players'} in your league: median ${dollars(stats.median)}, 75th percentile ${dollars(stats.p75)}, max ${dollars(stats.max)}. ${
        priority ? 'A priority add (4+ points a week): the band runs from the 75th percentile to the max' : 'A solid add: the band runs from the median to the 75th percentile'
      }, and the suggestion sits higher in it the bigger the upgrade.`,
    }
  }

  const frac = clamp(gainPerWeek / THUMB.divisor, THUMB.min, THUMB.max)
  const s = Math.max(1, cap(left * frac))
  return {
    suggested: s,
    low: cap(s * 0.5),
    high: Math.max(s, cap(s * 1.5)),
    basis: 'rule-of-thumb',
    sample: 0,
    explanation: `No usable bid history in your league, so this is a rule of thumb: ${Math.round(frac * 100)}% of your remaining ${dollars(left)} (the weekly gain ÷ ${THUMB.divisor}, kept between ${THUMB.min * 100}% and ${THUMB.max * 100}%). Not based on what others will bid.`,
  }
}
