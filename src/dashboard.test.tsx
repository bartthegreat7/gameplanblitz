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
    expect(within(plan).getByRole('link', { name: /View Details/ })).toHaveAttribute('href', '#/gm')
    // a personal greeting, no emoji
    expect(screen.getByRole('heading', { level: 1 }).parentElement).not.toHaveTextContent('👋')
  }, 30_000)

  it('shows the week at a glance: projected points vs league, win probability, playoff odds, standing, The Edge', async () => {
    renderApp()
    const bar = await screen.findByRole('region', { name: 'This week at a glance' }, SLOW)
    const cell = (name: string) => within(bar).getByRole('link', { name })
    expect(cell('Projected Points')).toHaveTextContent('18.0')
    expect(cell('Projected Points')).toHaveTextContent('+6.0 vs. league avg') // 18 vs average of (18 + 6) / 2
    const p = Math.round(100 * winProbability(18, 6))
    expect(cell('Win Probability')).toHaveTextContent(`${p}%`)
    expect(cell('League Standing')).toHaveTextContent('1st of 2')
    expect(cell('League Standing')).toHaveTextContent('3-1')
    expect(await within(cell('Playoff Odds')).findByText('100%', {}, SLOW)).toBeInTheDocument()
    expect(cell('The Edge')).toHaveAttribute('href', '#/edge')
  }, 30_000)

  it('shows the matchup with records, projections and the win chance', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: "This Week's Matchup" }, SLOW)
    expect(within(card).getByText('Gridiron Gang')).toBeInTheDocument()
    expect(within(card).getByText('3-1 (1st)')).toBeInTheDocument()
    expect(within(card).getByText('1-3 (2nd)')).toBeInTheDocument()
    expect(within(card).getByText('18.0')).toBeInTheDocument()
    const p = Math.round(100 * winProbability(18, 6))
    expect(within(card).getByRole('progressbar', { name: 'Win probability' })).toHaveTextContent(
      `${p}% Win Chance`,
    )
    expect(within(card).getByRole('link', { name: 'Scout' })).toHaveAttribute('href', '#/scouting')
  }, 30_000)

  it('shows the key game weather in the matchup (my QB-slot starter, here rb1 at AAA)', async () => {
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    const hourly = {
      time: [] as string[],
      temperature_2m: [] as number[],
      precipitation_probability: [] as number[],
      precipitation: [] as number[],
      snowfall: [] as number[],
      wind_speed_10m: [] as number[],
      wind_gusts_10m: [] as number[],
      weather_code: [] as number[],
    }
    for (let i = 0; i < 24; i++) {
      hourly.time.push(`${date}T${String(i).padStart(2, '0')}:00`)
      hourly.temperature_2m.push(52)
      hourly.precipitation_probability.push(60)
      hourly.precipitation.push(0.01)
      hourly.snowfall.push(0)
      hourly.wind_speed_10m.push(12)
      hourly.wind_gusts_10m.push(18)
      hourly.weather_code.push(61)
    }
    mockFetch({
      '/schedule/nfl/regular/2025': [
        { game_id: 'x', week: 5, status: 'pre_game', date, home: 'NYG', away: 'AAA' },
      ],
      '/v1/forecast': { hourly },
    })
    renderApp()
    const card = await screen.findByRole('region', { name: "This Week's Matchup" }, SLOW)
    expect(await within(card).findByText('52°F', {}, SLOW)).toBeInTheDocument()
    expect(within(card).getByText('Rain · 12 mph')).toBeInTheDocument()
    expect(within(card).getByText('MetLife Stadium')).toBeInTheDocument()
    expect(within(card).getByText(/R\. Runnerson · AAA @ NYG/)).toBeInTheDocument()
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

  it('shows the optimized lineup with a weather column and an Optimize link', async () => {
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Optimal Lineup' }, SLOW)
    const row = (name: RegExp) => within(card).getByRole('row', { name })
    // rb1 is Out: the optimized lineup starts rb2 at RB
    expect(row(/B\. Benchwood/)).toHaveTextContent('Start')
    expect(within(card).queryByRole('row', { name: /R\. Runnerson/ })).not.toBeInTheDocument()
    expect(within(card).getByRole('columnheader', { name: 'Weather' })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Optimize' })).toHaveAttribute('href', '#/lineup')
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
      'https://www.pub.com/old',
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

  it('keeps every original tool one click away in Quick access, with live summaries', async () => {
    const user = userEvent.setup()
    renderApp()
    const qa = await screen.findByRole('region', { name: 'Quick access' }, SLOW)
    expect(within(qa).getByRole('button', { name: 'Waiver Bids' })).toHaveAccessibleDescription(
      '$100 of $100 left · bid sheet',
    )
    expect(within(qa).getByRole('button', { name: 'Free-Agent Edge' })).toHaveAccessibleDescription(
      /1 free-agent upgrade/,
    )
    const tools: [string, string][] = [
      ['Position Battles', 'Game Day'],
      ['Lineup Check', 'Lineup Check'],
      ['Free-Agent Edge', 'Free-Agent Edge'],
      ['Trade Machine', 'Trade Machine'],
      ['Waiver Wire', 'Waiver Wire'],
      ['Waiver Bids', 'Waiver Bids'],
      ['News & Injuries', 'News & Injuries'],
      ['My Roster', 'My Roster'],
      ['Player Value', 'Player Value'],
    ]
    for (const [label, region] of tools) {
      await user.click(within(qa).getByRole('button', { name: label }))
      const panel = await screen.findByRole('dialog', { name: label })
      expect(within(panel).getByRole('region', { name: region })).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  }, 30_000)
})
