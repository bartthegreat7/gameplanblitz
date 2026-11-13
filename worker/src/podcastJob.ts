import { buildEpisode } from '../../src/lib/ai/autoEpisode'
import type { EpisodeType, Format, Length, Tone } from '../../src/lib/ai/podcast'
import { datesOfWeek, DUE_HOUR, dueShows, episodeKey, HOUR_CHOICES } from '../../src/lib/ai/series'
import { serverFacts, type SleeperBundle } from '../../src/lib/ai/serverEpisode'
import type { Episode } from '../../src/lib/ai/storage'
import {
  normalizeProjections,
  type PlayerMap,
  type ScheduleGame,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperRoster,
  type SleeperUser,
} from '../../src/lib/sleeper'
import { BadRequest, type KV } from './logic'

/*
 * The Fantasy War Room's scheduled job (Cloudflare Cron Trigger, hourly). For each opted-in
 * subscription it works out which show is due from the NFL schedule's dates in the subscriber's time
 * zone, builds the fact sheet from Sleeper's public API, writes the episode with the built-in,
 * evidence-citing writer (no AI cost) and stores it privately in KV for the app to fetch.
 *   - idempotent: one job record per league, user, season, week and show; done jobs never rerun
 *   - duplicate guard: a running job is skipped for 15 minutes (KV is eventually consistent, so this
 *     is best effort; the job key still prevents a second stored episode)
 *   - retries: a failed job is retried on later runs, up to 3 attempts
 *   - outside the regular season nothing runs
 */

