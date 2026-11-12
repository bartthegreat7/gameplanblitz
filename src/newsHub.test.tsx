import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAppStore } from './store/app'
import { failing, mockFetch, openTool, renderApp, resetStore } from './test/mockSleeper'

/* A news file as the aggregator publishes it (test fixture only; never shipped). Times are
   relative to "now" so recency rules (breaking = last 24h, trending = last 3 days) apply. */
const H = 3_600_000
function newsFile() {
  const now = Date.now()
  const a = (id: string, o: Record<string, unknown>) => ({
    id, url: `https://www.pub.com/${id}`, author: null, excerpt: `Excerpt ${id}`, image: null, tags: [], kind: 'article', categories: [], players: [], ...o,
    ts: now - (o.hoursAgo as number) * H, published: new Date(now - (o.hoursAgo as number) * H).toISOString(),
  })
  return {
    version: 1,
    updated: new Date(now - 0.5 * H).toISOString(),
    playersMatched: true,
    categories: [],
    publishers: ['FantasyPros', 'RotoWire', '4for4', 'Dynasty Nerds', 'RotoBaller'],
    unavailable: [{ name: 'Draft Sharks', reason: 'No RSS/Atom feed or public API found.' }],
    sources: [
      { id: 'fantasypros', name: 'FantasyPros', homepage: 'https://www.fantasypros.com', kind: 'article', ok: true, count: 1, error: null, fetchedAt: '', lastSuccess: '', note: 'Public site RSS feed.' },
      { id: 'rotoworld', name: 'NBC Sports Rotoworld', homepage: 'https://www.nbcsports.com', kind: 'news', ok: false, count: 0, error: 'HTTP 503', fetchedAt: '', lastSuccess: new Date(now - 5 * H).toISOString(), note: '' },
    ],
    articles: [
      a('fp-trade', { title: 'Players to Buy Low and Sell High', publisher: 'FantasyPros', publisherId: 'fantasypros', author: 'Pat Pro', image: 'https://cdn.fp.com/a.jpg', categories: ['Trade Targets'], players: [{ id: 'rb1', name: 'Rusher Runnerson' }], hoursAgo: 2 }),
      a('rw-news', { title: 'Rival Runningback: Limited Wednesday', publisher: 'RotoWire', publisherId: 'rotowire-news', kind: 'news', categories: ['Breaking News', 'Injury Updates'], players: [{ id: 'opp1', name: 'Rival Runningback' }], hoursAgo: 1 }),
      a('44-waiver', { title: 'Week 5 Waiver Wire Pickups', publisher: '4for4', publisherId: '4for4', categories: ['Waiver Wire'], players: [{ id: 'fa1', name: 'Free Agentson' }], hoursAgo: 3 }),
      a('dn-rookies', { title: 'Dynasty Rookie Rankings', publisher: 'Dynasty Nerds', publisherId: 'dynastynerds', categories: ['Player Rankings', 'Dynasty Football'], hoursAgo: 5 }),
      a('rb-startsit', { title: 'Start/Sit Week 5', publisher: 'RotoBaller', publisherId: 'rotoballer', categories: ['Start / Sit'], players: [{ id: 'rb1', name: 'Rusher Runnerson' }, { id: 'fa1', name: 'Free Agentson' }], hoursAgo: 26 }),
      a('rw-old', { title: 'Ancient player note', publisher: 'RotoWire', publisherId: 'rotowire-news', kind: 'news', categories: ['Breaking News'], hoursAgo: 240 }),
    ],
  }
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch({ '/news.json': newsFile() })
})
afterEach(() => vi.unstubAllGlobals())

const section = (name: string | RegExp) => screen.getByRole('region', { name })

