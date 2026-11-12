import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LEAGUE, mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* Two teams, one playoff spot, regular season through week 7. I am 3-1 with the better
   projected lineup; the rival is 1-3. Weeks 5-7 are scheduled; week 6 has no matchup posted. */
const league = { ...LEAGUE, settings: { ...LEAGUE.settings, playoff_week_start: 8, playoff_teams: 1 } }
const game = (mine = 0, theirs = 0) => [
  { roster_id: 1, matchup_id: 1, points: mine, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'] },
  { roster_id: 2, matchup_id: 1, points: theirs, starters: ['opp1'], players: ['opp1'] },
]
const ROUTES = {
  '/league/L1': league,
  '/user/u1/leagues/nfl/2025': [league],
  '/league/L1/matchups/1': game(100, 90),
  '/league/L1/matchups/2': game(110, 95),
  '/league/L1/matchups/3': game(90, 100),
  '/league/L1/matchups/4': game(120, 80),
  '/league/L1/matchups/5': game(),
  '/league/L1/matchups/6': [],
  '/league/L1/matchups/7': game(),
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch(ROUTES)
})
afterEach(() => vi.unstubAllGlobals())

describe('Playoff Simulator', () => {
  it('shows my odds, scenarios and league odds with stated assumptions', async () => {
    renderApp('#/playoffs')
    expect(await screen.findByRole('heading', { name: 'Playoff Simulator', level: 1 }, { timeout: 20_000 })).toBeInTheDocument()
    const mine = await screen.findByRole('region', { name: 'Your odds' })
    expect(within(mine).getByText('Make playoffs')).toBeInTheDocument()
    const scen = screen.getByRole('region', { name: 'Scenarios' })
    expect(within(scen).getByText('If you win in Week 5')).toBeInTheDocument()
    expect(within(scen).getByText('If you win all 2 remaining')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Playoff odds by team' })
    expect(within(table).getAllByRole('row')).toHaveLength(3) // header + 2 teams
    expect(screen.getByText(/5,000 simulated seasons of the remaining schedule \(Weeks 5–7\), top 1 make the playoffs/)).toBeInTheDocument()
    expect(screen.getByText('Assumptions and method')).toBeInTheDocument()
  }, 30_000)

  it('only shows byes when the bracket has them', async () => {
    renderApp('#/playoffs') // 1 playoff team: no byes
    const mine = await screen.findByRole('region', { name: 'Your odds' })
    expect(within(mine).queryByText('First-round bye')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Playoff odds by team' })).queryByRole('columnheader', { name: /Bye/ })).not.toBeInTheDocument()
  })

  it('makes the clearly better team the favorite, and winning out a lock', async () => {
    renderApp('#/playoffs')
    const mine = await screen.findByRole('region', { name: 'Your odds' })
    const value = (label: string) => Number(within(mine).getByText(label).nextElementSibling!.textContent!.replace(/[<%]/g, ''))
    expect(value('Make playoffs')).toBeGreaterThan(50)
    const scen = screen.getByRole('region', { name: 'Scenarios' })
    expect(within(scen).getByText('If you win all 2 remaining').nextElementSibling).toHaveTextContent('100%')
    const win = Number(within(scen).getByText('If you win in Week 5').nextElementSibling!.textContent!.replace('%', ''))
    const lose = Number(within(scen).getByText('If you lose in Week 5').nextElementSibling!.textContent!.replace('%', ''))
    expect(win).toBeGreaterThanOrEqual(lose)
  })

  it('says which weeks have no posted matchups', async () => {
    renderApp('#/playoffs')
    expect(await screen.findByText(/Sleeper has no matchups posted for week 6; those games aren't simulated/)).toBeInTheDocument()
  })

  it('lets me change the assumptions and the seed', async () => {
    const user = userEvent.setup()
    renderApp('#/playoffs')
    await screen.findByRole('region', { name: 'Your odds' })
    await user.click(screen.getByRole('button', { name: 'Season form' }))
    expect(screen.getByRole('button', { name: 'Season form' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '1,000' }))
    expect(screen.getByText(/1,000 simulated seasons/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /New seed \(20261111\)/ }))
    expect(screen.getByRole('button', { name: /New seed \(20261112\)/ })).toBeInTheDocument()
  })

  it('explains that odds are settled once the regular season is over', async () => {
    mockFetch({ ...ROUTES, '/state/nfl': { season: '2025', week: 9, season_type: 'regular' }, '/league/L1/matchups/9': game() })
    renderApp('#/playoffs')
    expect(await screen.findByText(/The regular season is over/)).toBeInTheDocument()
  })

  it('is reachable from the navigation', async () => {
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 })
    expect(screen.getAllByRole('link', { name: 'Playoffs' }).length).toBeGreaterThan(0)
  })
})
