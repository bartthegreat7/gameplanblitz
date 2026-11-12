import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App'
import { createQueryClient } from './lib/queryClient'
import { winProbability } from './lib/scoring'
import { useAppStore } from './store/app'

/* ---------- mocked Sleeper / FantasyCalc ---------- */

const player = (id: string, first: string, last: string, position: string, extra = {}) => ({
  player_id: id,
  first_name: first,
  last_name: last,
  full_name: `${first} ${last}`,
  position,
  team: 'AAA',
  ...extra,
})

const PLAYERS = {
  rb1: player('rb1', 'Rusher', 'Runnerson', 'RB'),
  rb2: player('rb2', 'Backup', 'Benchwood', 'RB', { injury_status: 'Questionable' }),
  wr1: player('wr1', 'Wideout', 'Catchwell', 'WR'),
  opp1: player('opp1', 'Rival', 'Runningback', 'RB'),
  fa1: player('fa1', 'Free', 'Agentson', 'RB', { team: 'BBB' }),
}

const LEAGUE = {
  league_id: 'L1',
  name: 'Test League',
  season: '2025',
  scoring_settings: { rec: 1 },
  roster_positions: ['RB', 'WR', 'BN'],
  settings: { num_teams: 2, playoff_teams: 1, waiver_budget: 100 },
}

// scoring is {rec:1}, so a projection of {rec: X} is exactly X points
const PROJ = [
  { player_id: 'rb1', stats: { rec: 8 } },
  { player_id: 'rb2', stats: { rec: 3 } },
  { player_id: 'wr1', stats: { rec: 10 } },
  { player_id: 'opp1', stats: { rec: 6 } },
  { player_id: 'fa1', stats: { rec: 12 } },
]

type Routes = Record<string, unknown | (() => Response)>

