import { LEAGUE, PLAYERS } from '../../src/test/mockSleeper'
import { BadRequest } from './logic'
import {
  indexKey,
  jobKey,
  listEpisodesFor,
  MAX_ATTEMPTS,
  runScheduled,
  subKey,
  unsubscribe,
  validateSubscription,
  type JobKV,
  type Subscription,
} from './podcastJob'

/* Runs the scheduled job in-process: no browser, an in-memory KV, Sleeper served from fixtures.
   Week 5: games Thu 2025-10-09 and Sun 2025-10-12, so the Weekly Review is due Tue 2025-10-07. */

class MemKV implements JobKV {
  data = new Map<string, string>()
  async get(k: string) {
    return this.data.get(k) ?? null
  }
  async put(k: string, v: string) {
    this.data.set(k, v)
  }
  async delete(k: string) {
    this.data.delete(k)
  }
  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }
  }
}

const ROSTERS = [
  { roster_id: 1, owner_id: 'u1', players: ['rb1', 'rb2', 'wr1'], starters: ['rb1', 'wr1'], settings: { wins: 3, losses: 1 } },
  { roster_id: 2, owner_id: 'u2', players: ['opp1'], starters: ['opp1'], settings: { wins: 1, losses: 3 } },
]
const USERS = [
  { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'Gridiron Gang' } },
  { user_id: 'u2', display_name: 'Rival', avatar: null },
]
const week = (a: number, b: number) => [
  { roster_id: 1, matchup_id: 1, points: a, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'], players_points: { rb1: a / 2, wr1: a / 2 } },
  { roster_id: 2, matchup_id: 1, points: b, starters: ['opp1'], players: ['opp1'], players_points: { opp1: b } },
]
const SCHEDULE = [
  { game_id: 'g1', week: 5, status: 'pre_game', date: '2025-10-09', home: 'AAA', away: 'CCC' },
  { game_id: 'g2', week: 5, status: 'pre_game', date: '2025-10-12', home: 'BBB', away: 'DDD' },
]

function sleeper(over: Record<string, () => Response> = {}, seasonType = 'regular') {
  const routes: Record<string, unknown> = {
    '/v1/state/nfl': { season: '2025', week: 5, season_type: seasonType },
    '/schedule/nfl/regular/2025': SCHEDULE,
    '/v1/players/nfl': PLAYERS,
    '/v1/league/L1': LEAGUE,
    '/v1/league/L1/rosters': ROSTERS,
    '/v1/league/L1/users': USERS,
    '/projections/nfl/2025/5': [
      { player_id: 'rb1', stats: { rec: 8 } },
      { player_id: 'wr1', stats: { rec: 10 } },
      { player_id: 'opp1', stats: { rec: 6 } },
    ],
    '/v1/league/L1/matchups/1': week(90, 80),
    '/v1/league/L1/matchups/2': week(95, 85),
    '/v1/league/L1/matchups/3': week(70, 110),
    '/v1/league/L1/matchups/4': week(102.4, 101.9),
    '/v1/league/L1/matchups/5': week(0, 0),
  }
  const calls: string[] = []
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname
    calls.push(path)
    if (over[path]) return over[path]()
    if (!(path in routes)) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(routes[path]), { status: 200 })
  })
  return { f: f as unknown as typeof fetch, calls }
}

const SUB: Subscription = {
  leagueId: 'L1',
  userId: 'u1',
  username: 'me',
  shows: ['recap', 'preview'],
  length: 'standard',
  format: 'debate',
  tone: 'straight',
  tzOffsetMinutes: -300, // US Eastern (daylight time)
  createdAt: 0,
}
const at = (iso: string) => Date.parse(iso)
const TUE_8AM_ET = at('2025-10-07T12:00:00Z')

async function subscribed() {
  const kv = new MemKV()
  await kv.put(subKey('L1', 'u1'), JSON.stringify(SUB))
  return kv
}

