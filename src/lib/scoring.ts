import type { StatLine } from './sleeper'

export type Scoring = Record<string, number>

/**
 * Fantasy points for a stat line in the league's scoring: Σ stats[k] * scoring[k].
 * Works for projections and actual stats. If the league scoring yields 0, falls back to
 * Sleeper's pre-packaged pts_ppr / pts_half_ppr / pts_std.
 */
export function pointsFor(stats: StatLine | null | undefined, scoring: Scoring): number {
  if (!stats) return 0
  let total = 0
  for (const k in stats) {
    const w = scoring[k]
    if (typeof w === 'number' && typeof stats[k] === 'number') total += w * stats[k]
  }
  if (total === 0) {
    const rec = scoring.rec ?? 0
    if (typeof stats.pts_ppr === 'number' && rec >= 1) return stats.pts_ppr
    if (typeof stats.pts_half_ppr === 'number' && rec > 0) return stats.pts_half_ppr
    if (typeof stats.pts_std === 'number') return stats.pts_std
  }
  return total
}

/** Season points per game in league scoring, or null if the player has no games. */
export function seasonPPG(stats: StatLine | null | undefined, scoring: Scoring): number | null {
  if (!stats) return null
  const gp = stats.gp || stats.gms_active || 0
  if (!gp) return null
  return pointsFor(stats, scoring) / gp
}

/** Blend of season PPG and this week's projection (falls back to the projection alone). */
export function playerValue(ppg: number | null, projection: number): number {
  return ppg != null ? 0.5 * ppg + 0.5 * projection : projection
}

/** Logistic win probability from the projected-point margin. */
export function winProbability(myProj: number, oppProj: number): number {
  return 1 / (1 + Math.exp(-(myProj - oppProj) / 28))
}
