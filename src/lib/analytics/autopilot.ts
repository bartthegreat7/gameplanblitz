import type { GmAction } from './gm'

/* Fantasy Autopilot: recommendation-only. It re-reads the GM brief (The Edge) and keeps a history of
   what it recommended, so you can see what changed. It never changes anything in Sleeper. */

export interface Focus {
  day: number
  label: string
  focus: string
  to: string
}

/** The weekly rhythm (0 = Sunday). Each day shows the focus that applies from it until the next. */
export const CADENCE: Focus[] = [
  { day: 0, label: 'Sunday', focus: 'Kickoff readiness: Out and Questionable starters, byes, weather', to: '/gameday' },
  { day: 1, label: 'Monday', focus: 'Matchup review: where your week stands', to: '/scores' },
  { day: 2, label: 'Tuesday', focus: 'Waiver opportunities and last week in review', to: '/waivers' },
  { day: 4, label: 'Thursday', focus: 'Matchup and injury analysis for the week ahead', to: '/scouting' },
  { day: 6, label: 'Saturday', focus: 'Injury designations and lineup concerns before kickoff', to: '/injuries' },
]

export function focusFor(day: number): Focus {
  return [...CADENCE].reverse().find((c) => c.day <= day) ?? CADENCE[CADENCE.length - 1]
}

export interface RecEntry {
  /** `${week}:${action id}` */
  key: string
  week: number
  actionId: string
  title: string
  impact: string
  priority: 1 | 2 | 3
  to: string
  firstSeen: number
  lastSeen: number
}

export const MAX_HISTORY = 120

/** Adds this week's recommendations to the history (each once; lastSeen refreshed). Newest first. */
export function mergeHistory(history: RecEntry[], week: number, actions: GmAction[], now: number): RecEntry[] {
  const by = new Map(history.map((h) => [h.key, h]))
  for (const a of actions) {
    const key = `${week}:${a.id}`
    const prev = by.get(key)
    by.set(key, prev ? { ...prev, title: a.title, impact: a.impact, priority: a.priority, lastSeen: now } : { key, week, actionId: a.id, title: a.title, impact: a.impact, priority: a.priority, to: a.to, firstSeen: now, lastSeen: now })
  }
  return [...by.values()].sort((a, b) => b.firstSeen - a.firstSeen || a.key.localeCompare(b.key)).slice(0, MAX_HISTORY)
}

export type RecStatus = 'active' | 'cleared' | 'earlier-week'

/** active = still recommended now; cleared = no longer recommended this week (the data changed); earlier-week = a past week. */
export function recStatus(e: RecEntry, week: number, currentIds: Set<string>): RecStatus {
  if (e.week !== week) return 'earlier-week'
  return currentIds.has(e.actionId) ? 'active' : 'cleared'
}
