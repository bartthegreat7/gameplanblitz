import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App'
import { createQueryClient } from '../lib/queryClient'
import { useAppStore } from '../store/app'

/* Test-only harness: mocked Sleeper / FantasyCalc responses. Never imported by production code. */

const player = (id: string, first: string, last: string, position: string, extra = {}) => ({
  player_id: id,
  first_name: first,
  last_name: last,
  full_name: `${first} ${last}`,
  position,
  team: 'AAA',
  ...extra,
})

export const PLAYERS = {
  rb1: player('rb1', 'Rusher', 'Runnerson', 'RB'),
  rb2: player('rb2', 'Backup', 'Benchwood', 'RB', { injury_status: 'Questionable' }),
  wr1: player('wr1', 'Wideout', 'Catchwell', 'WR'),
  opp1: player('opp1', 'Rival', 'Runningback', 'RB'),
  fa1: player('fa1', 'Free', 'Agentson', 'RB', { team: 'BBB' }),
}

export const LEAGUE = {
  league_id: 'L1',
  name: 'Test League',
  season: '2025',
  scoring_settings: { rec: 1 },
  roster_positions: ['RB', 'WR', 'BN'],
  settings: { num_teams: 2, playoff_teams: 1, waiver_budget: 100 },
}

// scoring is {rec:1}, so a projection of {rec: X} is exactly X points
export const PROJ = [
  { player_id: 'rb1', stats: { rec: 8 }, opponent: 'CCC', company: 'testco' },
  { player_id: 'rb2', stats: { rec: 3 }, opponent: 'CCC', company: 'testco' },
  { player_id: 'wr1', stats: { rec: 10 }, opponent: 'CCC', company: 'testco' },
  { player_id: 'opp1', stats: { rec: 6 }, opponent: 'AAA', company: 'testco' },
  { player_id: 'fa1', stats: { rec: 12 }, opponent: 'DDD', company: 'testco' },
]

/** Completed-week stat rows: rb1 steady ~8, rb2 ~3, wr1 ~10, each with snap counts. */
export const weekRows = (week: number) => {
  const line = (rec: number, snaps: number) => ({ rec, gp: 1, off_snp: snaps, tm_off_snp: 60 })
  const wobble = [0, 1, -1, 0][week - 1] ?? 0
  return [
    { player_id: 'rb1', team: 'AAA', opponent: 'CCC', week, stats: line(8 + wobble, 40) },
    { player_id: 'rb2', team: 'AAA', opponent: 'CCC', week, stats: line(3 - wobble, 20) },
    { player_id: 'wr1', team: 'AAA', opponent: 'CCC', week, stats: line(10 + wobble, 50) },
  ]
}

export const SCHEDULE = [
  { game_id: 'g1', week: 5, status: 'pre_game', date: '2025-11-02', home: 'AAA', away: 'CCC' },
  { game_id: 'g2', week: 5, status: 'pre_game', date: '2025-11-02', home: 'BBB', away: 'DDD' },
  // later weeks, so nobody is mistaken for being on a bye
  { game_id: 'g3', week: 6, status: 'pre_game', date: '2025-11-09', home: 'AAA', away: 'CCC' },
  { game_id: 'g4', week: 6, status: 'pre_game', date: '2025-11-09', home: 'BBB', away: 'DDD' },
  { game_id: 'g5', week: 7, status: 'pre_game', date: '2025-11-16', home: 'AAA', away: 'CCC' },
  { game_id: 'g6', week: 7, status: 'pre_game', date: '2025-11-16', home: 'BBB', away: 'DDD' },
]

/** Four winning RB bids (5, 10, 15, 20): median 12.5, 75th percentile 16.25, max 20. */
const winningBid = (adds: Record<string, number>, bid: number) => ({
  type: 'waiver',
  status: 'complete',
  adds,
  settings: { waiver_bid: bid },
})
export const TRANSACTIONS: Record<number, unknown[]> = {
  1: [winningBid({ opp1: 2 }, 5), winningBid({ rb2: 1 }, 10)],
  2: [winningBid({ rb1: 1 }, 15), { type: 'trade', status: 'complete', adds: { wr1: 1 } }],
  3: [winningBid({ opp1: 2 }, 20)],
  4: [],
  5: [],
}

