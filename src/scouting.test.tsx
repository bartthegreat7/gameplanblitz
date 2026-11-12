import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { winProbability } from './lib/scoring'
import { mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* Completed weeks 1-4: Rival (roster 2) scores 90, 120, 100, 140 against me. */
const week = (mine: number, theirs: number) => [
  { roster_id: 1, matchup_id: 1, points: mine, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'] },
  { roster_id: 2, matchup_id: 1, points: theirs, starters: ['opp1'], players: ['opp1'] },
]
const HISTORY = {
  '/league/L1/matchups/1': week(100, 90),
  '/league/L1/matchups/2': week(100, 120),
  '/league/L1/matchups/3': week(100, 100),
  '/league/L1/matchups/4': week(100, 140),
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch(HISTORY)
})
afterEach(() => vi.unstubAllGlobals())

const region = (name: string | RegExp) => screen.getByRole('region', { name })

describe('Opponent Scouting', () => {
  it('opens on this week\'s opponent with their record and form from Sleeper results', async () => {
    renderApp('#/scouting')
    // first render loads the lazy page and the chart library: slow once in jsdom
    expect(await screen.findByRole('heading', { name: 'Opponent Scouting', level: 1 }, { timeout: 25_000 })).toBeInTheDocument()
    expect(screen.getByLabelText('Team')).toHaveDisplayValue('Rival (your Week 5 opponent)')
    // Rival: L, W, T, W vs my 100s -> 2-1-1; avg 112.5; last 3 avg 120
    expect(await screen.findByText(/2-1-1 · 112\.5 pts\/game · streak W1/)).toBeInTheDocument()
    const results = region('Results this season')
    expect(within(results).getByText(/average 112\.5 · last 3 120\.0 \(steady\) · high 140\.0 · low 90\.0/)).toBeInTheDocument()
    expect(within(results).getByText('Sleeper fact')).toBeInTheDocument()
  }, 30_000)

  it('compares best projected lineups as a labeled model estimate', async () => {
    renderApp('#/scouting')
    const h2h = await screen.findByRole('region', { name: 'Week 5 head-to-head' })
    expect(within(h2h).getByText('Model')).toBeInTheDocument()
    // me: RB 8 + WR 10 = 18; them: RB 6, no WR = 6
    expect(within(h2h).getByText('18.0')).toBeInTheDocument()
    expect(within(h2h).getByText('6.0')).toBeInTheDocument()
    expect(within(h2h).getByText(`${Math.round(100 * winProbability(18, 6))}%`)).toBeInTheDocument()
    expect(within(h2h).getByRole('img', { name: 'WR: you 10.0, them 0.0' })).toBeInTheDocument()
  })

  it('reports their set lineup as facts, without predicting changes', async () => {
    renderApp('#/scouting')
    const facts = await screen.findByRole('region', { name: 'Their lineup in Sleeper (Week 5)' })
    expect(within(facts).getByText('Sleeper fact')).toBeInTheDocument()
    expect(within(facts).getByText(/Empty starting slot/)).toHaveTextContent('Empty starting slot: WR')
  })

  it('ranks their position groups against the league', async () => {
    renderApp('#/scouting')
    const s = await screen.findByRole('region', { name: 'Strengths and weaknesses' })
    const table = within(s).getByRole('table', { name: /Projected points by position group/ })
    const wr = within(table).getByRole('row', { name: /^WR/ })
    expect(wr).toHaveTextContent('0.0') // no WR on their roster
    expect(wr).toHaveTextContent('2nd of 2')
    expect(within(s).getByText(/Weakest:/)).toBeInTheDocument()
  })

  it('lists results as an accessible table alternative to the chart', async () => {
    const user = userEvent.setup()
    renderApp('#/scouting')
    const results = await screen.findByRole('region', { name: 'Results this season' })
    await user.click(within(results).getByText('Results as a table'))
    expect(within(results).getByText(/Week 4: 140\.0 vs 100\.0 \(Gridiron Gang\)/)).toBeInTheDocument()
  })

  it('says results are unavailable (not "no games") when they fail to load', async () => {
    mockFetch({}) // weeks 1-4 return 404
    renderApp('#/scouting')
    expect(await screen.findByText("Past results couldn't be loaded.", {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText('Results unavailable')).toBeInTheDocument()
    expect(screen.queryByText('No completed games yet')).not.toBeInTheDocument()
  }, 15_000)

  it('is reachable from the navigation', async () => {
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 })
    expect(screen.getAllByRole('link', { name: 'Scouting' }).length).toBeGreaterThan(0)
  })
})
