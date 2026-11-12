import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { failing, LEAGUE, mockFetch, renderApp, resetStore } from './test/mockSleeper'

const SLOW = { timeout: 5000 }

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

async function openAnalyzer() {
  const user = userEvent.setup()
  renderApp('#/trades')
  await user.click(await screen.findByRole('button', { name: 'Analyze a trade' }))
  return user
}

describe('Trade War Room', () => {
  it('explains both lenses and shows an empty state when no fair swap helps both teams', async () => {
    renderApp('#/trades')
    expect(await screen.findByRole('heading', { name: 'Trade War Room', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/market value on FantasyCalc's redraft scale/)).toBeInTheDocument()
    // the only priced players are worth 1000 and 100: nothing is fair
    expect(await screen.findByText(/No fair 1-for-1 swap improves both lineups/)).toBeInTheDocument()
  }, 30_000)

  it('analyzes a hand-built trade from both sides', async () => {
    const user = await openAnalyzer()
    expect(screen.getByLabelText('Trade with')).toHaveValue('2')
    await user.click(within(screen.getByRole('group', { name: 'You give' })).getByRole('checkbox', { name: /R\. Runnerson/ }))
    await user.click(within(screen.getByRole('group', { name: 'You get' })).getByRole('checkbox', { name: /R\. Runningback/ }))

    const result = screen.getByRole('region', { name: 'Trade evaluation' })
    // me: RB slot 8 -> 6 (-2/wk); them: RB slot 6 -> 8 (+2/wk), 3 weeks each
    expect(within(result).getByText('−6.0')).toBeInTheDocument()
    expect(within(result).getByText('+6.0')).toBeInTheDocument()
    expect(within(result).getByText('Helps them')).toBeInTheDocument()
    expect(within(result).getByText('10% fair on value')).toBeInTheDocument() // 100 vs 1000
    expect(within(result).getByText(/RB AAA · 1,000/)).toBeInTheDocument() // each asset shows its market value
    expect(within(result).getByText(/may need more \(estimate\)/)).toBeInTheDocument()
  })

  it("shows how the trade moves both teams' playoff and title odds (model)", async () => {
    const user = await openAnalyzer()
    await user.click(within(screen.getByRole('group', { name: 'You give' })).getByRole('checkbox', { name: /R\. Runnerson/ }))
    await user.click(within(screen.getByRole('group', { name: 'You get' })).getByRole('checkbox', { name: /R\. Runningback/ }))
    const impact = await screen.findByRole('region', { name: 'Playoff impact' }, { timeout: 15_000 })
    const row = (name: RegExp) => within(impact).getAllByRole('row').find((r) => name.test(r.textContent ?? ''))!
    expect(row(/^You/)).toHaveTextContent('−2.0 pts') // -6 over 3 weeks
    expect(row(/^Rival/)).toHaveTextContent('+2.0 pts')
    expect(row(/^You/)).toHaveTextContent(/%.*→.*%/)
    expect(impact).toHaveTextContent(/same random draws before and after/)
    expect(impact).toHaveTextContent(/separate from trade fairness/)
  })

  it('shows reasoning and copies an offer written for the recipient', async () => {
    const user = await openAnalyzer()
    await user.click(within(screen.getByRole('group', { name: 'You give' })).getByRole('checkbox', { name: /R\. Runnerson/ }))
    await user.click(within(screen.getByRole('group', { name: 'You get' })).getByRole('checkbox', { name: /R\. Runningback/ }))
    const result = screen.getByRole('region', { name: 'Trade evaluation' })

    await user.click(within(result).getByRole('button', { name: 'Why?' }))
    expect(within(result).getByText(/Lopsided on value \(10% fair\)/)).toBeInTheDocument()
    expect(within(result).getAllByText(/Sleeper projections/).length).toBeGreaterThan(0)

    await user.click(within(result).getByRole('button', { name: 'Copy offer text' }))
    expect(await within(result).findByText('Copied ✓')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(
      'Trade offer to Rival:\nYou get Rusher Runnerson\nYou give Rival Runningback\n(drafted with GameplanBlitz)',
    )
  })

  it('prompts for a selection before evaluating', async () => {
    await openAnalyzer()
    expect(screen.getByText(/Pick players on either side/)).toBeInTheDocument()
  })

  it('degrades with a notice when trade values cannot load', async () => {
    mockFetch({ '/values/current': failing() })
    renderApp('#/trades')
    expect(await screen.findByText(/FantasyCalc values couldn't be loaded/, {}, SLOW)).toBeInTheDocument()
    expect(screen.getByText('Trade values are unavailable right now.')).toBeInTheDocument()
  })

  it('offers priced draft picks in a dynasty league, on the same scale as players', async () => {
    const dynasty = { ...LEAGUE, settings: { ...LEAGUE.settings, type: 2, draft_rounds: 2 } }
    mockFetch({
      '/league/L1': dynasty,
      '/user/u1/leagues/nfl/2025': [dynasty],
      '/league/L1/traded_picks': [{ season: '2027', round: 2, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
      '/values/current': [
        { player: { sleeperId: 'rb1', name: 'Rusher Runnerson', position: 'RB' }, value: 1000, overallRank: 10 },
        { player: { sleeperId: 'opp1', name: 'Rival Runningback', position: 'RB' }, value: 900, overallRank: 20 },
        { player: { name: '2027 1st', position: 'PICK' }, value: 2700, overallRank: 5 },
        { player: { name: '2027 2nd', position: 'PICK' }, value: 1500, overallRank: 9 },
      ],
    })
    const user = await openAnalyzer()
    expect(screen.getByText(/Dynasty league: players and picks are priced on FantasyCalc's dynasty scale/)).toBeInTheDocument()
    const give = screen.getByRole('group', { name: 'You give' })
    // my own 1st and 2nd, plus Rival's 2nd that I acquired
    expect(within(give).getByRole('checkbox', { name: /2027 1st-round pick/ })).toBeInTheDocument()
    expect(within(give).getByRole('checkbox', { name: /2027 2nd-round pick \(from Rival\)/ })).toBeInTheDocument()
    const get = screen.getByRole('group', { name: 'You get' })
    expect(within(get).queryByRole('checkbox', { name: /2nd-round/ })).not.toBeInTheDocument() // they traded it to me

    await user.click(within(give).getByRole('checkbox', { name: /^2027 1st-round pick/ }))
    await user.click(within(get).getByRole('checkbox', { name: /R\. Runningback/ }))
    const result = screen.getByRole('region', { name: 'Trade evaluation' })
    expect(within(result).getByText('33% fair on value')).toBeInTheDocument() // 2700 pick for a 900 player
    expect(within(result).getByText(/value 2,700/)).toBeInTheDocument()
  })

  it('is reachable from the navigation', async () => {
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 })
    expect(screen.getAllByRole('link', { name: 'Trades' }).length).toBeGreaterThan(0)
  })

  it('redirects a signed-out visitor to connect', async () => {
    resetStore()
    renderApp('#/trades')
    expect(await screen.findByRole('heading', { name: 'Connect your Sleeper team' })).toBeInTheDocument()
  })
})
