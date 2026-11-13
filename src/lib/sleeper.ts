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
  /** Sleeper's commissioner flag on /league/{id}/users */
  is_owner?: boolean | null
}

export interface SleeperLeagueSettings {
  playoff_week_start?: number
  playoff_teams?: number
  num_teams?: number
  waiver_budget?: number
  waiver_type?: number
  /** league type as Sleeper reports it: 0 redraft, 1 keeper, 2 dynasty (from Sleeper docs; unverified on a real league) */
  type?: number
  draft_rounds?: number
  max_keepers?: number
  /** number of divisions (0 or absent = none); per Sleeper docs, unverified on a real league */
  divisions?: number
  /** 1 = every team also plays the league median each week (per Sleeper docs; unverified on a real league) */
  league_average_match?: number
}

export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  scoring_settings: Record<string, number>
  roster_positions: string[]
  settings: SleeperLeagueSettings
  /** this season's draft (unverified on a real league) */
  draft_id?: string | null
  /** last season's league in a keeper/dynasty chain (unverified on a real league) */
  previous_league_id?: string | null
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  co_owners?: string[] | null
  players: string[] | null
  starters: string[] | null
  /** injured reserve: does not count against the roster limit and cannot start */
  reserve?: string[] | null
  taxi?: string[] | null
  /** designated keepers in keeper leagues (never suggested as drops) */
  keepers?: string[] | null
  settings: {
    wins?: number
    losses?: number
    ties?: number
    fpts?: number
    fpts_decimal?: number
    fpts_against?: number
    fpts_against_decimal?: number
    waiver_budget_used?: number
    /** waiver priority order (1 = first); per Sleeper docs */
    waiver_position?: number
  }
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
  starters: string[]
  players: string[]
  starters_points?: number[]
  /** live points per player id (fact, updated during games) */
  players_points?: Record<string, number>
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
  /** depth-chart rank within depth_chart_position (1 = starter). WR depth is split by alignment. */
  depth_chart_order?: number | null
  depth_chart_position?: string | null
  age?: number | null
  years_exp?: number | null
  /** Sleeper's popularity rank (lower = more searched); used to order search results */
  search_rank?: number | null
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

/** Season totals as player id -> stat line. Sleeper returns an array of rows (an object keyed by id is also accepted). */
export async function getSeasonStats(season: string): Promise<Record<string, StatLine>> {
  return Object.fromEntries(normalizeStatRows(await getJson<unknown>(`${SLEEPER_STATS}/${season}?season_type=regular`)).map((r) => [r.player_id, r.stats]))
}

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

/* ---- waiver-related feeds ---- */

export interface TrendingEntry {
  player_id: string
  /** adds (or drops) across Sleeper in the lookback window */
  count: number
}

/** Sleeper-wide add/drop counts, a popularity signal across all leagues (not specific to yours). */
export async function getTrending(type: 'add' | 'drop', lookbackHours = 24, limit = 50): Promise<TrendingEntry[]> {
  const rows = await getJson<unknown>(`${SLEEPER}/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`)
  if (!Array.isArray(rows)) return []
  return rows.filter(
    (r): r is TrendingEntry => !!r && typeof (r as TrendingEntry).player_id === 'string' && typeof (r as TrendingEntry).count === 'number',
  )
}

/** A league transaction (trade, waiver claim, free-agent add). Fields are optional: parsed defensively. */
export interface SleeperTransaction {
  type?: string
  status?: string
  /** player_id → roster_id that received him */
  adds?: Record<string, number> | null
  drops?: Record<string, number> | null
  settings?: { waiver_bid?: number } | null
  leg?: number
  created?: number
  /** rosters involved (trades list both sides) */
  roster_ids?: number[]
}

/** All transactions for one round (Sleeper uses the week as the round). Empty array if none. */
export async function getTransactions(leagueId: string, round: number): Promise<SleeperTransaction[]> {
  const rows = await getJson<unknown>(`${SLEEPER}/league/${leagueId}/transactions/${round}`)
  return Array.isArray(rows) ? (rows as SleeperTransaction[]) : []
}

/** A draft pick that changed hands. owner_id and roster_id are roster ids (original owner = roster_id). */
export interface SleeperTradedPick {
  season: string
  round: number
  roster_id: number
  previous_owner_id?: number
  owner_id: number
}

/** Picks whose owner differs from the original. Parsed defensively; unverified against real data. */
export async function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
  const rows = await getJson<unknown>(`${SLEEPER}/league/${leagueId}/traded_picks`)
  if (!Array.isArray(rows)) return []
  return rows
    .map((r) => r as Partial<SleeperTradedPick>)
    .filter((r): r is SleeperTradedPick => typeof r.round === "number" && typeof r.roster_id === "number" && typeof r.owner_id === "number" && r.season !== undefined)
    .map((r) => ({ ...r, season: String(r.season) }))
}

/** One pick in a Sleeper draft. Sleeper marks keepers with is_keeper. Parsed defensively. */
export interface SleeperDraftPick {
  round: number
  pick_no?: number
  player_id: string | null
  roster_id: number | null
  is_keeper?: boolean | null
}

/** One game in a Sleeper playoff bracket. */
export interface BracketGame {
  /** round */
  r: number
  /** match id */
  m: number
  t1: number | null
  t2: number | null
  /** winning / losing roster id */
  w: number | null
  l: number | null
  /** placement game: 1 = the final (Sleeper's convention) */
  p?: number | null
}

/** Playoff bracket games (Sleeper's winners_bracket). Parsed defensively; empty before the playoffs. */
export async function getWinnersBracket(leagueId: string): Promise<BracketGame[]> {
  const rows = await getJson<unknown>(`${SLEEPER}/league/${leagueId}/winners_bracket`)
  if (!Array.isArray(rows)) return []
  const num = (x: unknown) => (typeof x === 'number' ? x : null)
  return rows
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.r === 'number')
    .map((r) => ({ r: r.r as number, m: num(r.m) ?? 0, t1: num(r.t1), t2: num(r.t2), w: num(r.w), l: num(r.l), p: num(r.p) }))
}

export async function getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
  const rows = await getJson<unknown>(`${SLEEPER}/draft/${draftId}/picks`)
  if (!Array.isArray(rows)) return []
  return rows
    .map((r) => r as Partial<SleeperDraftPick>)
    .filter((r) => typeof r.round === "number")
    .map((r) => ({ round: r.round!, pick_no: r.pick_no, player_id: r.player_id ? String(r.player_id) : null, roster_id: typeof r.roster_id === "number" ? r.roster_id : null, is_keeper: r.is_keeper ?? null }))
}
