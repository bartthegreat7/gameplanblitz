import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { winProbability } from './lib/scoring'
import { useAppStore } from './store/app'
import { mockFetch, openTool, renderApp, resetStore } from './test/mockSleeper'

beforeEach(() => {
  resetStore()
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

/* ---------- tests ---------- */

describe('connect flow', () => {
  it('sends a signed-out visitor to the connect screen', async () => {
    renderApp('#/')
    expect(
      await screen.findByRole('heading', { name: 'Connect your Sleeper team' }),
    ).toBeInTheDocument()
  })

  it('shows an error for an unknown username and stays on connect', async () => {
    const user = userEvent.setup()
    renderApp('#/connect')
    await user.type(await screen.findByLabelText('Sleeper username'), 'ghost')
    await user.click(screen.getByRole('button', { name: 'Blitz it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't find “ghost”/)
    expect(useAppStore.getState().username).toBeNull()
  })

  it('connects a known username and lands on the dashboard', async () => {
    const user = userEvent.setup()
    renderApp('#/connect')
    await user.type(await screen.findByLabelText('Sleeper username'), '@me')
    await user.click(screen.getByRole('button', { name: 'Blitz it' }))
    expect(await screen.findByRole('region', { name: "This Week's Matchup" })).toBeInTheDocument()
    expect(useAppStore.getState().username).toBe('me')
  })
})

describe('dashboard', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('renders Game Day with projections and the logistic win probability', async () => {
    renderApp()
    const card = within(await openTool('Position Battles')).getByRole('region', {
      name: 'Game Day',
    })
    expect(within(card).getByText('Gridiron Gang')).toBeInTheDocument()
    expect(within(card).getByText('18.0')).toBeInTheDocument() // RB 8 + WR 10
    expect(within(card).getByText('6.0')).toBeInTheDocument()
    const pct = Math.round(100 * winProbability(18, 6))
    expect(within(card).getByRole('progressbar', { name: 'Win probability' })).toHaveAttribute(
      'aria-valuenow',
      String(pct),
    )
  })

  it('finds the free-agent upgrade in the Free-Agent Edge', async () => {
    renderApp()
    const card = within(await openTool('Free-Agent Edge')).getByRole('region', { name: 'Free-Agent Edge' })
    expect(within(card).getByText('Upgrades available')).toBeInTheDocument()
    expect(within(card).getByText('+4.0')).toBeInTheDocument() // 12 - 8
  })

  it('lists the top free agent on the Waiver Wire', async () => {
    renderApp()
    const card = within(await openTool('Waiver Wire')).getByRole('region', { name: 'Waiver Wire' })
    expect(within(card).getByText('Free Agentson')).toBeInTheDocument()
  })

  it('shows FAAB left in Waiver Bids and a no-deals state in Trade Machine', async () => {
    renderApp()
    const bidsCard = within(await openTool('Waiver Bids')).getByRole('region', {
      name: 'Waiver Bids',
    })
    expect(within(bidsCard).getByText('$100 left to spend')).toBeInTheDocument()
    await userEvent.setup().keyboard('{Escape}')
    const trade = within(await openTool('Trade Machine')).getByRole('region', {
      name: 'Trade Machine',
    })
    expect(await within(trade).findByText(/No clearly fair upgrade/)).toBeInTheDocument()
  })

  it('shows standings with the signed-in team highlighted', async () => {
    renderApp()
    const card = await screen.findByRole('region', { name: 'League Standings' })
    const row = within(card).getByText('Gridiron Gang').closest('tr')!
    expect(row).toHaveAttribute('aria-current', 'true')
  })

  it('collapses a card and remembers it', async () => {
    const user = userEvent.setup()
    renderApp('#/standings')
    const card = await screen.findByRole('region', { name: 'Standings' })
    const toggle = within(card).getByRole('button', { name: /Standings/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(useAppStore.getState().collapsed).toContain('standings')
  })

  it('explains when the news feed is not published yet and still shows a roster report', async () => {
    renderApp()
    const card = within(await openTool('News & Injuries')).getByRole('region', {
      name: 'News & Injuries',
    })
    expect(await within(card).findByText(/news feed hasn't been published yet/)).toBeInTheDocument()
    expect(within(card).getByText('Backup Benchwood')).toBeInTheDocument() // Questionable
  })

  it('opens a player quick view over the roster panel; Escape closes only the top one', async () => {
    const user = userEvent.setup()
    renderApp()
    const panel = await openTool('My Roster')
    const roster = within(panel).getByRole('region', { name: 'My Roster' })
    await user.click(within(roster).getByRole('button', { name: /Rusher Runnerson/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Player' })
    expect(within(dialog).getByRole('link', { name: 'Full player details' })).toHaveAttribute(
      'href',
      '#/players/rb1',
    )
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Player' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'My Roster' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 30_000)
})

describe('degraded data', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('warns on projection cards when projections fail to load', async () => {
    mockFetch({ '/projections/nfl/2025/5': () => new Response('boom', { status: 500 }) })
    renderApp()
    // the dashboard warns once, above the cards
    expect(
      await screen.findByText(/Couldn't load Week 5 projections/, {}, { timeout: 15_000 }),
    ).toBeInTheDocument()
  })

  it('warns when Sleeper has not published projections yet', async () => {
    mockFetch({ '/projections/nfl/2025/5': [] })
    renderApp()
    expect(
      await screen.findByText(/hasn't published Week 5 projections/, {}, { timeout: 15_000 }),
    ).toBeInTheDocument()
    // and the tools that depend on projections say so too
    const card = within(await openTool('Free-Agent Edge')).getByRole('region', { name: 'Free-Agent Edge' })
    expect(within(card).getByText(/hasn't published Week 5 projections/)).toBeInTheDocument()
  })

  it('disables the Trade Machine with a notice when FantasyCalc fails', async () => {
    mockFetch({ '/values/current': () => new Response('down', { status: 503 }) })
    renderApp()
    const card = within(await openTool('Trade Machine')).getByRole('region', {
      name: 'Trade Machine',
    })
    expect(await within(card).findByText(/FantasyCalc values couldn't load/)).toBeInTheDocument()
  })

  it('shows a retryable error when the league cannot load', async () => {
    mockFetch({ '/league/L1/rosters': () => new Response('x', { status: 500 }) })
    renderApp()
    expect(await screen.findByText("Couldn't load this league")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })
})

describe('players', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('lists my roster, searches, and opens a player detail page', async () => {
    const user = userEvent.setup()
    renderApp('#/players')
    expect(await screen.findByText('Rusher Runnerson')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search players'), 'catch')
    expect(screen.queryByText('Rusher Runnerson')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /Wideout Catchwell/ }))
    expect(
      await screen.findByRole('heading', { name: 'Wideout Catchwell', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText('On Gridiron Gang')).toBeInTheDocument()
  })

  it('shows a free agent as unrostered on the detail page', async () => {
    renderApp('#/players/fa1')
    expect(await screen.findByText('Free agent in your league')).toBeInTheDocument()
  })

  it('shows an error for an unknown player id', async () => {
    renderApp('#/players/nope')
    expect(await screen.findByText('Player not found')).toBeInTheDocument()
  })
})

describe('settings and theme', () => {
  beforeEach(() => useAppStore.setState({ username: 'me' }))

  it('toggles the theme from the shell', async () => {
    const user = userEvent.setup()
    renderApp('#/settings')
    await screen.findByRole('heading', { name: 'Settings', level: 1 })
    // the sidebar's connection card holds the toggle
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement).not.toHaveAttribute('data-theme', 'light')
  })

  it('signs out only after confirming', async () => {
    const user = userEvent.setup()
    renderApp('#/settings')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(useAppStore.getState().username).toBe('me')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out' }),
    )
    expect(useAppStore.getState().username).toBeNull()
  })
})

describe('news hub', () => {
  it('explains when the feed has not been published yet', async () => {
    useAppStore.setState({ username: 'me' })
    renderApp('#/news')
    expect(await screen.findByText(/news feed hasn't been published yet/)).toBeInTheDocument()
  })
})
