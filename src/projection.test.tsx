import { screen, within } from '@testing-library/react'

import type { Metrics, ModelFile } from './lib/projection/engine'
import { mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* Mock league scoring is {rec: 1} -> the 'ppr' format. rb1: Sleeper projects 8; weeks 1-4 he scored 8, 9, 7, 8 on 40 snaps of 60. */
const SLOW = { timeout: 15_000 }
const m = (n: number, base: number, model: number): Metrics => ({
  n,
  maeBaseline: base,
  maeModel: model,
  rmseBaseline: base + 1,
  rmseModel: model + 1,
  biasBaseline: 0.5,
  biasModel: 0,
  coverage: 0.79,
})
const q: [number, number, number][] = [
  [-4, -1, 6],
  [-7, -1, 9],
  [-10, -1, 12],
]
const MODEL: ModelFile = {
  version: 'gpb-1.0',
  updated: '2025-10-08T12:00:00Z',
  trainedThrough: { season: '2025', week: 4 },
  seasons: ['2024', '2025'],
  formats: {
    ppr: {
      xfp: { RB: { rush_att: 0.5, rush_rz_att: 0.8, rec_tgt: 1.2, rec_rz_tgt: 0.9 } },
      positions: {
        RB: {
          coef: { beta: [-0.5, 0, 0, 0], n: 900 },
          quantiles: q,
          gate: {
            enabled: true,
            delta: -0.07,
            se: 0.02,
            n: 900,
            reason: 'Beats the baseline by 0.07 pts per game (3.8 standard errors).',
          },
        },
        TE: {
          coef: { beta: [0, 0, 0, 0], n: 900 },
          quantiles: q,
          gate: {
            enabled: false,
            delta: 0.01,
            se: 0.02,
            n: 900,
            reason: 'Does not beat the baseline in backtesting.',
          },
        },
      },
      baselineQuantiles: { RB: q, TE: q },
    },
  },
  accuracy: {
    format: 'ppr',
    overall: m(2000, 4.55, 4.5),
    byPosition: { RB: m(900, 4.78, 4.71), TE: m(500, 3.82, 3.84) },
    byWeek: [
      { week: 2, pos: 'RB', n: 80, maeBaseline: 4.9, maeModel: 4.7 },
      { week: 3, pos: 'RB', n: 80, maeBaseline: 4.6, maeModel: 4.6 },
    ],
    byInjury: [{ status: 'Questionable', metrics: m(100, 4.86, 4.74) }],
    bySize: [{ label: 'Projected under 8', metrics: m(800, 3, 3) }],
  },
  history: [
    {
      version: 'gpb-1.0',
      updated: '2025-10-01T12:00:00Z',
      trainedThrough: { season: '2025', week: 3 },
      overall: m(1800, 4.6, 4.56),
    },
  ],
  notes: ['Baseline: Sleeper weekly projections.'],
}

beforeEach(() => resetStore({ username: 'me' }))
afterEach(() => vi.unstubAllGlobals())

describe('projection breakdown on the player page', () => {
  it('shows Sleeper’s projection unchanged until the model is published, with the last 3 games', async () => {
    mockFetch()
    renderApp('#/players/rb1')
    const s = await screen.findByRole('region', { name: 'Projection breakdown' }, SLOW)
    expect(await within(s).findByText(/hasn't been published yet/, {}, SLOW)).toBeInTheDocument()
    expect(within(s).getAllByText('Sleeper baseline')).toHaveLength(2) // status badge + tile
    const rows = within(s).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.firstChild?.textContent)).toEqual(['Wk 4', 'Wk 3', 'Wk 2']) // newest first
    expect(rows[0]).toHaveTextContent('67%') // 40 of 60 snaps
  }, 30_000)

  it('applies a validated correction and explains it, with a calibrated range', async () => {
    mockFetch({
      '/model.json': MODEL,
      '/stats/nfl/2024': [{ player_id: 'rb1', stats: { rec: 120, gp: 10 } }],
    })
    renderApp('#/players/rb1')
    const s = await screen.findByRole('region', { name: 'Projection breakdown' }, SLOW)
    expect(await within(s).findByText('Validated correction applied', {}, SLOW)).toBeInTheDocument()
    const tile = (label: string) => within(s).getByText(label).previousSibling?.textContent
    expect(tile('Projection')).toBe('7.5') // 8 - 0.5
    expect(tile('Sleeper baseline')).toBe('8.0')
    expect(tile('Floor (10th pct.)')).toBe('3.5') // tier < 8: 7.5 - 4
    expect(tile('Ceiling (90th pct.)')).toBe('13.5')
    expect(within(s).getByText('Baseline bias correction').nextSibling).toHaveTextContent('−0.5')
    expect(within(s).getByText(/12\.0 pts per game over 10 games/)).toBeInTheDocument()
  }, 30_000)
})

describe('projection accuracy page', () => {
  it('reports backtest accuracy, which corrections are on, and model history', async () => {
    mockFetch({ '/model.json': MODEL })
    renderApp('#/accuracy')
    const pos = await screen.findByRole('region', { name: 'By position' }, SLOW)
    expect(
      within(within(pos).getByRole('row', { name: /^RB/ })).getByText('On'),
    ).toBeInTheDocument()
    expect(
      within(within(pos).getByRole('row', { name: /^TE/ })).getByText('Off: baseline used'),
    ).toBeInTheDocument()
    expect(within(pos).getByText(/3\.8 standard errors/)).toBeInTheDocument()
    expect(screen.getByText('4.50 vs 4.55')).toBeInTheDocument()
    expect(
      within(screen.getByText('80% range coverage').parentElement!).getByText('79%'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Week by week, 2025' })).getAllByRole('row'),
    ).toHaveLength(3)
    expect(screen.getByText(/through 2025 week 3: MAE 4\.56 vs 4\.60/)).toBeInTheDocument()
  }, 30_000)

  it('explains when the model has not been published', async () => {
    mockFetch()
    renderApp('#/accuracy')
    expect(await screen.findByText(/hasn't been published yet/, {}, SLOW)).toBeInTheDocument()
  }, 30_000)
})
