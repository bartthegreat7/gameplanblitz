import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAppStore } from './store/app'
import { mockFetch, renderApp, resetStore, SCHEDULE } from './test/mockSleeper'

/* Mock league: 2 teams. Week 4 (complete): Gridiron Gang 102.4 beat Rival 101.9 (rb1 scored 40,
   wr1 sat with 12 on the bench). Week 5 is the current week. */
const SLOW = { timeout: 15_000 }
const week4 = [
  { roster_id: 1, matchup_id: 1, points: 102.4, starters: ['rb1'], players: ['rb1', 'wr1'], players_points: { rb1: 40, wr1: 12 } },
  { roster_id: 2, matchup_id: 1, points: 101.9, starters: ['opp1'], players: ['opp1'], players_points: { opp1: 30 } },
]
const routes = {
  '/league/L1/matchups/1': [
    { roster_id: 1, matchup_id: 1, points: 90, starters: [], players: [] },
    { roster_id: 2, matchup_id: 1, points: 80, starters: [], players: [] },
  ],
  '/league/L1/matchups/2': [
    { roster_id: 1, matchup_id: 1, points: 95, starters: [], players: [] },
    { roster_id: 2, matchup_id: 1, points: 85, starters: [], players: [] },
  ],
  '/league/L1/matchups/3': [
    { roster_id: 1, matchup_id: 1, points: 70, starters: [], players: [] },
    { roster_id: 2, matchup_id: 1, points: 110, starters: [], players: [] },
  ],
  '/league/L1/matchups/4': week4,
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch(routes)
})
afterEach(() => vi.unstubAllGlobals())

