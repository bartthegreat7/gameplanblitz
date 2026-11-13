import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { winProbability } from './lib/scoring'
import { LEAGUE, mockFetch, PLAYERS, renderApp, resetStore, SCHEDULE } from './test/mockSleeper'

/* Mock league, Week 5: my best lineup rb1 (8) + wr1 (10) = 18 vs Rival's 6. Free agent fa1 (12)
   beats rb1 by 4 a week. I'm 3-1, Rival 1-3, one playoff spot. Every player is on AAA, which hosts
   CCC in Week 5. */
const SLOW = { timeout: 15_000 }
const H = 3_600_000
const newsFile = () => {
  const now = Date.now()
  const a = (id: string, hoursAgo: number, publisher: string, players: { id: string; name: string }[] = []) => ({
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
    players,
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
      a('newest', 1, '4for4', [{ id: 'rb1', name: 'Rusher Runnerson' }]),
      a('mid', 3, 'FantasyPros'),
      a('second', 2, 'RotoWire'),
    ],
  }
}

/** A Week 5 game two days out (CCC at AAA, my players' team) with a forecast for every hour. */
function weatherMock(wind: number, code = 61) {
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
    hourly.wind_speed_10m.push(wind)
    hourly.wind_gusts_10m.push(wind + 6)
    hourly.weather_code.push(code)
  }
  return {
    '/schedule/nfl/regular/2025': [{ game_id: 'x', week: 5, status: 'pre_game', date, home: 'NYG', away: 'AAA' }],
    '/v1/forecast': { hourly },
  }
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

const p = Math.round(100 * winProbability(18, 6))