function mockFetch(overrides: Routes = {}) {
  const routes: Routes = {
    '/state/nfl': { season: '2025', week: 5, season_type: 'regular' },
    '/user/me': { user_id: 'u1', display_name: 'Me', avatar: null },
    '/user/ghost': null,
    '/user/u1/leagues/nfl/2025': [LEAGUE],
    '/league/L1/rosters': [
      { roster_id: 1, owner_id: 'u1', players: ['rb1', 'rb2', 'wr1'], starters: ['rb1', 'wr1'], settings: { wins: 3, losses: 1, fpts: 400 } },
      { roster_id: 2, owner_id: 'u2', players: ['opp1'], starters: ['opp1'], settings: { wins: 1, losses: 3, fpts: 300 } },
    ],
    '/league/L1/users': [
      { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'Gridiron Gang' } },
      { user_id: 'u2', display_name: 'Rival', avatar: null },
    ],
    '/league/L1/matchups/5': [
      { roster_id: 1, matchup_id: 9, points: 0, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'] },
      { roster_id: 2, matchup_id: 9, points: 0, starters: ['opp1'], players: ['opp1'] },
    ],
    '/league/L1': LEAGUE,
    '/players/nfl': PLAYERS,
    '/projections/nfl/2025/5': PROJ,
    '/stats/nfl/2025': { rb1: { rec: 40, gp: 4 } },
    '/values/current': [
      { player: { sleeperId: 'rb1' }, value: 1000, overallRank: 10 },
      { player: { sleeperId: 'opp1' }, value: 100, overallRank: 99 },
    ],
    ...overrides,
  }
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    // longest matching route key wins (so '/league/L1/rosters' beats '/league/L1')
    const key = Object.keys(routes)
      .filter((k) => url.pathname.endsWith(k))
      .sort((a, b) => b.length - a.length)[0]
    if (!key) return new Response('not found', { status: 404 })
    const body = routes[key]
    if (typeof body === 'function') return (body as () => Response)()
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function renderApp(hash = '#/') {
  window.location.hash = hash
  return render(<App client={createQueryClient(false)} />)
}

beforeEach(() => {
  useAppStore.setState({ username: null, leagueId: null, collapsed: [], bookmarks: [], read: [], theme: 'dark' })
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

/* ---------- tests ---------- */

describe('connect flow', () => {
  it('sends a signed-out visitor to the connect screen', async () => {
    renderApp('#/')
    expect(await screen.findByRole('heading', { name: 'Connect your Sleeper team' })).toBeInTheDocument()
  })

  it('shows an error for an unknown username and stays on connect', async () => {
    const user = userEvent.setup()
    renderApp('#/connect')
    await user.type(await screen.findByLabelText('Sleeper username'), 'ghost')
    await user.click(screen.getByRole('button', { name: 'Blitz it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't find “ghost”/)
    expect(useAppStore.getState().username).toBeNull()
  })

  it('connects a known username and lands on the dashboard', async () => {
    const user = userEvent.setup()
    renderApp('#/connect')
    await user.type(await screen.findByLabelText('Sleeper username'), '@me')
    await user.click(screen.getByRole('button', { name: 'Blitz it' }))
    expect(await screen.findByRole('region', { name: 'Game Day' })).toBeInTheDocument()
    expect(useAppStore.getState().username).toBe('me')
  })
})

describe('dashboard', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('renders Game Day with projections and the logistic win probability', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'Game Day' })
    expect(within(card).getByText('Gridiron Gang')).toBeInTheDocument()
    expect(within(card).getByText('18.0')).toBeInTheDocument() // RB 8 + WR 10
    expect(within(card).getByText('6.0')).toBeInTheDocument()
    const pct = Math.round(100 * winProbability(18, 6))
    expect(within(card).getByRole('progressbar', { name: 'Win probability' })).toHaveAttribute('aria-valuenow', String(pct))
  })

  it('finds the free-agent upgrade in The Edge', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'The Edge' })
    expect(within(card).getByText('Upgrades available')).toBeInTheDocument()
    expect(within(card).getByText('+4.0')).toBeInTheDocument() // 12 - 8
  })

  it('lists the top free agent on the Waiver Wire', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'Waiver Wire' })
    expect(within(card).getByText('Free Agentson')).toBeInTheDocument()
  })

  it('shows FAAB left in Waiver Bids and a no-deals state in Trade Machine', async () => {
    renderApp()
    const bidsCard = await screen.findByRole('region', { name: 'Waiver Bids' })
    expect(within(bidsCard).getByText('$100 left to spend')).toBeInTheDocument()
    const trade = await screen.findByRole('region', { name: 'Trade Machine' })
    expect(await within(trade).findByText(/No clearly fair upgrade/)).toBeInTheDocument()
  })

  it('shows standings with the signed-in team highlighted', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'Standings' })
    const row = within(card).getByText('Gridiron Gang').closest('tr')!
    expect(row).toHaveAttribute('aria-current', 'true')
  })

  it('collapses a card and remembers it', async () => {
    const user = userEvent.setup()
    renderApp()
    const card = await screen.findByRole('region', { name: 'Waiver Wire' })
    const toggle = within(card).getByRole('button', { name: /Waiver Wire/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(useAppStore.getState().collapsed).toContain('waiver')
  })

  it('explains that news feeds are not connected and still shows a roster report', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'News & Injuries' })
    expect(within(card).getByText(/Article feeds aren't connected/)).toBeInTheDocument()
    expect(within(card).getByText('Backup Benchwood')).toBeInTheDocument() // Questionable
  })

  it('opens a player quick view drawer from the roster and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderApp()
    const roster = await screen.findByRole('region', { name: 'My Roster' })
    await user.click(within(roster).getByRole('button', { name: /Rusher Runnerson/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Full player details' })).toHaveAttribute('href', '#/players/rb1')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('degraded data', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('warns on projection cards when projections fail to load', async () => {
    mockFetch({ '/projections/nfl/2025/5': () => new Response('boom', { status: 500 }) })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Game Day' })
    expect(await within(card).findByText(/Couldn't load Week 5 projections/)).toBeInTheDocument()
  })

  it('warns when Sleeper has not published projections yet', async () => {
    mockFetch({ '/projections/nfl/2025/5': [] })
    renderApp()
    const card = await screen.findByRole('region', { name: 'The Edge' })
    expect(await within(card).findByText(/hasn't published Week 5 projections/)).toBeInTheDocument()
  })

  it('disables the Trade Machine with a notice when FantasyCalc fails', async () => {
    mockFetch({ '/values/current': () => new Response('down', { status: 503 }) })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Trade Machine' })
    expect(await within(card).findByText(/FantasyCalc values couldn't load/)).toBeInTheDocument()
  })

  it('shows a retryable error when the league cannot load', async () => {
    mockFetch({ '/league/L1/rosters': () => new Response('x', { status: 500 }) })
    renderApp()
    expect(await screen.findByText("Couldn't load this league")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })
})

describe('players', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('lists my roster, searches, and opens a player detail page', async () => {
    const user = userEvent.setup()
    renderApp('#/players')
    expect(await screen.findByText('Rusher Runnerson')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search players'), 'catch')
    expect(screen.queryByText('Rusher Runnerson')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /Wideout Catchwell/ }))
    expect(await screen.findByRole('heading', { name: 'Wideout Catchwell', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('On Gridiron Gang')).toBeInTheDocument()
  })

  it('shows a free agent as unrostered on the detail page', async () => {
    renderApp('#/players/fa1')
    expect(await screen.findByText('Free agent in your league')).toBeInTheDocument()
  })

  it('shows an error for an unknown player id', async () => {
    renderApp('#/players/nope')
    expect(await screen.findByText('Player not found')).toBeInTheDocument()
  })
})

describe('settings and theme', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('toggles the theme from the shell', async () => {
    const user = userEvent.setup()
    renderApp('#/settings')
    await screen.findByRole('heading', { name: 'Settings', level: 1 })
    await user.click(screen.getAllByRole('button', { name: 'Switch to light theme' })[0])
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('signs out only after confirming', async () => {
    const user = userEvent.setup()
    renderApp('#/settings')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(useAppStore.getState().username).toBe('me')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out' }))
    expect(useAppStore.getState().username).toBeNull()
  })
})

describe('news hub', () => {
  it('explains the unconfigured feed', async () => {
    useAppStore.setState({ username: 'me' })
    renderApp('#/news')
    expect(await screen.findByText(/news feed isn't connected yet/)).toBeInTheDocument()
  })
})
