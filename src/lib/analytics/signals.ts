import { MIN_GAMES } from '../evidence'
import { OUT_INJ } from '../lineup'
import type { PlayerMap, TrendingEntry } from '../sleeper'
import type { GameLog } from './history'

/* Opportunity signals: sourced from Sleeper stats, depth charts and trending data. */

export interface FormTrend {
  /** average points over the last 3 games played (league scoring) */
  recent: number
  season: number
  delta: number
  label: 'rising' | 'steady' | 'falling'
  games: number
}

/** A swing of this many points per game, last 3 vs season, counts as a trend. */
export const FORM_THRESHOLD = 2

export function formTrend(games: GameLog[] | undefined): FormTrend | null {
  const pts = (games ?? []).map((g) => g.pts)
  if (pts.length < MIN_GAMES) return null
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const recent = mean(pts.slice(-3))
  const season = mean(pts)
  const delta = recent - season
  return {
    recent,
    season,
    delta,
    label: delta >= FORM_THRESHOLD ? 'rising' : delta <= -FORM_THRESHOLD ? 'falling' : 'steady',
    games: pts.length,
  }
}

export interface DepthInfo {
  /** 1 = starter */
  order: number
  position: string
  /** teammates listed ahead at the same depth-chart position */
  ahead: { id: string; name: string; injury: string }[]
  /** at least one player ahead of him is Out/IR: he is next in line */
  nextManUp: boolean
}

/** Depth charts are only reliable for these positions: WR depth is split by alignment (LWR/RWR/SWR). */
const DEPTH_POSITIONS = new Set(['QB', 'RB', 'TE'])

export type DepthIndex = Map<string, { id: string; order: number }[]>

export function buildDepthIndex(players: PlayerMap): DepthIndex {
  const idx: DepthIndex = new Map()
  for (const p of Object.values(players)) {
    if (!p.team || !p.position || !DEPTH_POSITIONS.has(p.position)) continue
    if (p.depth_chart_position !== p.position || typeof p.depth_chart_order !== 'number') continue
    const key = `${p.team}|${p.position}`
    const list = idx.get(key) ?? []
    list.push({ id: p.player_id, order: p.depth_chart_order })
    idx.set(key, list)
  }
  for (const list of idx.values()) list.sort((a, b) => a.order - b.order)
  return idx
}

export function depthInfo(
  players: PlayerMap,
  index: DepthIndex,
  id: string,
  nameOf: (id: string) => string,
): DepthInfo | null {
  const p = players[id]
  if (!p?.team || !p.position || !DEPTH_POSITIONS.has(p.position)) return null
  if (p.depth_chart_position !== p.position || typeof p.depth_chart_order !== 'number') return null
  const ahead = (index.get(`${p.team}|${p.position}`) ?? [])
    .filter((x) => x.order < (p.depth_chart_order as number) && x.id !== id)
    .map((x) => ({ id: x.id, name: nameOf(x.id), injury: players[x.id]?.injury_status ?? '' }))
  return {
    order: p.depth_chart_order,
    position: p.position,
    ahead,
    nextManUp: ahead.some((a) => OUT_INJ.has(a.injury)),
  }
}

/** Rank (1 = most added) and count among Sleeper-wide adds, or null if not trending. */
export function trendingInfo(list: TrendingEntry[] | null, id: string): { rank: number; count: number } | null {
  if (!list) return null
  const sorted = [...list].sort((a, b) => b.count - a.count)
  const i = sorted.findIndex((t) => t.player_id === id)
  return i >= 0 ? { rank: i + 1, count: sorted[i].count } : null
}