describe('command center header', () => {
  it('titles the page, greets the user by name and offers six working tabs', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fantasy Football Command Center' }, SLOW),
    ).toBeInTheDocument()
    expect(screen.getByText('Your AI-powered war room for a championship season.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 2, name: /^Good (Morning|Afternoon|Evening), Me$/ }, SLOW),
    ).toBeInTheDocument()
    expect(screen.getByText(/Week 5 is here\. You're projected to win by/)).toHaveTextContent('12.0 points')

    const tabs = within(screen.getByRole('tablist', { name: 'Command Center views' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Team', 'Matchup', 'League', 'Leaders', 'Strategy', 'Reports'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    // arrow keys move between tabs and show the matching panel
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Team' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Team Health' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Reports' }))
    expect(within(screen.getByRole('tabpanel', { name: 'Reports' })).getByRole('heading', { name: 'Weekly report' })).toBeInTheDocument()
  }, 30_000)

  it('opens a tab from the address (shareable views)', async () => {
    renderApp('#/?tab=league')
    expect(await screen.findByRole('tab', { name: 'League', selected: true }, SLOW)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Playoff Race' }, SLOW)).toBeInTheDocument()
  }, 30_000)
})

describe('overview: the four stat cards', () => {
  it('shows win probability with margin and opponent, both projections, team health and playoff odds', async () => {
    renderApp()
    const welcome = await screen.findByRole('region', { name: 'Welcome' }, SLOW)
    const card = (name: RegExp) => within(welcome).getByRole('link', { name })
    expect(card(/Win Probability/)).toHaveTextContent(`${p}%`)
    expect(card(/Win Probability/)).toHaveTextContent('▲ +12.0 pts')
    expect(card(/Win Probability/)).toHaveTextContent(/against Rival/)
    expect(within(card(/Win Probability/)).getByRole('img', { name: `${p}% win probability` })).toBeInTheDocument()
    expect(card(/Projected Points/)).toHaveTextContent('18.0')
    expect(card(/Projected Points/)).toHaveTextContent('Opp: 6.0')
    expect(card(/Team Health/)).toHaveTextContent('100%')
    expect(card(/Team Health/)).toHaveTextContent('All starters available')
    expect(card(/Team Health/)).toHaveTextContent('2 of 2 starters available')
    expect(await within(card(/Playoff Odds/)).findByText('100%', {}, SLOW)).toBeInTheDocument()
    expect(card(/Playoff Odds/)).toHaveTextContent('First snapshot in this browser')
    expect(card(/Playoff Odds/)).toHaveAttribute('href', '#/playoffs')
  }, 30_000)

  it('flags a starter who is out, and compares playoff odds with an earlier snapshot', async () => {
    localStorage.setItem('gb-odds-L1', JSON.stringify([{ day: '2020-01-01', week: 4, pct: 80 }]))
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp()
    const welcome = await screen.findByRole('region', { name: 'Welcome' }, SLOW)
    const health = within(welcome).getByRole('link', { name: /Team Health/ })
    expect(await within(health).findByText('50%', {}, SLOW)).toBeInTheDocument()
    expect(health).toHaveTextContent("1 concern · 1 can't play")
    expect(health).toHaveTextContent('1 of 2 starters available')
    expect(health).toHaveTextContent(/R\. Runnerson \(Out\)/)
    const odds = within(welcome).getByRole('link', { name: /Playoff Odds/ })
    expect(await within(odds).findByText(/\+20% since 1\/1/, {}, SLOW)).toBeInTheDocument()
  }, 30_000)
})

describe('overview: matchup and action items', () => {
  it('shows the matchup with records, projections, the win chance and Full Analysis', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: "This Week's Matchup" }, SLOW)
    expect(within(card).getByText('Gridiron Gang')).toBeInTheDocument()
    expect(within(card).getByText('3-1 (1st)')).toBeInTheDocument()
    expect(within(card).getByText('1-3 (2nd)')).toBeInTheDocument()
    expect(card).toHaveTextContent('18.0 – 6.0')
    expect(within(card).getByRole('progressbar', { name: 'Win probability' })).toHaveTextContent(`${p}% Win Chance`)
    expect(within(card).getByRole('link', { name: 'Full Analysis' })).toHaveAttribute('href', '#/?tab=matchup')
  }, 30_000)

  it('lists the week checklist, verified against the data, each linking to its tool', async () => {
    const user = userEvent.setup()
    renderApp()
    const card = await screen.findByRole('region', { name: 'Top Action Items' }, SLOW)
    expect(within(card).getAllByRole('listitem')).toHaveLength(3) // top 3, attention first
    await user.click(within(card).getByRole('button', { name: /Show all 6 checks/ }))
    const waivers = await within(card).findByRole('link', { name: /Investigate high-value waivers \(Needs attention\)/ }, SLOW)
    expect(waivers).toHaveAccessibleName(/best is F\. Agentson \(\+4\.0 pts\/wk\)/)
    expect(waivers).toHaveTextContent('Investigate high-value waivers (1)')
    expect(waivers).toHaveAttribute('href', '#/waivers')
    // the lineup as set already is the best one: done, from the data
    expect(within(card).getByRole('link', { name: /Lineup is optimal \(Done\)/ })).toHaveAttribute('href', '#/lineup')
    expect(within(card).getByRole('link', { name: /No questionable starters \(Done\)/ })).toBeInTheDocument()
  }, 30_000)
})

describe('matchup view', () => {
  it('shows the key game weather (my first starter, rb1 at AAA)', async () => {
    mockFetch(weatherMock(12))
    renderApp('#/?tab=matchup')
    const card = await screen.findByRole('region', { name: "This Week's Matchup" }, SLOW)
    expect(await within(card).findByText('52°F', {}, SLOW)).toBeInTheDocument()
    expect(within(card).getByText('Rain · 12 mph')).toBeInTheDocument()
    expect(within(card).getByText('MetLife Stadium')).toBeInTheDocument()
    expect(within(card).getByText(/R\. Runnerson · AAA @ NYG/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Scout' })).toHaveAttribute('href', '#/scouting')
    expect(screen.getByRole('region', { name: 'Game Day' })).toBeInTheDocument() // position battles
  }, 30_000)
})

describe('league view', () => {
  it('shows the playoff race without bye or division rows the league does not have', async () => {
    renderApp('#/?tab=league')
    const card = await screen.findByRole('region', { name: 'Playoff Race' }, SLOW)
    expect(await within(card).findByText('Make Playoffs', {}, SLOW)).toBeInTheDocument()
    expect(within(card).getByText('Win League')).toBeInTheDocument()
    expect(within(card).queryByText(/Bye/)).not.toBeInTheDocument()
    expect(within(card).queryByText('Win Division')).not.toBeInTheDocument()
  }, 30_000)

  it('says division odds are not modeled when the league has divisions', async () => {
    const league = { ...LEAGUE, settings: { ...LEAGUE.settings, divisions: 2 } }
    mockFetch({ '/league/L1': league, '/user/u1/leagues/nfl/2025': [league] })
    renderApp('#/?tab=league')
    const card = await screen.findByRole('region', { name: 'Playoff Race' }, SLOW)
    expect(await within(card).findByText('Not modeled', {}, SLOW)).toBeInTheDocument()
  }, 30_000)

  it('shows an unavailable state once the regular season is over', async () => {
    const league = { ...LEAGUE, settings: { ...LEAGUE.settings, playoff_week_start: 5 } }
    mockFetch({ '/league/L1': league, '/user/u1/leagues/nfl/2025': [league] })
    renderApp('#/?tab=league')
    const card = await screen.findByRole('region', { name: 'Playoff Race' }, SLOW)
    expect(within(card).getByText(/regular season is over/)).toBeInTheDocument()
  }, 30_000)
})

describe('optimal lineup', () => {
  it('shows the recommended lineup on the overview with an Optimize Lineup action', async () => {
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Optimal Lineup' }, SLOW)
    expect(within(card).getByRole('row', { name: /B\. Benchwood/ })).toHaveTextContent('RB')
    expect(within(card).queryByRole('row', { name: /R\. Runnerson/ })).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Optimize Lineup' })).toHaveAttribute('href', '#/lineup')
  }, 30_000)

  it('compares the optimized lineup with the one set in Sleeper on the Team view, with injury tags', async () => {
    const user = userEvent.setup()
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp('#/?tab=team')
    const card = await screen.findByRole('region', { name: 'Optimal Lineup' }, SLOW)
    const row = (name: RegExp) => within(card).getByRole('row', { name })
    // rb1 is Out: the optimized lineup starts rb2 at RB
    expect(row(/B\. Benchwood/)).toHaveTextContent('Start')
    expect(within(card).queryByRole('row', { name: /R\. Runnerson/ })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'As set in Sleeper' }))
    expect(row(/R\. Runnerson/)).toHaveTextContent('Bench')
    expect(row(/R\. Runnerson/)).toHaveTextContent('Out') // the designation tag
    expect(within(card).getByRole('columnheader', { name: 'Weather' })).toBeInTheDocument()
    expect(within(card).getByRole('columnheader', { name: 'Sleeper' })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Optimize Lineup' })).toHaveAttribute('href', '#/lineup')
  }, 30_000)
})

describe('overview: news', () => {
  it('shows the newest articles linking to the publishers, with the player named, and lists unavailable sources', async () => {
    mockFetch({ '/news.json': newsFile() })
    renderApp()
    const card = await screen.findByRole('region', { name: 'Fantasy News' }, SLOW)
    const links = await within(card).findAllByRole('link', { name: /Headline/ }, SLOW)
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      'https://www.pub.com/newest',
      'https://www.pub.com/second',
      'https://www.pub.com/mid',
    ])
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(links[0]).toHaveTextContent('Rusher Runnerson')
    expect(within(card).getByText(/Not available \(no public feed\): Draft Sharks/)).toBeInTheDocument()
  }, 30_000)

  it('explains when the news feed has not been published', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'Fantasy News' }, SLOW)
    expect(await within(card).findByText(/hasn't been published yet/, {}, SLOW)).toBeInTheDocument()
  }, 30_000)
})