describe('News & Articles hub', () => {
  it('features analysis and lists breaking player news from the last day only', async () => {
    renderApp('#/news')
    const feat = await screen.findByRole('region', { name: 'Featured articles' })
    expect(within(feat).getByRole('heading', { name: 'Players to Buy Low and Sell High' })).toBeInTheDocument() // image + priority publisher
    expect(within(feat).getByText(/Pat Pro/)).toBeInTheDocument()
    const breaking = section(/Breaking player news/)
    expect(within(breaking).getByText('Rival Runningback: Limited Wednesday')).toBeInTheDocument()
    expect(within(breaking).queryByText('Ancient player note')).not.toBeInTheDocument()
  }, 30_000)

  it('personalizes: my roster, my opponent, and free agents in my league', async () => {
    renderApp('#/news')
    await screen.findByRole('region', { name: 'Featured articles' })
    const mine = section('My roster news')
    expect(within(mine).getByText('Players to Buy Low and Sell High')).toBeInTheDocument()
    expect(within(mine).getByText('Start/Sit Week 5')).toBeInTheDocument()
    expect(within(mine).queryByText('Week 5 Waiver Wire Pickups')).not.toBeInTheDocument()
    expect(within(section("My opponent's players")).getByText('Rival Runningback: Limited Wednesday')).toBeInTheDocument()
    const waiver = section('Waiver wire watch')
    expect(within(waiver).getByText('Week 5 Waiver Wire Pickups')).toBeInTheDocument()
    expect(within(waiver).getAllByRole('link', { name: 'Free Agentson, free agent in your league' }).length).toBeGreaterThan(0)
    expect(within(section('Keeper & dynasty intelligence')).getByText('Dynasty Rookie Rankings')).toBeInTheDocument()
    expect(screen.getAllByText(/coverage, not advice|Coverage is not a recommendation/).length).toBeGreaterThan(0)
  })

  it('surfaces players covered by several publishers, and filters to one on click', async () => {
    const user = userEvent.setup()
    renderApp('#/news')
    const trending = await screen.findByRole('region', { name: /Trending players/ })
    expect(within(trending).getByRole('button', { name: /Rusher Runnerson · 2 publishers/ })).toBeInTheDocument()
    expect(within(trending).getByRole('button', { name: /Free Agentson · 2 publishers/ })).toBeInTheDocument()
    await user.click(within(trending).getByRole('button', { name: /Free Agentson/ }))
    const all = section(/All articles/)
    expect(within(all).getByText('(2)')).toBeInTheDocument()
    expect(within(all).getByLabelText('Player')).toHaveValue('Free Agentson')
  })

  it('searches, filters by category and publisher, and sorts', async () => {
    const user = userEvent.setup()
    renderApp('#/news')
    await screen.findByRole('region', { name: 'Featured articles' })
    const all = section(/All articles/)
    expect(within(all).getByText('(6)')).toBeInTheDocument()
    await user.type(within(all).getByLabelText('Search titles'), 'waiver')
    expect(within(all).getByText('(1)')).toBeInTheDocument()
    await user.click(within(all).getByRole('button', { name: 'Clear filters' }))
    await user.selectOptions(within(all).getByLabelText('Category'), 'Start / Sit')
    expect(within(all).getByText('(1)')).toBeInTheDocument()
    await user.click(within(all).getByRole('button', { name: 'Clear filters' }))
    await user.selectOptions(within(all).getByLabelText('Publisher'), 'RotoWire')
    expect(within(all).getByText('(2)')).toBeInTheDocument()
    await user.selectOptions(within(all).getByLabelText('Published'), '24h')
    expect(within(all).getByText('(1)')).toBeInTheDocument()
    await user.click(within(all).getByRole('button', { name: 'Clear filters' }))
    await user.selectOptions(within(all).getByLabelText('Sort'), 'oldest')
    const titles = within(all).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles[0]).toBe('Ancient player note')
  })

  it('filters by position of the players an article is about', async () => {
    const user = userEvent.setup()
    renderApp('#/news')
    await screen.findByRole('region', { name: 'Featured articles' })
    const all = section(/All articles/)
    await user.selectOptions(within(all).getByLabelText('Position'), 'RB')
    expect(within(all).getByText('(4)')).toBeInTheDocument() // the rookies piece and the old note name no players
  })

  it('bookmarks articles, marks them read, and links out to the publisher', async () => {
    const user = userEvent.setup()
    renderApp('#/news')
    await screen.findByRole('region', { name: 'Featured articles' })
    const all = section(/All articles/)
    await user.click(within(all).getByRole('button', { name: 'Save: Week 5 Waiver Wire Pickups' }))
    expect(useAppStore.getState().bookmarks).toContain('44-waiver')
    await user.click(within(all).getByRole('button', { name: /Saved \(1\)/ }))
    expect(within(all).getByText('(1)')).toBeInTheDocument()

    const read = within(all).getByRole('link', { name: /Read on 4for4/ })
    expect(read).toHaveAttribute('href', 'https://www.pub.com/44-waiver')
    expect(read).toHaveAttribute('target', '_blank')
    expect(read).toHaveAttribute('rel', expect.stringContaining('noopener'))
    await user.click(within(all).getByRole('button', { name: 'Mark read: Week 5 Waiver Wire Pickups' }))
    expect(useAppStore.getState().read).toContain('44-waiver')
    await user.click(within(all).getByRole('button', { name: 'Mark unread: Week 5 Waiver Wire Pickups' }))
    expect(useAppStore.getState().read).not.toContain('44-waiver')
  })

  it('reports publisher health and unavailable publishers', async () => {
    renderApp('#/news')
    await screen.findByRole('region', { name: 'Featured articles' })
    expect(screen.getByText(/Publishers: 1 of 2 feeds working, 1 unavailable/)).toBeInTheDocument()
    expect(screen.getByText(/last refresh failed \(HTTP 503\)/)).toBeInTheDocument()
    expect(screen.getByText('Draft Sharks')).toBeInTheDocument()
    expect(screen.getByText(/Feeds refreshed/)).toBeInTheDocument()
  })

  it('shows a retryable error when the news file cannot be fetched', async () => {
    mockFetch({ '/news.json': failing() })
    renderApp('#/news')
    expect(await screen.findByText("Couldn't load news", {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })

  it('says when there are no articles at all', async () => {
    mockFetch({ '/news.json': { ...newsFile(), articles: [] } })
    renderApp('#/news')
    expect(await screen.findByText(/No articles right now/)).toBeInTheDocument()
  })
})

describe('news elsewhere in the app', () => {
  it('shows latest expert analysis on a player page, matched by player id', async () => {
    renderApp('#/players/rb1')
    const sectionEl = await screen.findByRole('region', { name: 'Latest expert analysis' })
    expect(await within(sectionEl).findByText('Players to Buy Low and Sell High')).toBeInTheDocument()
    expect(within(sectionEl).getByText('Start/Sit Week 5')).toBeInTheDocument()
    expect(within(sectionEl).queryByText('Week 5 Waiver Wire Pickups')).not.toBeInTheDocument()
  })

  it('says so when no article mentions the player', async () => {
    renderApp('#/players/wr1')
    expect(await screen.findByText(/No recent articles from connected publishers mention Wideout Catchwell/)).toBeInTheDocument()
  })

  it('puts news about my players on the dashboard', async () => {
    renderApp('#/')
    const card = within(await openTool('News & Injuries')).getByRole('region', { name: 'News & Injuries' })
    expect(await within(card).findByText('About your players')).toBeInTheDocument()
    expect(within(card).getByText('Players to Buy Low and Sell High')).toBeInTheDocument()
  })

  it('names the section "News & Analysis" in the navigation', async () => {
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 })
    expect(screen.getAllByRole('link', { name: 'News & Analysis' }).length).toBeGreaterThan(0)
  })
})