describe('scheduled Fantasy War Room job', () => {
  it('generates the due Weekly Review with no browser, stores it privately and never duplicates it', async () => {
    const kv = await subscribed()
    const { f } = sleeper()
    expect(await runScheduled(kv, TUE_8AM_ET, f)).toEqual([{ key: jobKey(SUB, '2025', 5, 'recap'), status: 'generated' }])
    const eps = await listEpisodesFor(kv, 'L1', 'u1')
    expect(eps).toHaveLength(1)
    expect(eps[0]).toMatchObject({ type: 'recap', week: 5, season: '2025', auto: true, title: 'Weekly Review · Week 5' })
    expect(eps[0].lines[0].kind).toBe('disclosure')
    expect(eps[0].lines.some((l) => l.chapter === 'around' && l.text.includes('Gridiron Gang 102.4 def. Rival 101.9'))).toBe(true)
    // the next hourly run does nothing: the job is done
    expect(await runScheduled(kv, TUE_8AM_ET + 3_600_000, f)).toEqual([])
    expect(JSON.parse((await kv.get(indexKey('L1', 'u1')))!)).toHaveLength(1)
    expect(await kv.get(`cost:2025-10-07:episodes`)).toBe('1')
  })

  it('waits for the due hour in the subscriber’s time zone, then adds The Game Plan on Thursday', async () => {
    const kv = await subscribed()
    const { f } = sleeper()
    expect(await runScheduled(kv, at('2025-10-07T09:00:00Z'), f)).toEqual([]) // 5 AM Eastern
    await runScheduled(kv, TUE_8AM_ET, f)
    const thu = await runScheduled(kv, at('2025-10-09T11:00:00Z'), f)
    expect(thu.map((r) => r.key)).toEqual([jobKey(SUB, '2025', 5, 'preview')])
    expect((await listEpisodesFor(kv, 'L1', 'u1')).map((e) => e.type)).toEqual(['preview', 'recap'])
  })

  it('records failures and retries on a later run, giving up after the attempt limit', async () => {
    const kv = await subscribed()
    const broken = sleeper({ '/v1/league/L1/rosters': () => new Response('down', { status: 503 }) })
    const first = await runScheduled(kv, TUE_8AM_ET, broken.f)
    expect(first[0]).toMatchObject({ status: 'failed', error: 'Sleeper 503 for /v1/league/L1/rosters' })
    const ok = await runScheduled(kv, TUE_8AM_ET + 3_600_000, sleeper().f)
    expect(ok[0].status).toBe('generated')

    const kv2 = await subscribed()
    for (let i = 0; i < MAX_ATTEMPTS; i++) await runScheduled(kv2, TUE_8AM_ET + i * 3_600_000, broken.f)
    expect((await runScheduled(kv2, TUE_8AM_ET + 9 * 3_600_000, sleeper().f))[0].status).toBe('gave-up')
  })

  it('skips a job another run is working on, and does nothing out of season or without subscribers', async () => {
    const kv = await subscribed()
    await kv.put(jobKey(SUB, '2025', 5, 'recap'), JSON.stringify({ state: 'running', attempts: 1, at: TUE_8AM_ET - 60_000 }))
    expect((await runScheduled(kv, TUE_8AM_ET, sleeper().f))[0].status).toBe('skipped-running')
    expect(await runScheduled(await subscribed(), TUE_8AM_ET, sleeper({}, 'off').f)).toEqual([])
    const empty = sleeper()
    expect(await runScheduled(new MemKV(), TUE_8AM_ET, empty.f)).toEqual([])
    expect(empty.calls).toEqual([]) // no subscribers: not even a Sleeper request
  })

  it('opting out removes the subscription and every stored episode', async () => {
    const kv = await subscribed()
    await runScheduled(kv, TUE_8AM_ET, sleeper().f)
    await unsubscribe(kv, 'L1', 'u1')
    expect([...kv.data.keys()].filter((k) => k.startsWith('sub:') || k.startsWith('ep:') || k.startsWith('eps:'))).toEqual([])
    expect(await runScheduled(kv, at('2025-10-09T11:00:00Z'), sleeper().f)).toEqual([])
  })

  it('validates subscription requests', () => {
    expect(validateSubscription({ username: 'me', leagueId: 'L1', shows: ['recap', 'nope'], tzOffsetMinutes: -300 })).toMatchObject({
      shows: ['recap'],
      length: 'standard',
      format: 'debate',
      tone: 'straight',
    })
    expect(() => validateSubscription({ username: 'me', leagueId: 'L1', shows: [], tzOffsetMinutes: 0 })).toThrow(BadRequest)
    expect(() => validateSubscription({ username: 'me', leagueId: 'L1', shows: ['recap'], tzOffsetMinutes: 99999 })).toThrow(/tzOffset/)
  })
})