describe('right column', () => {
  it('docks the AI Fantasy GM with the suggested questions, answering from league data without AI', async () => {
    const user = userEvent.setup()
    renderApp()
    const gm = await screen.findByRole('region', { name: 'AI Fantasy GM' }, SLOW)
    const chips = within(within(gm).getByRole('group', { name: 'Suggested questions' })).getAllByRole('button')
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Who should I start this week?',
      'Evaluate a trade for me',
      'Best waiver pickups?',
      'What are my playoff chances?',
    ])
    expect(within(gm).getByRole('button', { name: 'Send question' })).toBeDisabled()
    // asking opens the conversation with the answer
    await user.click(chips[2])
    const dialog = await screen.findByRole('dialog', { name: 'AI Fantasy GM' })
    const answer = await within(dialog).findByRole('article', { name: 'Fantasy GM answer' }, SLOW)
    expect(answer).toHaveTextContent(/Free Agentson/)
    await user.keyboard('{Escape}')
    // a typed question works the same way
    await user.type(within(gm).getByLabelText('Ask the Fantasy GM'), 'What are my playoff odds?')
    await user.click(within(gm).getByRole('button', { name: 'Send question' }))
    const again = await screen.findByRole('dialog', { name: 'AI Fantasy GM' })
    expect(await within(again).findByText('What are my playoff odds?', {}, SLOW)).toBeInTheDocument()
  }, 30_000)

  it('shows the podcast panel with working New Episode and Episode Library actions', async () => {
    renderApp()
    const pod = await screen.findByRole('region', { name: 'AI Podcast' }, SLOW)
    expect(within(pod).getByRole('heading', { name: 'AI Podcast: The Fantasy War Room' })).toBeInTheDocument()
    expect(within(pod).getByText('Your personalized weekly podcast.')).toBeInTheDocument()
    expect(await within(pod).findByText(/No episodes yet/, {}, SLOW)).toBeInTheDocument()
    expect(within(pod).getByText(/synthetic voices/)).toBeInTheDocument()
    expect(within(pod).getByRole('link', { name: /New Episode/ })).toHaveAttribute('href', '#/studio')
    expect(within(pod).getByRole('link', { name: /Episode Library/ })).toHaveAttribute('href', '#/studio?view=library')
  }, 30_000)
  it('heads the right column with Autopilot: today’s focus, urgent items and the league network pages', async () => {
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp()
    const ap = await screen.findByRole('region', { name: 'Autopilot heads-up' }, SLOW)
    expect(ap).toHaveTextContent(/Today \(\w+day\)/)
    expect(await within(ap).findByText(/1 thing to do now: /, {}, SLOW)).toBeInTheDocument()
    const net = within(ap).getByRole('navigation', { name: 'League network' })
    expect(within(net).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#/alerts', '#/scores', '#/hq'])
  }, 30_000)
})

