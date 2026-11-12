import { f1 } from '../format'
import type { PlayerProjection } from './client'

/** Scoring ahead of (or behind) usage by more than this, in points per game, is called out. */
export const EFFICIENCY_GAP = 4

/** Was recent scoring backed by usage, or carried by touchdowns/efficiency? Evidence only. */
export function efficiencyNote(p: PlayerProjection): string | null {
  const g = p.recentGames
  if (g.length < 2 || p.features.recentXfp === null || p.features.recent === null) return null
  const gap = p.features.recent - p.features.recentXfp
  const tds = g.reduce((a, x) => a + x.tds, 0)
  if (gap >= EFFICIENCY_GAP)
    return `Recent scoring (${f1(p.features.recent)}) ran ${f1(gap)} pts ahead of what his usage usually produces (${f1(p.features.recentXfp)}), with ${tds} touchdown${tds === 1 ? '' : 's'} in ${g.length} games. Efficiency like that tends to regress.`
  if (gap <= -EFFICIENCY_GAP)
    return `His usage usually produces ${f1(p.features.recentXfp)} pts, ${f1(-gap)} more than he has scored lately (${f1(p.features.recent)}). The opportunity is there.`
  return null
}
