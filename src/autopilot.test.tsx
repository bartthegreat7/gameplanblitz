import { screen, within } from '@testing-library/react'

import { mockFetch, PLAYERS, renderApp, resetStore } from './test/mockSleeper'

const SLOW = { timeout: 15_000 }

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('Fantasy Autopilot', () => {
  it('shows readiness, the top actions with impact, urgency and data freshness, and stays recommendation-only', async () => {
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp('#/autopilot')
    expect(await screen.findByRole('heading', { level: 1, name: 'Fantasy Autopilot' }, SLOW)).toBeInTheDocument()
    expect(screen.getByText(/Recommendation-only\. Autopilot never changes your Sleeper roster/)).toBeInTheDocument()
    const top = screen.getByRole('region', { name: 'Top recommended actions' })
    const first = (await within(top).findAllByRole('listitem', {}, SLOW))[0]
    expect(first).toHaveTextContent('Do now')
    expect(first).toHaveTextContent(/Expected impact:/)
    expect(first).toHaveTextContent(/Sleeper synced|Sleeper data loading/)
    const ready = screen.getByRole('region', { name: 'Team readiness' })
    expect(ready).toHaveTextContent('50%')
    expect(screen.getByRole('region', { name: 'Injury concerns' })).toHaveTextContent(/R\. Runnerson.*Out/)
    expect(screen.getByRole('region', { name: "This week's rhythm" })).toHaveTextContent(/today/)
  }, 30_000)

  it('records recommendations in this browser once the brief is complete', async () => {
    renderApp('#/autopilot')
    const history = await screen.findByRole('region', { name: 'Recommendation history' }, SLOW)
    expect(await within(history).findAllByText('Active', {}, { timeout: 20_000 })).not.toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('gb-autopilot-L1') ?? '[]').length).toBeGreaterThan(0)
  }, 40_000)
})

describe('League X-Ray', () => {
  it('compares every team by position and against a chosen opponent', async () => {
    renderApp('#/xray')
    expect(await screen.findByRole('heading', { level: 1, name: 'League X-Ray' }, SLOW)).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: /Every team's projected strength/ }, SLOW)
    expect(within(table).getAllByRole('rowheader').map((r) => r.textContent)).toEqual(['Gridiron Gang (you)', 'Rival'])
    const compare = screen.getByRole('region', { name: 'Compare with a team' })
    expect(within(compare).getByRole('combobox', { name: 'Team to compare with' })).toHaveValue('2')
    expect(compare).toHaveTextContent(/Overall 18\.0 vs 6\.0 projected/)
    expect(screen.getByRole('region', { name: 'Trade partners' })).toHaveTextContent(/Whether a manager wants to trade is unknown/)
  }, 30_000)
})

describe('Alternate Reality Simulator', () => {
  it('compares the current team with a proposed waiver add without touching the roster', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderApp('#/simulate')
    expect(await screen.findByRole('heading', { level: 1, name: 'Alternate Reality Simulator' }, SLOW)).toBeInTheDocument()
    const result = screen.getByRole('region', { name: 'Current team vs proposed' })
    const row = async () => within(await within(result).findByRole('table', { name: 'Current team compared with the proposed changes' }, SLOW)).getByRole('row', { name: /Week 5 projected points/ })
    expect(await row()).toHaveTextContent(/18\.0\s*18\.0/)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Free agent to add' }), 'fa1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Player to drop' }), 'rb2')
    await user.click(within(screen.getByRole('group', { name: 'Waiver move' })).getByRole('button', { name: /Add to scenario/ }))
    expect(within(result).getByRole('list', { name: 'Changes in this scenario' })).toHaveTextContent('Add F. Agentson')
    expect(await row()).toHaveTextContent(/18\.0\s*22\.0\s*\+4\.0/)
    expect(result).toHaveTextContent(/These are estimates, not guaranteed outcomes/)
    await user.click(within(result).getByRole('button', { name: /Reset/ }))
    expect(await row()).toHaveTextContent(/18\.0\s*18\.0/)
  }, 40_000)
})

describe('Fantasy GM Academy', () => {
  it('reviews a past week by process and outcome, and tracks lessons', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    // Week 4: started rb2 (projected 3) over rb1 (projected 8); rb1 scored 20, rb2 scored 5
    mockFetch({
      '/league/L1/matchups/4': [
        { roster_id: 1, matchup_id: 1, points: 15, starters: ['rb2', 'wr1'], players: ['rb1', 'rb2', 'wr1'], players_points: { rb1: 20, rb2: 5, wr1: 10 } },
        { roster_id: 2, matchup_id: 1, points: 12, starters: ['opp1'], players: ['opp1'], players_points: { opp1: 12 } },
      ],
      '/projections/nfl/2025/4': [
        { player_id: 'rb1', stats: { rec: 8 } },
        { player_id: 'rb2', stats: { rec: 3 } },
        { player_id: 'wr1', stats: { rec: 10 } },
      ],
    })
    renderApp('#/academy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Fantasy GM Academy' }, SLOW)).toBeInTheDocument()
    const reviews = screen.getByRole('region', { name: 'Weekly decision reviews' })
    const week4 = await within(reviews).findByText(/^Week 4/, {}, { timeout: 20_000 })
    const item = week4.closest('li')!
    expect(item).toHaveTextContent(/Win by 3\.0/)
    expect(item).toHaveTextContent(/your lineup projected 13\.0, the best possible 18\.0 \(5\.0 left on the bench\)/)
    expect(item).toHaveTextContent(/Process miss.*RB: you started Backup Benchwood \(projected 3\.0, scored 5\.0\) over Rusher Runnerson \(projected 8\.0, scored 20\.0\)/)
    const dev = screen.getByRole('region', { name: 'GM development' })
    expect(dev).toHaveTextContent(/Area to work on: RB decisions/)
    const lessons = screen.getByRole('region', { name: 'Strategy lessons' })
    await user.click(within(lessons).getByText('Judge decisions by process, not points'))
    await user.click(within(lessons).getAllByRole('button', { name: 'Mark as completed' })[0])
    expect(dev).toHaveTextContent(/Lessons completed: 1 of 8/)
    expect(JSON.parse(localStorage.getItem('gb-academy-lessons')!)).toEqual(['process'])
  }, 40_000)
})