describe('bottom strip', () => {
  it('lists the games with players in my matchup, scheduled vs live', async () => {
    mockFetch({
      '/schedule/nfl/regular/2025': SCHEDULE.map((g) => (g.game_id === 'g1' ? { ...g, status: 'in_progress' } : g)),
    })
    renderApp()
    const strip = await screen.findByRole('region', { name: 'Game Day Dashboard' }, SLOW)
    const games = await within(strip).findAllByRole('listitem', {}, SLOW)
    expect(games).toHaveLength(1) // only CCC @ AAA involves either lineup
    expect(games[0]).toHaveTextContent('Live')
    expect(games[0]).toHaveTextContent('CCC @ AAA')
    expect(games[0]).toHaveTextContent(/You: R\. Runnerson, W\. Catchwell/)
    expect(within(strip).getByRole('link', { name: /Game Day Dashboard/ })).toHaveAttribute('href', '#/gameday')
  }, 30_000)

  it('counts games with weather concerns and opens the weather analysis', async () => {
    const user = userEvent.setup()
    mockFetch(weatherMock(24))
    renderApp()
    const watch = await screen.findByRole('link', { name: /Weather Watch: 1 game with weather concerns/ }, SLOW)
    expect(watch).toHaveAttribute('href', '#/weather')
    await user.click(watch)
    expect(await screen.findByRole('heading', { level: 1, name: 'Weather Watch' }, SLOW)).toBeInTheDocument()
    const row = await screen.findByRole('row', { name: /AAA.*NYG/ }, SLOW)
    expect(row).toHaveTextContent('MetLife Stadium')
    expect(row).toHaveTextContent('24 mph')
    expect(row).toHaveTextContent(/Strong wind/)
    expect(row).toHaveTextContent(/Yours: R\. Runnerson/)
  }, 30_000)
})

