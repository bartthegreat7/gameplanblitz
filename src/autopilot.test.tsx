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
