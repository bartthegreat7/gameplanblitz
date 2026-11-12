import { screen, within } from '@testing-library/react'

import { failing, mockFetch, PLAYERS, renderApp, resetStore } from './test/mockSleeper'

/* Mock league, Week 5: my lineup rb1 (8) + wr1 (10) is already optimal; free agent fa1 projects 12
   (an RB upgrade over rb1). One game left for each team, 1 playoff spot of 2 teams. */
const H = 3_600_000
const newsFile = () => {
  const now = Date.now()
  const a = (id: string, hoursAgo: number, players: { id: string; name: string }[]) => ({
    id, title: `Story ${id}`, url: `https://www.pub.com/${id}`, publisher: 'RotoWire', publisherId: 'rotowire-news', kind: 'news', author: null,
    excerpt: `Excerpt ${id}`, image: null, tags: [], categories: [], players, ts: now - hoursAgo * H, published: new Date(now - hoursAgo * H).toISOString(),
  })
  return {
    version: 1, updated: new Date(now).toISOString(), playersMatched: true, categories: [], publishers: ['RotoWire'], unavailable: [], sources: [],
    articles: [
      a('mine-new', 2, [{ id: 'rb1', name: 'Rusher Runnerson' }]),
      a('mine-old', 100, [{ id: 'wr1', name: 'Wideout Catchwell' }]), // outside the 72h window
      a('not-mine', 1, [{ id: 'opp1', name: 'Rival Runningback' }]),
    ],
  }
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch({ '/news.json': newsFile() })
})
afterEach(() => vi.unstubAllGlobals())

const items = async () => {
  const list = await screen.findByRole('region', { name: 'Your action items' }, { timeout: 15_000 })
  await vi.waitFor(() => expect(screen.queryByText(/Still checking/)).not.toBeInTheDocument(), { timeout: 15_000 })
  return within(list).getAllByRole('listitem')
}

describe('Fantasy GM', () => {
  it('builds a rules-based brief with sources, impact and links to each tool', async () => {
    renderApp('#/gm')
    expect(await screen.findByRole('heading', { name: /Fantasy GM/ }, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.getByText(/rules-based/)).toBeInTheDocument()
    const list = await items()
    const text = list.map((li) => li.textContent)
    // news about my roster from the last 72h only, then the waiver upgrade
    expect(text[0]).toMatch(/Read: Story mine-new/)
    expect(text.join('|')).not.toMatch(/mine-old|not-mine/)
    const waiver = list.find((li) => /Add F. Agentson, drop B. Benchwood/.test(li.textContent ?? ''))!
    expect(waiver).toBeDefined()
    expect(within(waiver).getByRole('link', { name: /Open Waiver Sniper/ })).toHaveAttribute('href', '#/waivers')
    expect(within(waiver).getByText(/Source: Sleeper projections/)).toBeInTheDocument()
    expect(within(waiver).getByText('+4.0 pts/wk')).toBeInTheDocument()
    // 3-1 vs 1-3 with one game left for one playoff spot: clinched, so no playoff-race item
    expect(text.some((t) => /Playoff race/.test(t ?? ''))).toBe(false)
    expect(within(screen.getByRole('region', { name: 'This week' })).getByText('100.0%')).toBeInTheDocument()
  }, 30_000)

  it('summarizes the matchup as model estimates', async () => {
    renderApp('#/gm')
    const week = await screen.findByRole('region', { name: 'This week' }, { timeout: 15_000 })
    expect(within(week).getByText('Rival')).toBeInTheDocument()
    expect(within(week).getByText('18.0 – 6.0')).toBeInTheDocument()
    expect(within(week).getAllByText(/model/).length).toBeGreaterThanOrEqual(3)
  }, 30_000)

  it('puts an Out starter first as "Do now"', async () => {
    mockFetch({ '/news.json': newsFile(), '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp('#/gm')
    const [first] = await items()
    expect(first).toHaveTextContent('Do now')
    expect(first).toHaveTextContent(/Replace R(usher|\.) Runnerson \(Out\)/)
    expect(within(first).getByRole('link', { name: /Open Lineup Optimizer/ })).toHaveAttribute('href', '#/lineup')
  }, 30_000)

  it('says what it left out when a source fails', async () => {
    mockFetch({ '/news.json': newsFile(), '/values/current': failing() })
    renderApp('#/gm')
    expect(await screen.findByText(/Not included this time: trade ideas \(FantasyCalc values failed to load\)/, {}, { timeout: 15_000 })).toBeInTheDocument()
  }, 30_000)
})