export interface JobKV extends KV {
  delete(key: string): Promise<void>
  list(opts: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>
}

export interface Subscription {
  leagueId: string
  userId: string
  username: string
  shows: EpisodeType[]
  length: Length
  /** local hour from which shows are prepared (4-12) */
  hour?: number
  format: Format
  tone: Tone
  /** minutes to add to UTC for the subscriber's local time */
  tzOffsetMinutes: number
  createdAt: number
}

export interface JobRecord {
  state: 'running' | 'done' | 'failed'
  attempts: number
  at: number
  episodeId?: string
  error?: string
}

export interface JobResult {
  key: string
  status: 'generated' | 'skipped-done' | 'skipped-running' | 'gave-up' | 'failed'
  error?: string
}

export const MAX_ATTEMPTS = 3
export const RUNNING_TTL_MS = 15 * 60_000
export const EPISODE_TTL_S = 120 * 86_400
export const MAX_INDEX = 60

export const subKey = (leagueId: string, userId: string) => `sub:${leagueId}:${userId}`
export const jobKey = (s: Pick<Subscription, 'leagueId' | 'userId'>, season: string, week: number, type: EpisodeType) =>
  `job:${s.userId}:${episodeKey(s.leagueId, season, week, type)}`
export const indexKey = (leagueId: string, userId: string) => `eps:${leagueId}:${userId}`
export const episodeStoreKey = (leagueId: string, userId: string, id: string) => `ep:${leagueId}:${userId}:${id}`

const SHOW_TYPES: EpisodeType[] = ['recap', 'moves', 'preview', 'kickoff']

/** Validates a subscription request (the Worker resolves the Sleeper user and league membership). */
export function validateSubscription(x: unknown): Omit<Subscription, 'userId' | 'createdAt'> {
  if (!x || typeof x !== 'object') throw new BadRequest('body must be an object')
  const o = x as Record<string, unknown>
  const str = (k: string, max: number) => {
    const v = o[k]
    if (typeof v !== 'string' || !v.trim() || v.length > max) throw new BadRequest(`${k} is missing or too long`)
    return v.trim()
  }
  const shows = Array.isArray(o.shows) ? o.shows.filter((s): s is EpisodeType => SHOW_TYPES.includes(s as EpisodeType)) : []
  if (!shows.length) throw new BadRequest('pick at least one show')
  const pick = <T extends string>(k: string, allowed: T[], d: T) => (allowed.includes(o[k] as T) ? (o[k] as T) : d)
  const tz = Number(o.tzOffsetMinutes)
  if (!Number.isFinite(tz) || Math.abs(tz) > 14 * 60) throw new BadRequest('tzOffsetMinutes is invalid')
  return {
    username: str('username', 60),
    leagueId: str('leagueId', 40),
    shows: [...new Set(shows)],
    length: pick('length', ['short', 'standard', 'extended'], 'standard'),
    hour: typeof o.hour === 'number' && HOUR_CHOICES.includes(o.hour) ? o.hour : DUE_HOUR,
    format: pick('format', ['solo', 'debate'], 'debate'),
    tone: pick('tone', ['straight', 'humor'], 'straight'),
    tzOffsetMinutes: Math.round(tz),
  }
}

const SLEEPER = 'https://api.sleeper.app'

async function get<T>(f: typeof fetch, url: string): Promise<T> {
  const r = await f(url, { headers: { 'user-agent': 'GamePlanBitz podcast job' } })
  if (!r.ok) throw new Error(`Sleeper ${r.status} for ${new URL(url).pathname}`)
  return (await r.json()) as T
}

interface NflState {
  season: string
  week: number
  season_type: string
}

/** Everything the fact sheet needs, from Sleeper's public API. */
export async function fetchBundle(f: typeof fetch, leagueId: string, state: NflState, schedule: ScheduleGame[], players: PlayerMap): Promise<SleeperBundle> {
  const { season, week } = state
  const [league, rosters, users, proj, ...weeks] = await Promise.all([
    get<SleeperLeague>(f, `${SLEEPER}/v1/league/${leagueId}`),
    get<SleeperRoster[]>(f, `${SLEEPER}/v1/league/${leagueId}/rosters`),
    get<SleeperUser[]>(f, `${SLEEPER}/v1/league/${leagueId}/users`),
    get<unknown>(f, `${SLEEPER}/projections/nfl/${season}/${week}?season_type=regular`),
    ...Array.from({ length: week }, (_, i) => get<SleeperMatchup[]>(f, `${SLEEPER}/v1/league/${leagueId}/matchups/${i + 1}`)),
  ])
  return {
    season,
    week,
    league,
    rosters,
    users,
    players,
    projections: normalizeProjections(proj),
    matchups: new Map(weeks.map((rows, i) => [i + 1, rows])),
    schedule,
  }
}

async function listAll(kv: JobKV, prefix: string): Promise<string[]> {
  const out: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor })
    out.push(...page.keys.map((k) => k.name))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return out
}

const readJson = async <T>(kv: KV, key: string): Promise<T | null> => {
  const v = await kv.get(key)
  return v ? (JSON.parse(v) as T) : null
}

/**
 * One scheduled run. `now` is passed in (tests run it at chosen times). Returns what happened to each
 * due show; shows that are not due produce no result.
 */
