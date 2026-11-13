import type { BracketGame, SleeperMatchup, SleeperRoster, SleeperUser } from '../sleeper'
import { outcome, pairGames, recordsThrough, standingsOrder, type WeekGames } from './league'

/*
 * League Headquarters: seasons of the same league, linked by Sleeper's previous_league_id. Managers
 * are followed by their Sleeper user id (roster ids can change between seasons). Everything comes
 * from Sleeper's results; nothing is filled in.
 */

export type { BracketGame }

export interface SeasonData {
  season: string
  leagueId: string
  name: string
  rosters: SleeperRoster[]
  users: SleeperUser[]
  /** completed regular-season weeks */
  weeks: WeekGames[]
  bracket: BracketGame[] | null
  /** the league also plays the weekly median (Sleeper's league_average_match) */
  medianGame?: boolean
}

/** Regular-season weeks with scores, paired into games. */
export function regularWeeks(matchupsByWeek: { week: number; matchups: SleeperMatchup[] }[], playoffStart: number): WeekGames[] {
  return matchupsByWeek
    .filter((w) => w.week < playoffStart && w.matchups.some((m) => (m.points ?? 0) > 0))
    .map((w) => ({ week: w.week, games: pairGames(w.matchups) }))
}

export const ownerOf = (s: SeasonData, rosterId: number): string | null => s.rosters.find((r) => r.roster_id === rosterId)?.owner_id ?? null

/** A roster's team name in that season (Sleeper team name, else the manager's name). */
export function teamNameIn(s: SeasonData, rosterId: number): string {
  const u = s.users.find((x) => x.user_id === ownerOf(s, rosterId))
  return u?.metadata?.team_name || u?.display_name || `Team ${rosterId}`
}

/** The roster a manager had in that season. */
export const rosterOf = (s: SeasonData, userId: string | null): number | null =>
  userId ? (s.rosters.find((r) => r.owner_id === userId)?.roster_id ?? null) : null

/** The champion's roster id: the winner of the bracket game marked p = 1, else of the last round's single game. */
export function championRoster(bracket: BracketGame[] | null): number | null {
  if (!bracket?.length) return null
  const final = bracket.find((g) => g.p === 1) ?? (() => {
    const last = Math.max(...bracket.map((g) => g.r))
    const games = bracket.filter((g) => g.r === last)
    return games.length === 1 ? games[0] : undefined
  })()
  return final?.w ?? null
}

export interface SeasonRow {
  userId: string
  rosterId: number
  rank: number
  w: number
  l: number
  t: number
  pf: number
  pa: number
  champion: boolean
}

/** Final regular-season standings rebuilt from the scores, plus the champion. */
export function seasonStandings(s: SeasonData): SeasonRow[] {
  const last = Math.max(0, ...s.weeks.map((w) => w.week))
  const rec = recordsThrough(s.weeks, last)
  const champ = championRoster(s.bracket)
  return standingsOrder(rec).flatMap((rosterId, i) => {
    const userId = ownerOf(s, rosterId)
    const r = rec.get(rosterId)!
    return userId ? [{ userId, rosterId, rank: i + 1, ...r, champion: rosterId === champ }] : []
  })
}

export interface ManagerStats {
  userId: string
  seasons: number
  w: number
  l: number
  t: number
  pf: number
  games: number
  titles: number
  bestFinish: number
}

export function managerStats(seasons: SeasonData[]): ManagerStats[] {
  const by = new Map<string, ManagerStats>()
  for (const s of seasons)
    for (const r of seasonStandings(s)) {
      const e = by.get(r.userId) ?? { userId: r.userId, seasons: 0, w: 0, l: 0, t: 0, pf: 0, games: 0, titles: 0, bestFinish: Infinity }
      e.seasons++
      e.w += r.w
      e.l += r.l
      e.t += r.t
      e.pf += r.pf
      e.games += r.w + r.l + r.t
      e.titles += r.champion ? 1 : 0
      e.bestFinish = Math.min(e.bestFinish, r.rank)
      by.set(r.userId, e)
    }
  return [...by.values()].sort((a, b) => b.titles - a.titles || (b.w + b.t / 2) / Math.max(1, b.games) - (a.w + a.t / 2) / Math.max(1, a.games))
}

