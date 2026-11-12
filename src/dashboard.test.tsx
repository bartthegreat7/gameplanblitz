import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { winProbability } from './lib/scoring'
import { LEAGUE, mockFetch, PLAYERS, renderApp, resetStore } from './test/mockSleeper'

/* Mock league, Week 5: my best lineup rb1 (8) + wr1 (10) = 18 vs Rival's 6. Free agent fa1 (12)
   beats rb1 by 4 a week. I'm 3-1, Rival 1-3, one playoff spot. */
const SLOW = { timeout: 15_000 }
const H = 3_600_000
const newsFile = () => {
  const now = Date.now()
  const a = (id: string, hoursAgo: number, publisher: string) => ({
    id,
    title: `Headline ${id}`,
    url: `https://www.pub.com/${id}`,
    publisher,
    publisherId: publisher.toLowerCase(),
    kind: 'article',
    author: null,
    excerpt: '',
    image: null,
    tags: [],
    categories: [],
    players: [],
    ts: now - hoursAgo * H,
    published: new Date(now - hoursAgo * H).toISOString(),
  })
  return {
    version: 1,
    updated: new Date(now).toISOString(),
    playersMatched: true,
    categories: [],
    publishers: ['4for4', 'FantasyPros', 'RotoWire'],
    sources: [],
    unavailable: [{ name: 'Draft Sharks', reason: 'No public feed' }],
    articles: [
      a('old', 30, 'RotoWire'),
      a('newest', 1, '4for4'),
      a('mid', 3, 'FantasyPros'),
      a('second', 2, 'RotoWire'),
    ],
  }
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

describe('dashboard', () => {
  it('welcomes the user and shows the weekly game plan from the Fantasy GM', async () => {
    renderApp()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back, Me' }, SLOW),
    ).toBeInTheDocument()
    const plan = screen.getByRole('region', { name: 'Your Weekly Game Plan' })
    const add = await within(plan).findByRole(
      'link',
      { name: /Add F\. Agentson, drop B\. Benchwood/ },
      SLOW,
    )
    expect(add).toHaveAttribute('href', '#/waivers')
    expect(within(plan).getByRole('link', { name: /Fantasy GM/ })).toHaveAttribute('href', '#/gm')
  }, 30_000)

  it('shows projected score vs the league average, win probability and playoff odds', async () => {
    renderApp()
    const proj = await screen.findByRole('region', { name: 'Projected Score' }, SLOW)
    expect(within(proj).getByText('18.0')).toBeInTheDocument()
    expect(within(proj).getByText(/\+6\.0/)).toBeInTheDocument() // league average (18 + 6) / 2 = 12
    const win = screen.getByRole('region', { name: 'Win Probability' })
    const p = Math.round(100 * winProbability(18, 6))
    expect(within(win).getByText(`${p}%`)).toBeInTheDocument()
    expect(within(win).getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(p))
    const odds = screen.getByRole('region', { name: 'Playoff Odds' })
    expect(await within(odds).findByText('100%', {}, SLOW)).toBeInTheDocument() // 3-1 vs 1-3, one game left, one spot
  }, 30_000)

  it('shows the matchup with records, projections and the win chance', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: "This Week's Matchup" }, SLOW)
    expect(within(card).getByText('Gridiron Gang')).toBeInTheDocument()
    expect(within(card).getByText('3-1 (1st)')).toBeInTheDocument()
    expect(within(card).getByText('1-3 (2nd)')).toBeInTheDocument()
    expect(within(card).getByText('Proj. 18.0')).toBeInTheDocument()
    expect(
      within(card).getByText(`${Math.round(100 * winProbability(18, 6))}% Win Chance`),
    ).toBeInTheDocument()
  }, 30_000)

  it('shows the playoff race without bye or division rows the league does not have', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'Playoff Race' }, SLOW)
    expect(await within(card).findByText('Make Playoffs', {}, SLOW)).toBeInTheDocument()
    expect(within(card).getByText('Win League')).toBeInTheDocument()
    expect(within(card).queryByText(/Bye/)).not.toBeInTheDocument()
    expect(within(card).queryByText('Win Division')).not.toBeInTheDocument()
  }, 30_000)

  it('says division odds are not modeled when the league has divisions', async () => {
    const league = { ...LEAGUE, settings: { ...LEAGUE.settings, divisions: 2 } }
    mockFetch({ '/league/L1': league, '/user/u1/leagues/nfl/2025': [league] })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Playoff Race' }, SLOW)
    expect(await within(card).findByText('Not modeled', {}, SLOW)).toBeInTheDocument()
  }, 30_000)

  it('shows an unavailable state once the regular season is over', async () => {
    const league = { ...LEAGUE, settings: { ...LEAGUE.settings, playoff_week_start: 5 } }
    mockFetch({ '/league/L1': league, '/user/u1/leagues/nfl/2025': [league] })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Playoff Race' }, SLOW)
    expect(within(card).getByText(/regular season is over/)).toBeInTheDocument()
  }, 30_000)

  it('toggles the lineup between optimized and as set, marking benched starters', async () => {
    const user = userEvent.setup()
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Optimal Lineup' }, SLOW)
    const row = (name: RegExp) => within(card).getByRole('row', { name })
    expect(row(/B\. Benchwood/)).toHaveTextContent('Start')
    await user.click(within(card).getByRole('button', { name: 'My Lineup' }))
    expect(within(card).getByRole('button', { name: 'My Lineup' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(row(/R\. Runnerson/)).toHaveTextContent('Bench')
    expect(row(/W\. Catchwell/)).toHaveTextContent('Start')
  }, 30_000)

  it('lists waiver targets that are free agents in this league, with the suggested drop', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'Top Waiver Targets' }, SLOW)
    const item = (await within(card).findAllByRole('listitem', {}, SLOW))[0]
    expect(item).toHaveTextContent('F. Agentson')
    expect(item).toHaveTextContent('drop B. Benchwood')
    expect(item).toHaveTextContent('+4.0')
    expect(within(item).getByRole('link', { name: 'Review adding F. Agentson' })).toHaveAttribute(
      'href',
      '#/waivers',
    )
  }, 30_000)

  it('shows the newest articles linking to the publishers, and lists unavailable sources', async () => {
    mockFetch({ '/news.json': newsFile() })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Latest Fantasy News' }, SLOW)
    const links = await within(card).findAllByRole('link', { name: /Headline/ }, SLOW)
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      'https://www.pub.com/newest',
      'https://www.pub.com/second',
      'https://www.pub.com/mid',
    ])
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(
      within(card).getByText(/Not available \(no public feed\): Draft Sharks/),
    ).toBeInTheDocument()
  }, 30_000)

  it('explains when the news feed has not been published', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'Latest Fantasy News' }, SLOW)
    expect(await within(card).findByText(/hasn't been published yet/, {}, SLOW)).toBeInTheDocument()
  }, 30_000)

  it('keeps the original tools below', async () => {
    renderApp()
    const more = await screen.findByRole('region', { name: 'More tools' }, SLOW)
    for (const name of [
      'Game Day',
      'The Edge',
      'Trade Machine',
      'Waiver Bids',
      'My Roster',
      'Player Value',
    ])
      expect(within(more).getByRole('region', { name })).toBeInTheDocument()
  }, 30_000)
})