export async function runScheduled(kv: JobKV, now: number, f: typeof fetch = fetch): Promise<JobResult[]> {
  const subs = (await Promise.all((await listAll(kv, 'sub:')).map((k) => readJson<Subscription>(kv, k)))).filter(
    (s): s is Subscription => !!s,
  )
  if (!subs.length) return []
  const state = await get<NflState>(f, `${SLEEPER}/v1/state/nfl`)
  if (state.season_type !== 'regular') return []
  const schedule = await get<ScheduleGame[]>(f, `${SLEEPER}/schedule/nfl/regular/${state.season}`)
  const gameDates = datesOfWeek(schedule, state.week)
  const prevGameDates = datesOfWeek(schedule, state.week - 1)
  let players: PlayerMap | null = null
  const bundles = new Map<string, Promise<SleeperBundle>>()
  const results: JobResult[] = []

  for (const sub of subs) {
    const local = new Date(now + sub.tzOffsetMinutes * 60_000)
    const today = local.toISOString().slice(0, 10)
    const hour = local.getUTCHours()
    const existing = new Set<EpisodeType>()
    for (const t of sub.shows) if ((await readJson<JobRecord>(kv, jobKey(sub, state.season, state.week, t)))?.state === 'done') existing.add(t)
    const due = dueShows({ gameDates, prevGameDates, today, hour, enabled: sub.shows, existing, dueHour: sub.hour ?? DUE_HOUR })
    for (const type of due) {
      const key = jobKey(sub, state.season, state.week, type)
      const job = await readJson<JobRecord>(kv, key)
      if (job?.state === 'running' && now - job.at < RUNNING_TTL_MS) {
        results.push({ key, status: 'skipped-running' })
        continue
      }
      if (job && job.attempts >= MAX_ATTEMPTS && job.state !== 'done') {
        results.push({ key, status: 'gave-up', error: job.error })
        continue
      }
      const attempts = (job?.attempts ?? 0) + 1
      await kv.put(key, JSON.stringify({ state: 'running', attempts, at: now } satisfies JobRecord))
      try {
        players ??= await get<PlayerMap>(f, `${SLEEPER}/v1/players/nfl`)
        if (!bundles.has(sub.leagueId)) bundles.set(sub.leagueId, fetchBundle(f, sub.leagueId, state, schedule, players))
        const bundle = await bundles.get(sub.leagueId)!
        const built = serverFacts(bundle, sub.userId, now)
        if (!built) throw new Error('the subscriber is no longer on a roster in this league')
        const ep: Episode | null = buildEpisode({
          id: crypto.randomUUID(),
          type,
          facts: built.facts,
          factsAsOf: now,
          leagueId: sub.leagueId,
          leagueName: bundle.league.name,
          season: state.season,
          week: state.week,
          length: type === 'kickoff' ? 'short' : sub.length,
          format: sub.format,
          tone: sub.tone,
          now,
          auto: true,
        })
        if (!ep) throw new Error('no facts were available for this show')
        await kv.put(episodeStoreKey(sub.leagueId, sub.userId, ep.id), JSON.stringify(ep), { expirationTtl: EPISODE_TTL_S })
        const index = (await readJson<string[]>(kv, indexKey(sub.leagueId, sub.userId))) ?? []
        await kv.put(indexKey(sub.leagueId, sub.userId), JSON.stringify([ep.id, ...index].slice(0, MAX_INDEX)), { expirationTtl: EPISODE_TTL_S })
        await kv.put(key, JSON.stringify({ state: 'done', attempts, at: now, episodeId: ep.id } satisfies JobRecord))
        // cost tracking: the built-in writer and device voices cost nothing; count episodes per day
        const day = new Date(now).toISOString().slice(0, 10)
        const n = Number((await kv.get(`cost:${day}:episodes`)) ?? 0)
        await kv.put(`cost:${day}:episodes`, String(n + 1), { expirationTtl: 40 * 86_400 })
        results.push({ key, status: 'generated' })
      } catch (e) {
        const error = e instanceof Error ? e.message : 'unknown error'
        await kv.put(key, JSON.stringify({ state: 'failed', attempts, at: now, error } satisfies JobRecord))
        results.push({ key, status: 'failed', error })
      }
    }
  }
  return results
}

/** A subscriber's stored episodes, newest first. */
export async function listEpisodesFor(kv: KV, leagueId: string, userId: string): Promise<Episode[]> {
  const ids = (await readJson<string[]>(kv, indexKey(leagueId, userId))) ?? []
  const eps = await Promise.all(ids.map((id) => readJson<Episode>(kv, episodeStoreKey(leagueId, userId, id))))
  return eps.filter((e): e is Episode => !!e)
}

/** Opting out removes the subscription and every stored episode for it. */
export async function unsubscribe(kv: JobKV, leagueId: string, userId: string): Promise<void> {
  const ids = (await readJson<string[]>(kv, indexKey(leagueId, userId))) ?? []
  await Promise.all(ids.map((id) => kv.delete(episodeStoreKey(leagueId, userId, id))))
  await kv.delete(indexKey(leagueId, userId))
  await kv.delete(subKey(leagueId, userId))
}
