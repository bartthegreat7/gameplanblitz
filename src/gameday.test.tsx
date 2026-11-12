import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* Week 5, all players on team AAA (pre_game in the schedule). rb1 has already scored 4 points, so
   his game counts as live; wr1 hasn't played. Projections: rb1 8, rb2 3, wr1 10, opp1 6. */
const live = (starters: string[], points: Record<string, number>) => [
  { roster_id: 1, matchup_id: 9, points: Object.values(points).reduce((a, b) => a + b, 0), starters, players: ['rb1', 'rb2', 'wr1'], players_points: points },
  { roster_id: 2, matchup_id: 9, points: 0, starters: ['opp1'], players: ['opp1'], players_points: {} },
]

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch({ '/league/L1/matchups/5': live(['rb1', 'wr1'], { rb1: 4 }) })
})
afterEach(() => vi.unstubAllGlobals())

describe('Game Day', () => {
  it('shows live points as facts and the projected final and win odds as model estimates', async () => {
    renderApp('#/gameday')
    const board = await screen.findByRole('region', { name: 'Scoreboard' }, { timeout: 15_000 })
    // me: 4 live; left = rb1 (8 - 4) + wr1 10 = 14 -> projected final 18
    expect(within(board).getByText('4.0')).toBeInTheDocument()
    expect(within(board).getByText('18.0')).toBeInTheDocument()
    expect(within(board).getByRole('progressbar', { name: 'Live win probability' })).toBeInTheDocument()
    expect(within(board).getByText('MODEL')).toBeInTheDocument()
    expect(screen.getByText(/Games are live: scores refresh every minute/)).toBeInTheDocument()
    expect(screen.getByText(/Live scores updated/)).toBeInTheDocument()
  }, 20_000)

  it('labels each starter\'s game state', async () => {
    renderApp('#/gameday')
    const mine = await screen.findByRole('region', { name: 'Your starters' })
    expect(within(within(mine).getByRole('row', { name: /R\. Runnerson/ })).getByText('Live')).toBeInTheDocument()
    // the state comes from the schedule, which loads independently of the scores
    await vi.waitFor(() => expect(within(within(mine).getByRole('row', { name: /W\. Catchwell/ })).getByText('Not started')).toBeInTheDocument())
  })

  it('suggests a swap only between players whose games have not started', async () => {
    mockFetch({ '/league/L1/matchups/5': live(['rb2', 'wr1'], {}) })
    renderApp('#/gameday')
    const alerts = await screen.findByRole('region', { name: 'Lineup alerts' })
    expect(within(alerts).getByText(/Consider starting R\. Runnerson \(8\.0 proj\) over B\. Benchwood \(3\.0\) at RB/)).toBeInTheDocument()
    expect(within(alerts).getByText('Model')).toBeInTheDocument()
  })

  it('says there is nothing to fix when the open lineup is already best', async () => {
    renderApp('#/gameday')
    const alerts = await screen.findByRole('region', { name: 'Lineup alerts' })
    expect(within(alerts).getByText(/Nothing to fix/)).toBeInTheDocument()
  })

  it('polls slowly before any game starts', async () => {
    mockFetch({ '/league/L1/matchups/5': live(['rb1', 'wr1'], {}) })
    renderApp('#/gameday')
    expect(await screen.findByText(/Scores refresh every 5 minutes; every minute once games are live/)).toBeInTheDocument()
  })

  it('refreshes live scores on demand', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({ '/league/L1/matchups/5': live(['rb1', 'wr1'], { rb1: 4 }) })
    renderApp('#/gameday')
    await screen.findByRole('region', { name: 'Scoreboard' })
    const before = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/matchups/5')).length
    await user.click(screen.getByRole('button', { name: 'Refresh live scores' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/matchups/5')).length).toBeGreaterThan(before))
  })

  it('shows an empty state without a matchup', async () => {
    mockFetch({ '/league/L1/matchups/5': [] })
    renderApp('#/gameday')
    expect(await screen.findByText(/No Week 5 matchup is posted for your team/)).toBeInTheDocument()
  })
})
