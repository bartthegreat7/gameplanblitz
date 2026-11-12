import { get, set } from 'idb-keyval'

import { getWeeklyStatRows, type StatRow } from './sleeper'

/** Completed weeks are immutable apart from rare stat corrections, so cache them for a week. */
export const WEEKLY_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface Cached {
  ts: number
  rows: StatRow[]
}

/** One completed week of actual stats, from IndexedDB when fresh, else Sleeper (best-effort cache). */
export async function loadWeeklyRows(season: string, week: number): Promise<StatRow[]> {
  const key = `gb-weekly-${season}-${week}`
  try {
    const hit = await get<Cached>(key)
    if (hit && Date.now() - hit.ts < WEEKLY_TTL_MS) return hit.rows
  } catch {
    /* IndexedDB blocked: fall through to network */
  }
  const rows = (await getWeeklyStatRows(season, week)).map(
    ({ player_id, stats, team, opponent, week: w }): StatRow => ({ player_id, stats, team, opponent, week: w }),
  )
  try {
    await set(key, { ts: Date.now(), rows } satisfies Cached)
  } catch {
    /* best effort */
  }
  return rows
}
