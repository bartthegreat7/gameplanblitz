import type { EpisodeType, Length } from './podcast'

/* The Fantasy War Room's weekly shows and when each one is due. Due dates hang off the NFL
   schedule's game dates (Sleeper publishes dates, not kickoff times), so Thursday, Saturday,
   holiday and international games move the shows with them. Shared by the app and the AI
   Worker's scheduler. */

export interface Show {
  type: EpisodeType
  series: string
  /** the usual day, in words */
  day: string
  /** when it comes out, precisely */
  when: string
  length: Length
  /** on by default once automatic episodes are enabled */
  defaultOn: boolean
}

export const SHOWS: Show[] = [
  {
    type: 'recap',
    series: 'Postgame Report',
    day: 'Monday',
    when: 'three days before the week’s first game, never before the previous week’s last game is over',
    length: 'standard',
    defaultOn: true,
  },
  { type: 'moves', series: 'Waiver War Room', day: 'Tuesday', when: 'two days before the week’s first game', length: 'standard', defaultOn: true },
  { type: 'preview', series: 'Game Plan Preview', day: 'Thursday', when: 'on the week’s first game day', length: 'short', defaultOn: true },
  {
    type: 'kickoff',
    series: 'Kickoff Briefing',
    day: 'Sunday',
    when: 'the morning of the first weekend games (Saturday when there are Saturday games)',
    length: 'short',
    defaultOn: false,
  },
]

/** Episodes are prepared from this local hour on the due day (users can choose 4-12). */
export const DUE_HOUR = 6
export const HOUR_CHOICES = [4, 5, 6, 7, 8, 9, 10, 11, 12]

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const later = (a: string, b: string) => (a > b ? a : b)

/**
 * Due dates for a week from its game dates (and the previous week's, when known):
 *   Postgame Report    three days before the first game (Monday before Thursday Night Football), but
 *                      never before the day after the previous week's last game
 *   Waiver War Room    two days before the first game (Tuesday), never before the Postgame Report
 *   Game Plan Preview  the first game day
 *   Kickoff Briefing   the first game day after that (Saturday or Sunday; international morning games
 *                      included), or the first game day for a single-day week
 * Null when the week has no dated games.
 */
export function showDueDates(gameDates: string[], prevGameDates: string[] = []): Record<EpisodeType, string> | null {
  const dates = [...new Set(gameDates.filter(Boolean))].sort()
  if (!dates.length) return null
  const first = dates[0]
  const weekend = dates.find((d) => d > first) ?? first
  const prevLast = [...prevGameDates].filter(Boolean).sort().pop()
  const recap = prevLast ? later(addDays(first, -3), addDays(prevLast, 1)) : addDays(first, -3)
  const moves = later(addDays(first, -2), recap)
  return { recap, moves, preview: first, kickoff: weekend }
}

/**
 * Shows that should exist now and don't yet. A show is due from the chosen hour on its due date
 * until the week's last game date; the Kickoff Briefing only on its own day (a late briefing is useless).
 */
export function dueShows(o: {
  gameDates: string[]
  prevGameDates?: string[]
  /** local date YYYY-MM-DD and hour */
  today: string
  hour: number
  enabled: EpisodeType[]
  existing: Set<EpisodeType>
  /** local hour from which a due show is prepared (default DUE_HOUR) */
  dueHour?: number
}): EpisodeType[] {
  const due = showDueDates(o.gameDates, o.prevGameDates)
  if (!due) return []
  const from = o.dueHour ?? DUE_HOUR
  const last = [...o.gameDates].filter(Boolean).sort().pop()!
  const reached = (d: string) => o.today > d || (o.today === d && o.hour >= from)
  return SHOWS.map((s) => s.type).filter((t) => {
    if (!o.enabled.includes(t) || o.existing.has(t)) return false
    const d = due[t]
    if (!reached(d) || o.today > last) return false
    if (t === 'kickoff' && o.today !== d) return false
    return true
  })
}

/** Game dates of one schedule week. */
export const datesOfWeek = (schedule: { week: number; date?: string | null }[], week: number) =>
  schedule.filter((g) => g.week === week).map((g) => g.date ?? '').filter(Boolean)

/** Idempotency key: one episode per league, season, week and show. */
export const episodeKey = (leagueId: string, season: string, week: number, type: EpisodeType) => `${leagueId}:${season}:${week}:${type}`
