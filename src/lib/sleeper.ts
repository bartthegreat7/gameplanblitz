import { del, get, set } from 'idb-keyval'

/* Typed, read-only Sleeper client. Nothing here ever writes to a league. */

export const SLEEPER = 'https://api.sleeper.app/v1'
export const SLEEPER_PROJ = 'https://api.sleeper.app/projections/nfl'
export const SLEEPER_STATS = 'https://api.sleeper.app/stats/nfl'

export type StatLine = Record<string, number>

export interface SleeperState {
  season: string
  week: number
  display_week?: number
  season_type: string
}

export interface SleeperUser {
  user_id: string
  display_name: string
  avatar: string | null
  metadata?: { team_name?: string } | null
}

export interface SleeperLeagueSettings {
  playoff_week_start?: number
  playoff_teams?: number
  num_teams?: number
  waiver_budget?: number
  waiver_type?: number
}

export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  scoring_settings: Record<string, number>
  roster_positions: string[]
  settings: SleeperLeagueSettings
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  co_owners?: string[] | null
  players: string[] | null
  starters: string[] | null
  settings: {
    wins?: number
    losses?: number
    ties?: number
    fpts?: number
    fpts_decimal?: number
    fpts_against?: number
    fpts_against_decimal?: number
    waiver_budget_used?: number
  }
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
  starters: string[]
  players: string[]
  starters_points?: number[]
}

export interface SleeperPlayer {
  player_id: string
  first_name?: string
  last_name?: string
  full_name?: string
  position?: string | null
  fantasy_positions?: string[] | null
  team?: string | null
  injury_status?: string | null
  injury_body_part?: string | null
  injury_notes?: string | null
}

export type PlayerMap = Record<string, SleeperPlayer>

export class HttpError extends Error {
  status: number
  constructor(url: string, status: number) {
    super(`${url.split('?')[0]} → ${status}`)
    this.status = status
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new HttpError(url, r.status)
  return (await r.json()) as T
}

export const getNflState = () => getJson<SleeperState>(`${SLEEPER}/state/nfl`)

/** Sleeper returns `null` (HTTP 200) for an unknown username. */
export const getUser = (username: string) =>
  getJson<SleeperUser | null>(`${SLEEPER}/user/${encodeURIComponent(username)}`)

/** Leagues for the current season; falls back to the previous season if there are none yet. */
export async function getLeagues(userId: string, season: string) {
  let leagues = await getJson<SleeperLeague[] | null>(`${SLEEPER}/user/${userId}/leagues/nfl/${season}`)
  let used = season
  if (!leagues || leagues.length === 0) {
    const prev = String(Number(season) - 1)
    leagues = await getJson<SleeperLeague[] | null>(`${SLEEPER}/user/${userId}/leagues/nfl/${prev}`).catch(
      () => null,
    )
    if (leagues && leagues.length) used = prev
  }
  return { leagues: leagues ?? [], season: used }
}

export const getLeague = (id: string) => getJson<SleeperLeague>(`${SLEEPER}/league/${id}`)
export const getRosters = (id: string) => getJson<SleeperRoster[]>(`${SLEEPER}/league/${id}/rosters`)
export const getLeagueUsers = (id: string) => getJson<SleeperUser[]>(`${SLEEPER}/league/${id}/users`)
export const getMatchups = (id: string, week: number) =>
  getJson<SleeperMatchup[]>(`${SLEEPER}/league/${id}/matchups/${week}`)

/** One player's stat line for a week (projection or actual), with the matchup Sleeper attaches. */
export interface StatRow {
  player_id: string
  stats: StatLine
  team?: string | null
  opponent?: string | null
  week?: number
  /** data provider named by Sleeper on the row (source attribution) */
  company?: string | null
  last_modified?: number | string | null
}

interface RawRow {
  player_id?: string
  stats?: StatLine
  team?: string | null
  opponent?: string | null
  week?: number
  company?: string | null
  last_modified?: number | string | null
}

/** Projection/stat endpoints return an array of rows or an object keyed by player id. */
export function normalizeStatRows(raw: unknown): StatRow[] {
  const out: StatRow[] = []
  const push = (id: string | undefined, r: RawRow, fallbackStats: StatLine) => {
    if (!id) return
    out.push({
      player_id: id,
      stats: r.stats ?? fallbackStats,
      team: r.team,
      opponent: r.opponent,
      week: r.week,
      company: r.company,
      last_modified: r.last_modified,
    })
  }
  if (Array.isArray(raw)) {
    for (const r of raw as RawRow[]) if (r) push(r.player_id, r, r as unknown as StatLine)
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, RawRow>)) if (v) push(k, v, v as unknown as StatLine)
  }
  return out
}

export const statRowsToMap = (rows: StatRow[]) => new Map(rows.map((r) => [r.player_id, r.stats] as const))

/** Projections as player id → stat line. */
export const normalizeProjections = (raw: unknown) => statRowsToMap(normalizeStatRows(raw))

export async function getProjectionRows(season: string, week: number) {
  return normalizeStatRows(await getJson<unknown>(`${SLEEPER_PROJ}/${season}/${week}?season_type=regular`))
}

export async function getProjections(season: string, week: number) {
  return statRowsToMap(await getProjectionRows(season, week))
}

/** Actual stats for one completed week (immutable once final). */
export async function getWeeklyStatRows(season: string, week: number) {
  return normalizeStatRows(await getJson<unknown>(`${SLEEPER_STATS}/${season}/${week}?season_type=regular`))
}

export interface ScheduleGame {
  game_id: string
  week: number
  /** observed values: "pre_game" | "complete" (anything else is treated as started) */
  status: string
  date: string
  home: string
  away: string
}

export const getSchedule = (season: string) =>
  getJson<ScheduleGame[]>(`https://api.sleeper.app/schedule/nfl/regular/${season}`)

export const getSeasonStats = (season: string) =>
  getJson<Record<string, StatLine>>(`${SLEEPER_STATS}/${season}?season_type=regular`)

/* ---- players book (~5 MB): cached in IndexedDB with a 24h TTL ---- */

export const PLAYERS_TTL_MS = 24 * 60 * 60 * 1000
const PLAYERS_KEY = 'gb-players'

interface PlayersCache {
  ts: number
  data: PlayerMap
}

export async function loadPlayers(force = false): Promise<PlayerMap> {
  if (!force) {
    try {
      const hit = await get<PlayersCache>(PLAYERS_KEY)
      if (hit && Date.now() - hit.ts < PLAYERS_TTL_MS) return hit.data
    } catch {
      /* IndexedDB blocked: fall through to network */
    }
  }
  const data = await getJson<PlayerMap>(`${SLEEPER}/players/nfl`)
  try {
    await set(PLAYERS_KEY, { ts: Date.now(), data } satisfies PlayersCache)
  } catch {
    /* best effort */
  }
  return data
}

export async function clearPlayersCache() {
  try {
    await del(PLAYERS_KEY)
  } catch {
    /* ignore */
  }
}

/* ---- images ---- */
export const teamAvatarUrl = (avatar: string) => `https://sleepercdn.com/avatars/thumbs/${avatar}`
export const headshotUrl = (p: SleeperPlayer) =>
  p.position === 'DEF'
    ? `https://sleepercdn.com/images/team_logos/nfl/${String(p.team ?? p.player_id).toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/${p.player_id}.jpg`
