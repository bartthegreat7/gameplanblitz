import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* wr1 (mine): value down 20% in 30 days, usage steady (12 touches + targets a game) -> buy low.
   fa1 (free agent): value up 25%, usage falling 14 -> 6 -> sell high. rb1: no trend data. */
const SLOW = { timeout: 15_000 }
const line = (o: Record<string, number>) => ({ gp: 1, tm_off_snp: 60, off_snp: 40, ...o })
const week = (w: number) => [
  { player_id: 'wr1', team: 'AAA', week: w, stats: line({ rec_tgt: 8, rec: 4, rec_yd: 50 }) },
  {
    player_id: 'fa1',
    team: 'BBB',
    week: w,
    stats: line(w <= 2 ? { rush_att: 12, rec: 2 } : { rush_att: 5, rec: 1 }),
  },
]
const routes = {
  '/values/current': [
    {
      player: { sleeperId: 'wr1' },
      value: 800,
      overallRank: 20,
      trend30Day: -200,
      positionRank: 9,
    },
    {
      player: { sleeperId: 'fa1' },
      value: 500,
      overallRank: 60,
      trend30Day: 100,
      positionRank: 30,
    },
    { player: { sleeperId: 'rb1' }, value: 1000, overallRank: 10 },
  ],
  ...Object.fromEntries([1, 2, 3, 4].map((w) => [`/stats/nfl/2025/${w}`, week(w)])),
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch(routes)
})
afterEach(() => vi.unstubAllGlobals())

describe('Player Stock Market', () => {
  it('shows market value, its 30-day change and buy-low / sell-high calls with reasons', async () => {
    renderApp('#/market')
    const table = await screen.findByRole(
      'table',
      { name: 'Player market values and signals' },
      SLOW,
    )
    const row = (name: RegExp) =>
      within(table)
        .getAllByRole('row')
        .find((r) => name.test(r.textContent ?? ''))!
    await vi.waitFor(() => expect(row(/Wideout Catchwell/)).toHaveTextContent('Buy low'))
    expect(row(/Wideout Catchwell/)).toHaveTextContent('−200')
    expect(row(/Wideout Catchwell/)).toHaveTextContent('-20%')
    expect(row(/Wideout Catchwell/)).toHaveTextContent(
      /Market value down 20% in 30 days, but his opportunity is steady/,
    )
    expect(row(/Free Agentson/)).toHaveTextContent('Sell high')
    expect(row(/Free Agentson/)).toHaveTextContent(/opportunity fell \(14\.0 → 6\.0/)
    expect(row(/Rusher Runnerson/)).not.toHaveTextContent(/Buy low|Sell high/)
  })

  it('filters to my team, free agents and each signal', async () => {
    const user = userEvent.setup()
    renderApp('#/market')
    const table = await screen.findByRole(
      'table',
      { name: 'Player market values and signals' },
      SLOW,
    )
    await user.click(await screen.findByRole('button', { name: 'Buy low (1)' }, SLOW))
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual([expect.stringMatching(/Wideout Catchwell/)])
    await user.click(screen.getByRole('button', { name: 'Free agents' }))
    expect(within(table).queryByText('Wideout Catchwell')).not.toBeInTheDocument()
    expect(within(table).getByText('Free Agentson')).toBeInTheDocument()
  })
})