export interface LeagueRecord {
  title: string
  userId: string
  otherId: string | null
  season: string
  week: number | null
  value: number
}

/** All-time records across the loaded seasons (regular season). */
export function leagueRecords(seasons: SeasonData[]): LeagueRecord[] {
  let high: LeagueRecord | null = null
  let low: LeagueRecord | null = null
  let blow: LeagueRecord | null = null
  let close: LeagueRecord | null = null
  let bestSeason: LeagueRecord | null = null
  for (const s of seasons) {
    for (const wk of s.weeks)
      for (const g of wk.games) {
        for (const side of g.b ? [g.a, g.b] : [g.a]) {
          const u = ownerOf(s, side.rosterId)
          if (!u || side.points <= 0) continue
          if (!high || side.points > high.value) high = { title: 'Highest weekly score', userId: u, otherId: null, season: s.season, week: wk.week, value: side.points }
          if (!low || side.points < low.value) low = { title: 'Lowest weekly score', userId: u, otherId: null, season: s.season, week: wk.week, value: side.points }
        }
        const o = outcome(g)
        const wu = o && ownerOf(s, o.winner.rosterId)
        const lu = o && ownerOf(s, o.loser.rosterId)
        if (!o || !wu || !lu) continue
        if (!blow || o.margin > blow.value) blow = { title: 'Biggest blowout', userId: wu, otherId: lu, season: s.season, week: wk.week, value: o.margin }
        if (!close || o.margin < close.value) close = { title: 'Closest finish', userId: wu, otherId: lu, season: s.season, week: wk.week, value: o.margin }
      }
    for (const r of seasonStandings(s))
      if (!bestSeason || r.pf > bestSeason.value) bestSeason = { title: 'Most points in a season', userId: r.userId, otherId: null, season: s.season, week: null, value: r.pf }
  }
  return [high, low, blow, close, bestSeason].filter((x): x is LeagueRecord => !!x)
}

export interface Rivalry {
  a: string
  b: string
  aWins: number
  bWins: number
  ties: number
  games: number
  /** total points margin, a minus b */
  margin: number
  last: { season: string; week: number; winner: string | null }
}

/** Head-to-head records between every pair of managers who have met at least `min` times. */
export function rivalries(seasons: SeasonData[], min = 2): Rivalry[] {
  const by = new Map<string, Rivalry>()
  for (const s of [...seasons].sort((x, y) => x.season.localeCompare(y.season)))
    for (const wk of s.weeks)
      for (const g of wk.games) {
        if (!g.b) continue
        const ua = ownerOf(s, g.a.rosterId)
        const ub = ownerOf(s, g.b.rosterId)
        if (!ua || !ub) continue
        const [a, b, pa, pb] = ua < ub ? [ua, ub, g.a.points, g.b.points] : [ub, ua, g.b.points, g.a.points]
        const k = `${a}|${b}`
        const e = by.get(k) ?? { a, b, aWins: 0, bWins: 0, ties: 0, games: 0, margin: 0, last: { season: s.season, week: wk.week, winner: null } }
        e.games++
        e.margin += pa - pb
        if (pa > pb) e.aWins++
        else if (pb > pa) e.bWins++
        else e.ties++
        e.last = { season: s.season, week: wk.week, winner: pa > pb ? a : pb > pa ? b : null }
        by.set(k, e)
      }
  return [...by.values()]
    .filter((r) => r.games >= min)
    .sort((x, y) => y.games - x.games || Math.abs(x.aWins - x.bWins) - Math.abs(y.aWins - y.bWins))
}

/** How often each manager won each weekly award this season (awards computed elsewhere). */
export function tallyAwards(weekly: { title: string; rosterId: number }[][]): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>()
  for (const week of weekly)
    for (const a of week) {
      const m = out.get(a.title) ?? new Map<number, number>()
      m.set(a.rosterId, (m.get(a.rosterId) ?? 0) + 1)
      out.set(a.title, m)
    }
  return out
}
