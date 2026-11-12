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

/** Projections come back either as an array of {player_id, stats} or an object keyed by id. */
export function normalizeProjections(raw: unknown): Map<string, StatLine> {
  const map = new Map<string, StatLine>()
  if (!raw) return map
  if (Array.isArray(raw)) {
    for (const r of raw as Array<{ player_id?: string; stats?: StatLine }>) {
      if (r && r.player_id) map.set(r.player_id, r.stats ?? (r as unknown as StatLine))
    }
  } else if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, { stats?: StatLine }>)) {
      map.set(k, v?.stats ?? (v as unknown as StatLine))
    }
  }
  return map
}

export async function getProjections(season: string, week: number) {
  return normalizeProjections(await getJson<unknown>(`${SLEEPER_PROJ}/${season}/${week}?season_type=regular`))
}

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
