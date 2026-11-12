import { screen } from '@testing-library/react'

import { resetPlayerBookRefresh } from './hooks/useLeagueData'
import { mockFetch, PLAYERS, renderApp, resetStore } from './test/mockSleeper'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const { wr1: _wr1, ...withoutWr1 } = PLAYERS
void _wr1

beforeEach(() => {
  resetStore({ username: 'me' })
  resetPlayerBookRefresh()
})
afterEach(() => vi.unstubAllGlobals())

describe('player book freshness', () => {
  it('re-downloads the player book when a roster has a player it does not know', async () => {
    let calls = 0
    // first download is "stale": it predates wr1 joining the league
    const fetchMock = mockFetch({ '/players/nfl': () => json(++calls === 1 ? withoutWr1 : PLAYERS) })
    renderApp('#/players')
    expect(await screen.findByText('Wideout Catchwell')).toBeInTheDocument()
    expect(calls).toBe(2)
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/players/nfl'))).toHaveLength(2)
  })

  it('refreshes at most once per session, even if an id never resolves', async () => {
    let calls = 0
    mockFetch({ '/players/nfl': () => (calls++, json(withoutWr1)) })
    renderApp('#/players')
    expect(await screen.findByText('Rusher Runnerson')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 300))
    expect(calls).toBe(2) // the original download plus one refresh
    // every page mounts the league data again; the 5 MB book must not be re-downloaded each time
    for (const page of ['#/standings', '#/lineup', '#/players']) {
      window.location.hash = page
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      await new Promise((r) => setTimeout(r, 200))
    }
    expect(calls).toBe(2)
  })

  it('does not refresh when every roster player is known', async () => {
    let calls = 0
    mockFetch({ '/players/nfl': () => (calls++, json(PLAYERS)) })
    renderApp('#/players')
    expect(await screen.findByText('Rusher Runnerson')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 300))
    expect(calls).toBe(1)
  })
})
