import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAppStore } from './store/app'
import { failing, LEAGUE, mockFetch, PROJ, renderApp, resetStore } from './test/mockSleeper'

const SLOW = { timeout: 5000 }
/** same projections, but the free agent is worth `fa` points */
const projWith = (fa: number) => PROJ.map((r) => (r.player_id === 'fa1' ? { ...r, stats: { rec: fa } } : r))

/** first recommendation card: the first <li> in the list that follows the "Recommended adds" heading */
async function firstCard() {
  const h = await screen.findByRole('heading', { name: 'Recommended adds' })
  let el = h.nextElementSibling
  while (el && el.tagName !== 'UL') el = el.nextElementSibling
  return el!.querySelector('li') as HTMLElement
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

describe('Waiver Wire Sniper page', () => {
  it('recommends the free agent, valued over the next three weeks, with the best drop', async () => {
    renderApp('#/waivers')
    const card = await firstCard()
    expect(within(card).getByText('Free Agentson')).toBeInTheDocument()
    expect(within(card).getByText('+12.0')).toBeInTheDocument() // +4 a week for 3 weeks
    expect(within(card).getByText('+4.0/wk lineup gain')).toBeInTheDocument()
    expect(within(card).getByText('Must add')).toBeInTheDocument()
    // roster is full (3 of 3), so he must replace someone: the bench RB costs nothing
    expect(within(card).getByText('B. Benchwood')).toBeInTheDocument()
    expect(within(card).getByText('Drop')).toBeInTheDocument()
  })

  it('states the roster situation and calibrates FAAB on the league\'s winning bids', async () => {
    renderApp('#/waivers')
    expect(await screen.findByText(/3 of 3 spots used/)).toBeInTheDocument()
    expect(screen.getByText(/Full: every add needs a drop/)).toBeInTheDocument()
    expect(screen.getByText(/\$100 of \$100 left \(4 winning bids seen this season\)/)).toBeInTheDocument()
    // a priority add (+4/wk) bids at the 75th percentile (16.25 -> 16) up to the max (20)
    expect(await screen.findByText(/FAAB \$16/)).toBeInTheDocument()
  })

  it('explains each recommendation and shows its sources', async () => {
    const user = userEvent.setup()
    renderApp('#/waivers')
    await user.click((await screen.findAllByRole('button', { name: 'Why?' }))[0])
    expect(screen.getByText(/Adds \+12\.0 projected points over the next 3 weeks \(\+4\.0 this week\)/)).toBeInTheDocument()
    expect(screen.getByText(/Best drop: B\. Benchwood/)).toBeInTheDocument()
    expect(screen.getAllByText(/Sleeper projections \(testco\)/).length).toBeGreaterThan(0)
    expect(screen.getByText(/FAAB guidance \(from your league\)/)).toBeInTheDocument()
    expect(screen.getByText(/4 winning bids for RBs in your league/)).toBeInTheDocument()
  })

  it('shows opportunity signals: trending adds', async () => {
    renderApp('#/waivers')
    const card = await firstCard()
    expect(within(card).getByText('Trending #1')).toBeInTheDocument() // also listed in the table, so scope to the card
  })

  it('describes a priority-waiver league without FAAB bids', async () => {
    mockFetch({ '/league/L1': { ...LEAGUE, settings: { num_teams: 2, playoff_teams: 1 } }, '/user/u1/leagues/nfl/2025': [{ ...LEAGUE, settings: { num_teams: 2, playoff_teams: 1 } }] })
    renderApp('#/waivers')
    expect(await screen.findByText(/Priority-based waivers/)).toBeInTheDocument()
    expect(screen.queryByText(/FAAB \$/)).not.toBeInTheDocument()
  })

  it('falls back to a labeled rule of thumb when league bid history cannot load', async () => {
    const user = userEvent.setup()
    mockFetch(Object.fromEntries([1, 2, 3, 4, 5].map((r) => [`/league/L1/transactions/${r}`, failing()])))
    renderApp('#/waivers')
    expect(await screen.findByText(/past waiver bids couldn't be loaded/, {}, SLOW)).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: 'Why?' }))[0])
    expect(screen.getByText(/FAAB guidance \(rule of thumb\)/)).toBeInTheDocument()
    expect(screen.getByText(/Not based on what others will bid/)).toBeInTheDocument()
  })

  it('averages over the weeks that have projections and says which are missing', async () => {
    mockFetch({ '/projections/nfl/2025/6': [], '/projections/nfl/2025/7': [] })
    renderApp('#/waivers')
    expect(await screen.findByText(/hasn't published projections for weeks 6, 7/)).toBeInTheDocument()
    expect(screen.getByText(/averaged over the 1 week that have them/)).toBeInTheDocument()
    const card = await firstCard()
    expect(within(card).getByText('+4.0')).toBeInTheDocument() // one week at +4, not three
  })

  it('says so when no free agent beats the current lineup', async () => {
    mockFetch({ '/projections/nfl/2025/5': projWith(5), '/projections/nfl/2025/6': projWith(5), '/projections/nfl/2025/7': projWith(5) })
    renderApp('#/waivers')
    expect(await screen.findByText(/No free agent improves your best lineup/)).toBeInTheDocument()
  })

  it('explains when Sleeper has not published this week\'s projections', async () => {
    mockFetch({ '/projections/nfl/2025/5': [] })
    renderApp('#/waivers')
    expect(await screen.findByText(/free agents can't be valued/)).toBeInTheDocument()
  })

  it('lists every evaluated free agent in a searchable table and opens details', async () => {
    const user = userEvent.setup()
    renderApp('#/waivers')
    const table = await screen.findByRole('table', { name: 'Evaluated free agents' })
    expect(within(table).getByText('F. Agentson')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'F. Agentson, details' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Adds \+12\.0 projected points/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Full player details/ })).toHaveAttribute('href', '#/players/fa1')
  })

  it('redirects a signed-out visitor to connect', async () => {
    resetStore()
    renderApp('#/waivers')
    expect(await screen.findByRole('heading', { name: 'Connect your Sleeper team' })).toBeInTheDocument()
  })
})

describe('phone navigation', () => {
  it('shows primary tabs plus a More sheet for the rest', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 })
    const [bottom] = screen.getAllByRole('navigation', { name: 'Primary' }).slice(-1)
    expect(within(bottom).getByRole('link', { name: 'Waivers' })).toBeInTheDocument()
    expect(within(bottom).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    await user.click(within(bottom).getByRole('button', { name: 'More' }))
    const dialog = await screen.findByRole('dialog')
    for (const name of ['Standings', 'Players', 'Settings']) expect(within(dialog).getByRole('link', { name })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // sheet closes on navigation
    expect(useAppStore.getState().username).toBe('me')
  })
})
