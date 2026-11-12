import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAppStore } from './store/app'
import { failing, mockFetch, renderApp, resetStore, SCHEDULE } from './test/mockSleeper'

const SLOW = { timeout: 5000 }
const matchupsWith = (starters: string[]) => [
  { roster_id: 1, matchup_id: 9, points: 0, starters, players: ['rb1', 'rb2', 'wr1'] },
  { roster_id: 2, matchup_id: 9, points: 0, starters: ['opp1'], players: ['opp1'] },
]

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

describe('Lineup Optimizer page', () => {
  it('says so when the lineup is already optimal', async () => {
    renderApp('#/lineup')
    expect(await screen.findByText(/already the best available/)).toBeInTheDocument()
    expect(screen.getByText('0 swaps')).toBeInTheDocument()
  })

  it('recommends the better running back with the gain, reasons, evidence and source', async () => {
    const user = userEvent.setup()
    mockFetch({ '/league/L1/matchups/5': matchupsWith(['rb2', 'wr1']) })
    renderApp('#/lineup')

    expect(await screen.findByText('+5.0 pts')).toBeInTheDocument() // 8 vs 3
    expect(screen.getByText('1 swap')).toBeInTheDocument()
    expect(screen.getAllByText('Confidence:').length).toBe(1)

    await user.click(screen.getAllByRole('button', { name: 'Why?' })[0])
    expect(screen.getByText(/Start R\. Runnerson \(8\.0 proj\) over B\. Benchwood \(3\.0\): \+5\.0 projected points/)).toBeInTheDocument()
    // source attribution names the provider Sleeper reports on the projection rows
    expect(screen.getAllByText(/Sleeper projections \(testco\)/).length).toBeGreaterThan(0)
    // sourced facts and model estimates are labeled differently
    expect(screen.getAllByText(/Model estimate/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Sourced/).length).toBeGreaterThan(0)
  })

  it('shows data freshness and the provider', async () => {
    renderApp('#/lineup')
    expect(await screen.findByText(/Projections fetched just now/)).toBeInTheDocument()
    expect(screen.getByText(/projections from Sleeper \(testco\)/)).toBeInTheDocument()
  })

  it('switches the optimization mode', async () => {
    const user = userEvent.setup()
    renderApp('#/lineup')
    const safest = await screen.findByRole('button', { name: 'Safest (floor)' })
    expect(safest).toHaveAttribute('aria-pressed', 'false')
    await user.click(safest)
    expect(safest).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Best projection' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps working, with a notice, when game history fails to load', async () => {
    mockFetch({
      '/league/L1/matchups/5': matchupsWith(['rb2', 'wr1']),
      '/stats/nfl/2025/1': failing(), '/stats/nfl/2025/2': failing(), '/stats/nfl/2025/3': failing(), '/stats/nfl/2025/4': failing(),
    })
    renderApp('#/lineup')
    // soft-failing queries retry once (1s backoff) before the notice appears
    expect(await screen.findByText(/Game history couldn't be loaded/, {}, SLOW)).toBeInTheDocument()
    expect(screen.getByText('+5.0 pts')).toBeInTheDocument() // projections still drive the plan
    expect(screen.getAllByText('Range unavailable').length).toBeGreaterThan(0)
  })

  it('warns when the schedule fails, and does not guess byes or locks', async () => {
    mockFetch({ '/schedule/nfl/regular/2025': failing() })
    renderApp('#/lineup')
    expect(await screen.findByText(/NFL schedule couldn't be loaded/, {}, SLOW)).toBeInTheDocument()
  })

  it('flags players on a bye and explains that no replacement exists', async () => {
    // AAA (all three of my players) has no game in week 5
    mockFetch({ '/schedule/nfl/regular/2025': [SCHEDULE[1], { game_id: 'g9', week: 6, status: 'pre_game', date: '', home: 'AAA', away: 'CCC' }] })
    renderApp('#/lineup')
    expect(await screen.findAllByText('Bye')).not.toHaveLength(0)
    expect(screen.getByText('No eligible, available player for the WR slot.')).toBeInTheDocument()
  })

  it('locks players whose games have started', async () => {
    mockFetch({
      '/schedule/nfl/regular/2025': [{ ...SCHEDULE[0], status: 'complete' }, SCHEDULE[1]],
      '/league/L1/matchups/5': matchupsWith(['rb2', 'wr1']),
    })
    renderApp('#/lineup')
    // rb2 is locked, so the optimizer must not swap in rb1 (also started)
    expect((await screen.findAllByText('Locked')).length).toBeGreaterThan(0)
    expect(screen.queryByText('+5.0 pts')).not.toBeInTheDocument()
    expect(screen.getAllByText('Game started').length).toBeGreaterThan(0)
  })

  it('searches the player table and opens a player drawer with sources', async () => {
    const user = userEvent.setup()
    renderApp('#/lineup')
    const table = await screen.findByRole('table', { name: 'Your players with projections and ranges' })
    expect(within(table).getByText('R. Runnerson')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search Your players with projections and ranges'), 'catch')
    expect(within(table).queryByText('R. Runnerson')).not.toBeInTheDocument()
    expect(within(table).getByText('W. Catchwell')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /R\. Runnerson, details/ })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Floor')).toBeInTheDocument()
    expect(within(dialog).getByText(/Sleeper projections \(testco\)/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Full player details' })).toHaveAttribute('href', '#/players/rb1')
  })

  it('shows an empty state when there is no matchup', async () => {
    mockFetch({ '/league/L1/matchups/5': [] })
    renderApp('#/lineup')
    expect(await screen.findByText(/No Week 5 matchup is posted/)).toBeInTheDocument()
  })

  it('redirects a signed-out visitor to connect', async () => {
    resetStore()
    renderApp('#/lineup')
    expect(await screen.findByRole('heading', { name: 'Connect your Sleeper team' })).toBeInTheDocument()
  })
})

describe('sidebar', () => {
  it('collapses to icons, keeps accessible link names, and remembers the choice', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 })
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(useAppStore.getState().sidebarCollapsed).toBe(true)
    const expand = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    // icon-only links still have names
    expect(screen.getAllByRole('link', { name: 'Lineup' }).length).toBeGreaterThan(0)
    await user.click(expand)
    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
  })
})