describe('strategy view', () => {
  it('keeps the weekly game plan and waiver targets', async () => {
    renderApp('#/?tab=strategy')
    const plan = await screen.findByRole('region', { name: 'Your Weekly Game Plan' }, SLOW)
    const add = await within(plan).findByRole('link', { name: /Add F\. Agentson, drop B\. Benchwood/ }, SLOW)
    expect(add).toHaveAttribute('href', '#/waivers')
    const card = screen.getByRole('region', { name: 'Top Waiver Targets' })
    const item = (await within(card).findAllByRole('listitem', {}, SLOW))[0]
    expect(item).toHaveTextContent('F. Agentson')
    expect(item).toHaveTextContent('drop B. Benchwood')
    expect(within(item).getByRole('link', { name: 'Review adding F. Agentson' })).toHaveAttribute('href', '#/waivers')
  }, 30_000)

  it('keeps every original tool one click away in Quick access, with live summaries', async () => {
    const user = userEvent.setup()
    renderApp('#/?tab=strategy')
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

describe('my team page', () => {
  it('shows team health, the lineup and the roster', async () => {
    renderApp('#/team')
    expect(await screen.findByRole('heading', { level: 1, name: 'My Team' }, SLOW)).toBeInTheDocument()
    const health = await screen.findByRole('region', { name: 'Team Health' }, SLOW)
    expect(within(health).getByText('Every starter is available.')).toBeInTheDocument()
    expect(within(health).getByText('Backup Benchwood')).toBeInTheDocument() // Questionable, on the bench
    expect(screen.getByRole('region', { name: 'Optimal Lineup' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'My Roster' })).toBeInTheDocument()
  }, 30_000)
})

describe('leaders view', () => {
  it("names the week's top scoring team and the top scorer at each position", async () => {
    mockFetch({
      '/league/L1/matchups/5': [
        { roster_id: 1, matchup_id: 9, points: 31.5, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'], players_points: { rb1: 8.5, rb2: 19.2, wr1: 23 } },
        { roster_id: 2, matchup_id: 9, points: 14, starters: ['opp1'], players: ['opp1'], players_points: { opp1: 14 } },
      ],
    })
    renderApp('#/?tab=leaders')
    const view = await screen.findByRole('region', { name: 'Week leaders' }, SLOW)
    expect(within(view).getByRole('heading', { name: 'Week 5 Leaders' })).toBeInTheDocument()
    const top = within(view).getByRole('region', { name: 'Top scoring team' })
    expect(top).toHaveTextContent('Gridiron Gang (you)')
    expect(top).toHaveTextContent('31.5')
    const teams = within(within(view).getByRole('region', { name: 'Team scores' })).getAllByRole('listitem')
    expect(teams.map((t) => t.textContent)).toEqual([expect.stringMatching(/Gridiron Gang.*31\.5/), expect.stringMatching(/Rival.*14\.0/)])
    // the best RB sat on my bench; the rival's RB is third
    const rb = within(view).getByRole('region', { name: 'Top RB' })
    expect(rb).toHaveTextContent(/Backup Benchwood.*Gridiron Gang.*Bench.*19\.2/)
    expect(within(rb).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/R\. Runningback · Rival.*14\.0/),
      expect.stringMatching(/R\. Runnerson.*8\.5/),
    ])
    expect(within(view).getByRole('region', { name: 'Top WR' })).toHaveTextContent(/Wideout Catchwell.*23\.0/)
  }, 30_000)

  it('says when nothing has been scored yet', async () => {
    renderApp('#/?tab=leaders')
    const view = await screen.findByRole('region', { name: 'Week leaders' }, SLOW)
    expect(within(view).getByText(/No points have been scored in Week 5 yet/)).toBeInTheDocument()
  }, 30_000)
})
