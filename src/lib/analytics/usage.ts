import { MIN_GAMES } from '../evidence'
import type { GameLog } from './history'

export interface UsageTrend {
  /** average offensive snap share over the last 3 games with snap data */
  recent: number
  /** average over all games with snap data */
  season: number
  /** recent − season, in share points (0.08 = 8 percentage points) */
  delta: number
  label: 'rising' | 'steady' | 'falling'
  games: number
}

export const USAGE_THRESHOLD = 0.08
const RECENT = 3

/** Snap-share trend; null with fewer than MIN_GAMES games of snap data (e.g. K, DEF, new players). */
export function usageTrend(games: GameLog[] | undefined): UsageTrend | null {
  const shares = (games ?? []).filter((g) => g.snapShare !== null).map((g) => g.snapShare as number)
  if (shares.length < MIN_GAMES) return null
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const recent = mean(shares.slice(-RECENT))
  const season = mean(shares)
  const delta = recent - season
  return {
    recent,
    season,
    delta,
    label: delta >= USAGE_THRESHOLD ? 'rising' : delta <= -USAGE_THRESHOLD ? 'falling' : 'steady',
    games: shares.length,
  }
}
