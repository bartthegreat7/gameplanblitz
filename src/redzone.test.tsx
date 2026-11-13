import { screen, within } from '@testing-library/react'

import { resetRedZone } from './hooks/useRedZone'
import { mockFetch, PLAYERS, renderApp, resetStore } from './test/mockSleeper'

const SLOW = { timeout: 15_000 }

beforeEach(() => {
  resetStore({ username: 'me' })
  localStorage.clear()
  sessionStorage.clear()
  resetRedZone()
})
afterEach(() => vi.unstubAllGlobals())

describe('League RedZone', () => {
  it('lists changes seen since the last Sleeper update: big plays and lead changes, with the data caveats', async () => {
    // an earlier update seen in this tab: 0-3, nobody had scored on my side
    sessionStorage.setItem(
      'gb-redzone-L1-5',
      JSON.stringify({
        snap: { at: 1, week: 5, sides: { 1: { points: 0, players: { rb1: 0, wr1: 0 } }, 2: { points: 3, players: { opp1: 3 } } } },
        events: [],
      }),
    )
    mockFetch({
      '/players/nfl': { ...PLAYERS, opp1: { ...PLAYERS.opp1, injury_status: 'Out' } },
      '/league/L1/matchups/5': [
        { roster_id: 1, matchup_id: 9, points: 18, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'], players_points: { rb1: 8, wr1: 10 } },
        { roster_id: 2, matchup_id: 9, points: 6, starters: ['opp1'], players: ['opp1'], players_points: { opp1: 6 } },
      ],
    })
    renderApp('#/redzone')
    expect(await screen.findByRole('heading', { level: 1, name: 'League RedZone' }, SLOW)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/Sleeper publishes running fantasy points, not plays/)
    const feed = screen.getByRole('region', { name: 'Scoring feed' })
    const items = await within(feed).findAllByRole('listitem', {}, SLOW)
    // same update: biggest change first
    expect(items.map((li) => li.textContent?.replace(/^(Big play|Lead change)[\d:]+\s[AP]M/, '$1 · '))).toEqual([
      'Lead change · Gridiron Gang takes the lead over Rival, 18.0–6.0',
      'Big play · Wideout Catchwell +10.0 for Gridiron Gang (now 10.0)',
      'Big play · Rusher Runnerson +8.0 for Gridiron Gang (now 8.0)',
    ])
    expect(screen.getByRole('region', { name: 'Every matchup' })).toHaveTextContent('Gridiron Gang')
  }, 40_000)
})