export type Routes = Record<string, unknown | (() => Response)>

export function mockFetch(overrides: Routes = {}) {
  const routes: Routes = {
    '/state/nfl': { season: '2025', week: 5, season_type: 'regular' },
    '/user/me': { user_id: 'u1', display_name: 'Me', avatar: null },
    '/user/ghost': null,
    '/user/u1/leagues/nfl/2025': [LEAGUE],
    '/league/L1/rosters': [
      {
        roster_id: 1,
        owner_id: 'u1',
        players: ['rb1', 'rb2', 'wr1'],
        starters: ['rb1', 'wr1'],
        settings: { wins: 3, losses: 1, fpts: 400 },
      },
      {
        roster_id: 2,
        owner_id: 'u2',
        players: ['opp1'],
        starters: ['opp1'],
        settings: { wins: 1, losses: 3, fpts: 300 },
      },
    ],
    '/league/L1/users': [
      { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'Gridiron Gang' } },
      { user_id: 'u2', display_name: 'Rival', avatar: null },
    ],
    '/league/L1/matchups/5': [
      {
        roster_id: 1,
        matchup_id: 9,
        points: 0,
        starters: ['rb1', 'wr1'],
        players: ['rb1', 'rb2', 'wr1'],
      },
      { roster_id: 2, matchup_id: 9, points: 0, starters: ['opp1'], players: ['opp1'] },
    ],
    '/league/L1': LEAGUE,
    '/players/nfl': PLAYERS,
    '/projections/nfl/2025/5': PROJ,
    '/projections/nfl/2025/6': PROJ,
    '/projections/nfl/2025/7': PROJ,
    '/players/nfl/trending/add': [{ player_id: 'fa1', count: 12345 }],
    '/league/L1/transactions/1': TRANSACTIONS[1],
    '/league/L1/transactions/2': TRANSACTIONS[2],
    '/league/L1/transactions/3': TRANSACTIONS[3],
    '/league/L1/transactions/4': TRANSACTIONS[4],
    '/league/L1/transactions/5': TRANSACTIONS[5],
    '/stats/nfl/2025': { rb1: { rec: 40, gp: 4 } },
    '/stats/nfl/2025/1': weekRows(1),
    '/stats/nfl/2025/2': weekRows(2),
    '/stats/nfl/2025/3': weekRows(3),
    '/stats/nfl/2025/4': weekRows(4),
    '/schedule/nfl/regular/2025': SCHEDULE,
    '/values/current': [
      { player: { sleeperId: 'rb1' }, value: 1000, overallRank: 10 },
      { player: { sleeperId: 'opp1' }, value: 100, overallRank: 99 },
    ],
    ...overrides,
  }
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost') // the news file is fetched by relative URL
    // longest matching route key wins (so '/league/L1/rosters' beats '/league/L1')
    const key = Object.keys(routes)
      .filter((k) => url.pathname.endsWith(k))
      .sort((a, b) => b.length - a.length)[0]
    if (!key) return new Response('not found', { status: 404 })
    const body = routes[key]
    if (typeof body === 'function') return (body as () => Response)()
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export function renderApp(hash = '#/') {
  window.location.hash = hash
  return render(<App client={createQueryClient(false)} />)
}

export function resetStore(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    username: null,
    leagueId: null,
    collapsed: [],
    sidebarCollapsed: false,
    bookmarks: [],
    read: [],
    keeperRules: {},
    viewWeek: null,
    theme: 'dark',
    aiConsent: false,
    aiToken: '',
    readAloud: false,
    deviceVoices: [null, null],
    cloudVoices: ['orion', 'asteria'],
    ...over,
  })
}

export const failing =
  (status = 500) =>
  () =>
    new Response('boom', { status })

/** Open one of the original dashboard tools from Quick access; resolves to its side panel. */
export async function openTool(label: string) {
  const qa = await screen.findByRole('region', { name: 'Quick access' }, { timeout: 15_000 })
  await userEvent.setup().click(within(qa).getByRole('button', { name: label }))
  return screen.findByRole('dialog', { name: label })
}
