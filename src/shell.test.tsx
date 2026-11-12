import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAppStore } from './store/app'
import { mockFetch, PLAYERS, renderApp, resetStore, SCHEDULE } from './test/mockSleeper'

const SLOW = { timeout: 15_000 }

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

const ready = () => screen.findByRole('heading', { name: 'Standings', level: 1 }, SLOW)

describe('global search', () => {
  it('opens with Ctrl+K and finds a player in the league', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await ready()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Search' })
    await user.type(within(dialog).getByRole('textbox'), 'catch')
    const hit = await within(dialog).findByRole('button', { name: /Wideout Catchwell/ })
    expect(hit).toHaveTextContent('WR · AAA · Your team')
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('heading', { name: 'Wideout Catchwell', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 30_000)

  it('finds pages and free agents, and moves through results with the arrow keys', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Search players, articles, or your league' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Search' })
    await user.type(within(dialog).getByRole('textbox'), 'agent')
    expect(
      await within(dialog).findByRole('button', { name: /Free Agentson.*Free agent/ }),
    ).toBeInTheDocument()
    await user.clear(within(dialog).getByRole('textbox'))
    await user.type(within(dialog).getByRole('textbox'), 'keeper')
    await user.keyboard('{ArrowDown}')
    expect(within(dialog).getByRole('button', { name: /Keeper Tools/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: /Keeper/ })).toBeInTheDocument()
  }, 30_000)
})

describe('notifications', () => {
  it('says all caught up when the lineup has no problems', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await ready()
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText(/You're all caught up/)).toBeInTheDocument()
  })

  it('flags an Out starter from Sleeper and links to the lineup', async () => {
    const user = userEvent.setup()
    mockFetch({ '/players/nfl': { ...PLAYERS, rb1: { ...PLAYERS.rb1, injury_status: 'Out' } } })
    renderApp('#/standings')
    await ready()
    await user.click(await screen.findByRole('button', { name: 'Notifications (1)' }, SLOW))
    const link = screen.getByRole('link', {
      name: /Rusher Runnerson is listed Out and in your lineup/,
    })
    expect(link).toHaveAttribute('href', '#/lineup')
  }, 30_000)
})

describe('week selector', () => {
  it('views an earlier week everywhere and returns to the current one', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await ready()
    await user.selectOptions(screen.getAllByLabelText('NFL week')[0], '3')
    expect(useAppStore.getState().viewWeek).toBe(3)
    expect(await screen.findByText(/Every page shows that week's matchups/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to Week 5' }))
    expect(useAppStore.getState().viewWeek).toBeNull()
  })

  it('offers only weeks up to the current NFL week', async () => {
    renderApp('#/standings')
    await ready()
    const options = within(screen.getAllByLabelText('NFL week')[0]).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'NFL Week 5 (current)',
      'NFL Week 4',
      'NFL Week 3',
      'NFL Week 2',
      'NFL Week 1',
    ])
  })
})

describe('account menu', () => {
  it('switches Sleeper accounts only after confirming', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await ready()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('button', { name: 'Switch Sleeper account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Switch Sleeper account?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(useAppStore.getState().username).toBe('me')
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('button', { name: 'Switch Sleeper account' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch account' }),
    )
    expect(useAppStore.getState().username).toBeNull()
    expect(
      await screen.findByRole('heading', { name: 'Connect your Sleeper team' }),
    ).toBeInTheDocument()
  })
})

describe('sidebar', () => {
  it('lists my leagues and shows the Sleeper connection', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await ready()
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    await user.click(within(nav).getByRole('button', { name: 'My Leagues' }))
    expect(within(nav).getByRole('button', { name: 'Test League' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Sleeper connected')).toBeInTheDocument()
    expect(await screen.findByText(/Last sync/)).toBeInTheDocument()
  })

  it('marks Game Day as live only while games are underway', async () => {
    renderApp('#/standings')
    await ready()
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(within(nav).getByRole('link', { name: /Game Day Mode/ })).not.toHaveTextContent('Live')
  })

  it('shows the live badge when a game this week has kicked off', async () => {
    mockFetch({
      '/schedule/nfl/regular/2025': SCHEDULE.map((g) =>
        g.game_id === 'g1' ? { ...g, status: 'in_progress' } : g,
      ),
    })
    renderApp('#/standings')
    await ready()
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(await within(nav).findByText('Live')).toBeInTheDocument()
  })

  it('opens the full menu from the phone header', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    await ready()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Menu' })
    await user.click(within(dialog).getByRole('link', { name: 'Playoff Simulator' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Playoff/ }, SLOW)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 30_000)
})
