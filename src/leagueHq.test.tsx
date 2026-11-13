import { screen, within } from '@testing-library/react'

import { LEAGUE, mockFetch, renderApp, resetStore } from './test/mockSleeper'

const SLOW = { timeout: 15_000 }
const m = (roster_id: number, points: number) => ({ roster_id, matchup_id: 1, points, starters: [], players: [] })

beforeEach(() => {
  resetStore({ username: 'me' })
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('League HQ', () => {
  it('follows managers across seasons for champions, records, rivalries and standings', async () => {
    const L1 = { ...LEAGUE, previous_league_id: 'L0' }
    mockFetch({
      '/user/u1/leagues/nfl/2025': [L1],
      '/league/L1': L1,
      '/league/L1/users': [
        { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'Gridiron Gang' } },
        { user_id: 'u2', display_name: 'Rival', avatar: null, is_owner: true },
      ],
      '/league/L1/matchups/1': [m(1, 100), m(2, 80)],
      '/league/L1/matchups/2': [m(1, 90), m(2, 95)],
      // 2024: roster ids were the other way round (u1 had roster 2)
      '/league/L0': { ...LEAGUE, league_id: 'L0', season: '2024', settings: { ...LEAGUE.settings, playoff_week_start: 3 } },
      '/league/L0/rosters': [
        { roster_id: 1, owner_id: 'u2', players: [], starters: [], settings: {} },
        { roster_id: 2, owner_id: 'u1', players: [], starters: [], settings: {} },
      ],
      '/league/L0/users': [
        { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'Old Gang' } },
        { user_id: 'u2', display_name: 'Rival', avatar: null },
      ],
      '/league/L0/matchups/1': [m(1, 110), m(2, 120)],
      '/league/L0/matchups/2': [m(1, 70), m(2, 140)],
      '/league/L0/winners_bracket': [{ r: 1, m: 1, t1: 1, t2: 2, w: 2, l: 1, p: 1 }],
    })
    renderApp('#/hq')
    expect(await screen.findByRole('heading', { level: 1, name: 'League HQ' }, SLOW)).toBeInTheDocument()
    expect(screen.getByText(/Commissioner: Rival\./)).toHaveTextContent(/no commissioner-only controls/)

    const champs = screen.getByRole('region', { name: 'Championship history' })
    expect(await within(champs).findByText('Old Gang', {}, SLOW)).toBeInTheDocument()
    expect(champs).toHaveTextContent(/2025\s*Season in progress/)

    const stats = within(screen.getByRole('region', { name: 'Manager statistics' })).getByRole('table')
    const me = within(stats).getAllByRole('rowheader').find((r) => r.textContent === 'Me (you)')!.closest('tr')!
    expect(me).toHaveTextContent(/2\s*3-1\s*75%/) // two seasons, 2-0 in 2024 and 1-1 this season
    expect(me).toHaveTextContent(/1\s*#1$/) // one title, best finish first

    expect(screen.getByRole('region', { name: 'Rivalries' })).toHaveTextContent(/Me vs Rival\s*4 meetings · Me leads 3-1/)
    expect(screen.getByRole('region', { name: 'League records' })).toHaveTextContent(/Highest weekly score\s*Me\s*2024 · Week 2\s*140\.0/)

    const standings = screen.getByRole('region', { name: 'Historical standings' })
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.setup().selectOptions(within(standings).getByRole('combobox', { name: 'Season' }), '2024')
    expect(within(standings).getAllByRole('rowheader').find((r) => r.textContent?.startsWith('Old Gang · Me'))!.closest('tr')).toHaveTextContent(/Champion\s*2-0/)
  }, 40_000)

  it('says so when Sleeper links no earlier season', async () => {
    mockFetch()
    renderApp('#/hq')
    expect(await screen.findByText(/Sleeper has no earlier season linked to this league/, {}, SLOW)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Draft and keeper history' })).toHaveTextContent(/Sleeper has no draft picks/)
  }, 30_000)
})
