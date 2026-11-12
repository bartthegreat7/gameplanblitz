import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ModelFile } from './lib/projection/engine'
import { winProbability } from './lib/scoring'
import { mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* My roster: rb1 (8 proj, starter), rb2 (3, bench), wr1 (10, starter). I project 18 vs 6 -> a favorite. */
const SLOW = { timeout: 15_000 }
const q: [number, number, number][] = [
  [-4, 0, 6],
  [-7, 0, 9],
  [-10, 0, 12],
]
const gate = { enabled: false, delta: 0, se: 1, n: 500, reason: '' }
const MODEL: ModelFile = {
  version: 'gpb-1.0',
  updated: '2025-10-08T12:00:00Z',
  trainedThrough: { season: '2025', week: 4 },
  seasons: ['2025'],
  formats: {
    ppr: {
      xfp: {},
      positions: {
        RB: { coef: { beta: [0, 0, 0, 0], n: 500 }, quantiles: q, gate },
        WR: { coef: { beta: [0, 0, 0, 0], n: 500 }, quantiles: q, gate },
      },
      baselineQuantiles: { RB: q, WR: q },
    },
  },
  accuracy: null,
  history: [],
  notes: [],
}

beforeEach(() => {
  resetStore({ username: 'me' })
  mockFetch({ '/model.json': MODEL })
})
afterEach(() => vi.unstubAllGlobals())

describe('Start/Sit Simulator', () => {
  it('starts with my closest call and simulates who scores most', async () => {
    renderApp('#/startsit')
    const cmp = await screen.findByRole('list', { name: 'Comparison' }, SLOW)
    const cards = within(cmp).getAllByRole('listitem')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Rusher Runnerson',
      'Backup Benchwood',
    ]) // weakest RB/WR/TE starter vs best bench
    const shares = await vi.waitFor(() => {
      const s = cards.map((c) =>
        Number(within(c).getByText(/%$/, { selector: 'div' }).textContent!.replace('%', '')),
      )
      expect(s.every((x) => !Number.isNaN(x))).toBe(true)
      return s
    })
    expect(shares[0]).toBeGreaterThan(shares[1]) // 8 vs 3 projected
    expect(shares[0] + shares[1]).toBeGreaterThanOrEqual(99)
    expect(within(cards[0]).getByText('Floor / median / ceiling').nextSibling).toHaveTextContent(
      '1.0 / 8.0 / 17.0',
    ) // 8 is in the 8-15 tier: -7 / 0 / +9
  }, 30_000)

  it('leans on the floor when I am a clear favorite, and says why', async () => {
    renderApp('#/startsit')
    const rec = await screen.findByRole('region', { name: 'Recommendation' }, SLOW)
    const p = Math.round(100 * winProbability(18, 6))
    expect(rec).toHaveTextContent(`Your win probability this week: ${p}% (model)`)
    expect(rec).toHaveTextContent('the steadier floor matters most')
    await vi.waitFor(() => expect(rec).toHaveTextContent('Lean Rusher Runnerson: floor 1.0 pts'))
  }, 30_000)

  it('adds and removes players', async () => {
    const user = userEvent.setup()
    renderApp('#/startsit')
    const cmp = await screen.findByRole('list', { name: 'Comparison' }, SLOW)
    await user.click(screen.getByRole('button', { name: /W\. Catchwell/ }))
    expect(within(cmp).getAllByRole('listitem')).toHaveLength(3)
    await user.selectOptions(screen.getByRole('combobox', { name: /Add a free agent/ }), 'fa1')
    expect(within(cmp).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText(/Up to 4 at a time/)).toBeInTheDocument()
    await user.click(within(cmp).getByRole('button', { name: 'Remove Rusher Runnerson' }))
    expect(
      within(cmp)
        .getAllByRole('listitem')
        .map((c) => c.getAttribute('aria-label')),
    ).not.toContain('Rusher Runnerson')
  }, 30_000)
})