describe('Scores Around the League', () => {
  it('shows every matchup of the week once, projected before kickoff and labeled', async () => {
    renderApp('#/scores')
    expect(await screen.findByRole('heading', { level: 1, name: /Scores Around the League/ }, SLOW)).toBeInTheDocument()
    const games = await screen.findAllByRole('article', {}, SLOW)
    expect(games).toHaveLength(1)
    expect(games[0]).toHaveTextContent('Your matchup')
    expect(games[0]).toHaveTextContent('Scheduled')
    expect(games[0]).toHaveTextContent(/Gridiron Gang.*18\.0.*projected/)
    // records entering the week are rebuilt from Sleeper's scores (weeks 1-4: 3-1 and 1-3)
    expect(await within(games[0]).findByText(/3-1/, {}, SLOW)).toBeInTheDocument()
  }, 30_000)

  it('opens a matchup to its starters and points', async () => {
    const user = userEvent.setup()
    renderApp('#/scores?m=9')
    const game = await screen.findByRole('article', {}, SLOW)
    expect(within(game).getByRole('button', { name: /Hide starters/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(game).getAllByRole('table')).toHaveLength(2)
    await user.click(within(game).getByRole('button', { name: /Hide starters/ }))
    expect(within(game).queryByRole('table')).not.toBeInTheDocument()
  }, 30_000)

  it('names last week’s awards, storylines and both official standings and labeled power rankings', async () => {
    renderApp('#/scores')
    const awards = await screen.findByRole('region', { name: 'Weekly awards' }, SLOW)
    expect(await within(awards).findByText(/Gridiron Gang with 102\.4/, {}, SLOW)).toBeInTheDocument()
    expect(within(awards).getByText(/over Rival by 0\.50/)).toBeInTheDocument()
    expect(within(awards).getByText(/Wideout Catchwell scored 12\.0 on Gridiron Gang's bench/)).toBeInTheDocument()
    expect(within(awards).getByText(/Comeback of the Week \(needs in-game score snapshots/)).toBeInTheDocument()
    const stories = screen.getByRole('region', { name: 'Storylines' })
    expect(within(stories).getByText('Gridiron Gang edged Rival by 0.50 points.')).toBeInTheDocument()
    const ranks = screen.getByRole('region', { name: 'Standings and power rankings' })
    expect(within(ranks).getByText('Official standings')).toBeInTheDocument()
    expect(within(ranks).getByText(/GamePlanBitz model through Week 4/)).toBeInTheDocument()
  }, 30_000)

  it('builds a shareable recap only when asked', async () => {
    const user = userEvent.setup()
    renderApp('#/scores')
    const share = await screen.findByRole('region', { name: 'Share the recap' }, SLOW)
    expect(within(share).getByText(/Private by default/)).toBeInTheDocument()
    await user.click(within(share).getByText('Preview the text'))
    expect(within(share).getByText(/Around the League · Test League · Week 5 \(in progress\)/)).toBeInTheDocument()
  }, 30_000)

  it('marks live games and stays read-only when a game kicks off', async () => {
    mockFetch({
      ...routes,
      '/schedule/nfl/regular/2025': SCHEDULE.map((g) => (g.game_id === 'g1' ? { ...g, status: 'in_progress' } : g)),
      '/league/L1/matchups/5': [
        { roster_id: 1, matchup_id: 9, points: 7.5, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'], players_points: { rb1: 7.5 } },
        { roster_id: 2, matchup_id: 9, points: 0, starters: ['opp1'], players: ['opp1'] },
      ],
    })
    renderApp('#/scores')
    const game = await screen.findByRole('article', {}, SLOW)
    expect(await within(game).findByText('Live', {}, SLOW)).toBeInTheDocument()
    expect(game).toHaveTextContent(/7\.5/)
    expect(game).toHaveTextContent(/left to play/)
  }, 30_000)
})

describe('league scoreboard on the dashboard', () => {
  it('lists every matchup and links each to its analysis', async () => {
    renderApp()
    const strip = await screen.findByRole('region', { name: 'League scoreboard' }, SLOW)
    const link = await within(strip).findByRole('link', { name: /Gridiron Gang.*Rival/ }, SLOW)
    expect(link).toHaveAttribute('href', '#/scores?m=9')
    expect(link).toHaveTextContent('Projected')
  }, 30_000)
})

describe('Game Day Live', () => {
  it('adds the league scoreboard and the standings if games end as projected', async () => {
    renderApp('#/gameday')
    const section = await screen.findByRole('region', { name: 'Scores Around the League' }, SLOW)
    expect(within(section).getAllByRole('article')).toHaveLength(1)
    expect(await within(section).findByText('If every game ends as projected', {}, SLOW)).toBeInTheDocument()
    expect(useAppStore.getState().username).toBe('me')
  }, 30_000)
})

describe('automatic weekly shows', () => {
  it('prepares the due Postgame Report and Waiver War Room once when opted in, and shows the briefing banner', async () => {
    const day = (n: number) => {
      const d = new Date(Date.now() + n * 86_400_000)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    // Week 5's first game is tomorrow: the Postgame Report (Monday) and Waiver War Room (Tuesday) are due, the Game Plan Preview is not
    mockFetch({
      ...routes,
      '/schedule/nfl/regular/2025': SCHEDULE.map((g) => (g.week === 5 ? { ...g, date: g.game_id === 'g1' ? day(1) : day(3) } : g)),
    })
    const { resetAiStorage, listEpisodes } = await import('./lib/ai/storage')
    resetAiStorage()
    useAppStore.setState({ podcast: { ...useAppStore.getState().podcast, auto: true } })
    renderApp()
    const pod = await screen.findByRole('region', { name: 'AI Podcast' }, SLOW)
    expect(await within(pod).findByText('Your Weekly Fantasy Briefing Is Ready', {}, { timeout: 25_000 })).toBeInTheDocument()
    expect(pod).toHaveTextContent(/(Postgame Report|Waiver War Room) · Week 5/)
    const eps = await listEpisodes('L1')
    expect(eps.map((e) => [e.type, e.week, e.auto]).sort()).toEqual([
      ['moves', 5, true],
      ['recap', 5, true],
    ])
    const recap = eps.find((e) => e.type === 'recap')!
    expect(recap.lines.some((l) => l.chapter === 'around')).toBe(true) // Around the League segment
    expect(recap.lines[0].kind).toBe('disclosure')
    expect(eps.find((e) => e.type === 'moves')!.lines.some((l) => l.chapter === 'waivers')).toBe(true)
  }, 40_000)

  it('does nothing until the user opts in', async () => {
    const { resetAiStorage, listEpisodes } = await import('./lib/ai/storage')
    resetAiStorage()
    renderApp()
    const pod = await screen.findByRole('region', { name: 'AI Podcast' }, SLOW)
    expect(await within(pod).findByText(/Automatic weekly shows are off/, {}, SLOW)).toBeInTheDocument()
    expect(await listEpisodes('L1')).toEqual([])
  }, 30_000)
})
