import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAppStore } from './store/app'
import { failing, LEAGUE, mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* My roster: rb1 (drafted rd 3, a keeper this year and last year), wr1 (drafted rd 10), rb2 (undrafted).
   Dynasty values make rb1 #1 and wr1 #2 among players; in a 2-team league both are 1st-round value. */
const league = { ...LEAGUE, draft_id: 'D1', previous_league_id: 'P1' }
const ROUTES = {
  '/league/L1': league,
  '/user/u1/leagues/nfl/2025': [league],
  '/league/P1': { ...LEAGUE, league_id: 'P1', season: '2024', draft_id: 'D0', previous_league_id: null },
  '/draft/D1/picks': [
    { round: 3, pick_no: 5, player_id: 'rb1', roster_id: 1, is_keeper: true },
    { round: 10, pick_no: 19, player_id: 'wr1', roster_id: 1, is_keeper: null },
  ],
  '/draft/D0/picks': [{ round: 4, pick_no: 7, player_id: 'rb1', roster_id: 1, is_keeper: true }],
  '/values/current': [
    { player: { sleeperId: 'rb1', position: 'RB' }, value: 5000, overallRank: 1 },
    { player: { sleeperId: 'wr1', position: 'WR' }, value: 4000, overallRank: 2 },
    { player: { name: '2027 1st', position: 'PICK' }, value: 4500, overallRank: 2 },
    { player: { sleeperId: 'opp1', position: 'RB' }, value: 100, overallRank: 9 },
  ],
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch(ROUTES)
})
afterEach(() => vi.unstubAllGlobals())

const table = () => screen.getByRole('table', { name: 'Keeper cost and value by player' })
const rowOf = (name: RegExp) => within(table()).getByRole('row', { name })

describe('Keeper Intelligence', () => {
  it('recommends the keeper who saves the most draft value under default rules', async () => {
    renderApp('#/keepers')
    const rec = await screen.findByRole('region', { name: 'Recommended keepers' }, { timeout: 15_000 })
    // wr1: costs round 10, market round 1 (rank #2 among players; picks are not counted) -> saves 9
    expect(within(rec).getByText('Wideout Catchwell')).toBeInTheDocument()
    expect(within(rec).getByText(/saves 9 rounds/)).toBeInTheDocument()
    expect(within(rec).getByText(/Recommended keepers \(1 of 1\)/)).toBeInTheDocument()
  }, 20_000)

  it('derives years kept from previous drafts and escalates the cost', async () => {
    renderApp('#/keepers')
    await screen.findByRole('region', { name: 'Recommended keepers' })
    // rb1: drafted round 3 this year, a keeper this year and last -> 2 years kept -> round 1
    const rb1 = rowOf(/Rusher Runnerson/)
    expect(rb1).toHaveTextContent('2 yr')
    expect(rb1).toHaveTextContent('Rd 1')
    expect(rowOf(/Backup Benchwood/)).toHaveTextContent('Undrafted')
  })

  it('applies my rules: a years limit makes a player ineligible, and is saved for this league', async () => {
    const user = userEvent.setup()
    renderApp('#/keepers')
    await screen.findByRole('region', { name: 'Recommended keepers' })
    const max = screen.getByLabelText(/Max years kept/)
    await user.clear(max)
    await user.type(max, '2')
    expect(rowOf(/Rusher Runnerson/)).toHaveTextContent('Ineligible')
    expect(useAppStore.getState().keeperRules.L1.maxYears).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(useAppStore.getState().keeperRules.L1).toBeUndefined()
  })

  it('with free keepers, recommends the most valuable player', async () => {
    const user = userEvent.setup()
    renderApp('#/keepers')
    const rec = await screen.findByRole('region', { name: 'Recommended keepers' })
    await user.selectOptions(screen.getByLabelText('Keeper cost'), 'No cost')
    expect(within(rec).getByText('Rusher Runnerson')).toBeInTheDocument()
    expect(within(rec).getByText(/Free to keep/)).toBeInTheDocument()
  })

  it('explains a player in a drawer with sources', async () => {
    const user = userEvent.setup()
    renderApp('#/keepers')
    await screen.findByRole('region', { name: 'Recommended keepers' })
    await user.click(within(table()).getByRole('button', { name: 'Wideout Catchwell, details' }))
    const d = await screen.findByRole('dialog')
    expect(within(d).getByText(/Costs a 10th-round pick \(drafted in round 10\)/)).toBeInTheDocument()
    expect(within(d).getByText('FantasyCalc dynasty values')).toBeInTheDocument()
  })

  it('says when no draft is linked, treating everyone as undrafted', async () => {
    mockFetch({ ...ROUTES, '/league/L1': LEAGUE, '/user/u1/leagues/nfl/2025': [LEAGUE] })
    renderApp('#/keepers')
    expect(await screen.findByText(/No Sleeper draft is linked to this league/)).toBeInTheDocument()
  })

  it('degrades when market values cannot load', async () => {
    mockFetch({ ...ROUTES, '/values/current': failing() })
    renderApp('#/keepers')
    expect(await screen.findByText(/FantasyCalc values couldn't be loaded/, {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText('Market values are needed to compare keepers.')).toBeInTheDocument()
  }, 15_000)

  it('is reachable from the navigation', async () => {
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 })
    expect(screen.getAllByRole('link', { name: 'Keepers' }).length).toBeGreaterThan(0)
  })
})
