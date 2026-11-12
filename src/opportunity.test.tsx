import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mockFetch, PLAYERS, renderApp, resetStore } from './test/mockSleeper'

/* Week 5 league. fa1 (free agent RB, team BBB) gets far more work in weeks 3-4. rb1 (my RB, AAA) is Out and
   missed weeks 3-4; rb2 (my RB, AAA) carried the load then. */
const SLOW = { timeout: 15_000 }
const line = (o: Record<string, number>) => ({ gp: 1, tm_off_snp: 60, ...o })
const week = (w: number) => [
  ...(w <= 2
    ? [
        {
          player_id: 'rb1',
          team: 'AAA',
          week: w,
          stats: line({ rush_att: 18, rec: 2, rec_tgt: 3, off_snp: 45 }),
        },
      ]
    : []),
  {
    player_id: 'rb2',
    team: 'AAA',
    week: w,
    stats: line(
      w <= 2 ? { rush_att: 4, off_snp: 12 } : { rush_att: 17, rec: 3, rec_tgt: 4, off_snp: 44 },
    ),
  },
  { player_id: 'wr1', team: 'AAA', week: w, stats: line({ rec_tgt: 7, rec: 5, off_snp: 55 }) },
  {
    player_id: 'fa1',
    team: 'BBB',
    week: w,
    stats: line(
      w <= 2
        ? { rush_att: 2, rec_tgt: 1, off_snp: 10 }
        : { rush_att: 11, rec: 4, rec_tgt: 6, rush_rz_att: 2, off_snp: 41 },
    ),
  },
]
const routes = {
  '/players/nfl': {
    ...PLAYERS,
    rb1: { ...PLAYERS.rb1, injury_status: 'Out', injury_body_part: 'Ankle' },
    rb2: { ...PLAYERS.rb2, depth_chart_position: 'RB', depth_chart_order: 2 },
  },
  ...Object.fromEntries([1, 2, 3, 4].map((w) => [`/stats/nfl/2025/${w}`, week(w)])),
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch(routes)
})
afterEach(() => vi.unstubAllGlobals())

describe('Breakout Radar', () => {
  it('flags a free agent whose usage jumped, with the evidence', async () => {
    renderApp('#/breakouts')
    const list = await screen.findByRole('region', { name: 'Breakout candidates' }, SLOW)
    const card = (await within(list).findAllByRole('listitem', {}, SLOW)).find((li) =>
      /Free Agentson/.test(li.textContent ?? ''),
    )!
    expect(card).toBeDefined()
    expect(within(card).getByText('Free agent')).toBeInTheDocument()
    expect(card).toHaveTextContent(/Snap share up 52 pts \(17% → 68%\)/)
    expect(card).toHaveTextContent(/Targets up 5\.0 per game/)
    // rostered players (rb2 also broke out) only appear when asking for all players
    expect(list).not.toHaveTextContent('Backup Benchwood')
    await userEvent.setup().click(screen.getByRole('button', { name: 'All players' }))
    expect(await within(list).findByText('Backup Benchwood')).toBeInTheDocument()
  }, 30_000)
})

describe('Injury Center', () => {
  it('measures teammates in games the injured starter missed, and never assumes Questionable is out', async () => {
    renderApp('#/injuries')
    const dom = await screen.findByRole('region', { name: 'Injury domino effect' }, SLOW)
    const item = await within(dom).findByRole(
      'listitem',
      { name: 'Rusher Runnerson injury effects' },
      SLOW,
    )
    const rb2 = within(item)
      .getAllByRole('listitem')
      .find((li) => /Backup Benchwood/.test(li.textContent ?? ''))!
    expect(rb2).toHaveTextContent('+16.0 touches · +4.0 tgts') // 17 carries + 3 catches vs 4 carries; 4 vs 0 targets per game
    expect(rb2).toHaveTextContent('+53 snap %')
    expect(rb2).toHaveTextContent('in 2 games without R. Runnerson vs 2 with him (small sample)')
    const mine = screen.getByRole('region', { name: 'Your roster' })
    expect(within(mine).getByText(/Out · Ankle/)).toBeInTheDocument()
    expect(within(mine).getByText(/game-time decision\. Not assumed inactive/)).toBeInTheDocument()
  }, 30_000)

  it('shows availability facts on the player page', async () => {
    renderApp('#/players/rb1')
    const s = await screen.findByRole('region', { name: 'Availability' }, SLOW)
    expect(within(s).getByText(/Officially ruled out/)).toBeInTheDocument()
    expect(within(s).getByText(/Practice reports aren't available/)).toBeInTheDocument()
  }, 30_000)
})
