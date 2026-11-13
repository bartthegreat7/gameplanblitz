import type { EpisodeType, Length } from './podcast'

/* The Fantasy War Room's shows and when each one is due. Due dates hang off the NFL schedule's game
   dates for the week (Sleeper publishes dates, not kickoff times), so Thursday, Saturday and
   international games move the shows with them. Shared by the app and the AI Worker's scheduler. */

export interface Show {
  type: EpisodeType
  series: string
  /** when it comes out */
  when: string
  length: Length
  /** on by default once automatic episodes are enabled */
  defaultOn: boolean
}

export const SHOWS: Show[] = [
  { type: 'recap', series: 'The Fantasy War Room: Weekly Review', when: 'Tuesday', length: 'standard', defaultOn: true },
  { type: 'preview', series: 'The Game Plan', when: 'Thursday', length: 'short', defaultOn: true },
  { type: 'kickoff', series: 'Kickoff Briefing', when: 'Morning of the first weekend games', length: 'short', defaultOn: false },
]

/** Episodes are prepared from this local hour on the due day. */
export const DUE_HOUR = 6

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Due dates for a week from its game dates: the Weekly Review two days before the week's first
 * game (Tuesday before Thursday Night Football), The Game Plan on the first game day, the Kickoff
 * Briefing on the first game day after that (Saturday or Sunday; international morning games
 * included). Null when the week has no dated games.
 */
export function showDueDates(gameDates: string[]): Record<'recap' | 'preview' | 'kickoff', string> | null {
  const dates = [...new Set(gameDates.filter(Boolean))].sort()
  if (!dates.length) return null
  const first = dates[0]
  const weekend = dates.find((d) => d > first) ?? first
  return { recap: addDays(first, -2), preview: first, kickoff: weekend }
}

/**
 * Shows that should exist now and don't yet. A show is due from DUE_HOUR on its due date until the
 * week's last game date; the Kickoff Briefing only on its own day (a late briefing is useless).
 */
export function dueShows(o: {
  gameDates: string[]
  /** local date YYYY-MM-DD and hour */
  today: string
  hour: number
  enabled: EpisodeType[]
  existing: Set<EpisodeType>
}): EpisodeType[] {
  const due = showDueDates(o.gameDates)
  if (!due) return []
  const last = [...o.gameDates].filter(Boolean).sort().pop()!
  const reached = (d: string) => o.today > d || (o.today === d && o.hour >= DUE_HOUR)
  return SHOWS.map((s) => s.type).filter((t) => {
    if (!o.enabled.includes(t) || o.existing.has(t)) return false
    const d = due[t as keyof typeof due]
    if (!d || !reached(d) || o.today > last) return false
    if (t === 'kickoff' && o.today !== d) return false
    return true
  })
}

/** Idempotency key: one episode per league, season, week and show. */
export const episodeKey = (leagueId: string, season: string, week: number, type: EpisodeType) => `${leagueId}:${season}:${week}:${type}`
