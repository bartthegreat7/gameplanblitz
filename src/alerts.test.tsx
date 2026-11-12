import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { loadBaseline } from './lib/alerts'
import { mockFetch, PLAYERS, renderApp, resetStore } from './test/mockSleeper'

/* Starters rb1 + wr1; rb2 (bench) is Questionable in the base mock. */
const SLOW = { timeout: 15_000 }
const players = (o: Record<string, Record<string, unknown>>) => ({
  ...PLAYERS,
  ...Object.fromEntries(
    Object.entries(o).map(([id, x]) => [id, { ...PLAYERS[id as keyof typeof PLAYERS], ...x }]),
  ),
})

beforeEach(() => {
  localStorage.clear()
  resetStore({ username: 'me' })
})
afterEach(() => vi.unstubAllGlobals())

describe('Alert Center', () => {
  it('flags an Out starter now, remembers a baseline, then reports changes since it', async () => {
    const user = userEvent.setup()
    mockFetch({ '/players/nfl': players({ wr1: { injury_status: 'Out' } }) })
    renderApp('#/alerts')
    const list = await screen.findByRole('region', { name: 'Alerts' }, SLOW)
    expect(
      await within(list).findByRole(
        'listitem',
        { name: 'Wideout Catchwell is listed Out and in your lineup' },
        SLOW,
      ),
    ).toHaveTextContent('Urgent')
    expect(
      within(list).getByRole('listitem', { name: /Your first starter plays Sun, Nov 2/ }),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(loadBaseline('L1')).not.toBeNull(), SLOW)

    // later: rb2 goes from Questionable to Doubtful
    cleanup()
    mockFetch({
      '/players/nfl': players({
        wr1: { injury_status: 'Out' },
        rb2: { injury_status: 'Doubtful' },
      }),
    })
    renderApp('#/alerts')
    const again = await screen.findByRole('region', { name: 'Alerts' }, SLOW)
    expect(
      await within(again).findByRole(
        'listitem',
        { name: 'Backup Benchwood: Questionable → Doubtful' },
        SLOW,
      ),
    ).toHaveTextContent('Urgent')

    const seen = await screen.findByRole('button', { name: 'Mark all as seen' })
    await vi.waitFor(() => expect(seen).toBeEnabled(), SLOW) // enabled once every input has loaded
    await user.click(seen)
    expect(
      within(again).queryByRole('listitem', { name: /Backup Benchwood/ }),
    ).not.toBeInTheDocument()
    // the Out starter is still true, so it stays
    expect(
      within(again).getByRole('listitem', { name: /Wideout Catchwell is listed Out/ }),
    ).toBeInTheDocument()
  })

  it('is reachable from the notification bell', async () => {
    mockFetch()
    renderApp('#/standings')
    await screen.findByRole('heading', { name: 'Standings', level: 1 }, SLOW)
    await userEvent.setup().click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('link', { name: 'Open Alert Center' })).toHaveAttribute(
      'href',
      '#/alerts',
    )
  })
})
