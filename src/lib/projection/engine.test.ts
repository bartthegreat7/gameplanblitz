import {
  backtest,
  features,
  fitCoef,
  fitXfp,
  formatFor,
  gameUsage,
  gate,
  metrics,
  predict,
  project,
  rangeFor,
  recencyMean,
  residualQuantiles,
  xfpOf,
  type FormatModel,
  type Prediction,
  type Sample,
} from './engine'
import { meanSe, quantile, ridge, solve } from './math'

/** deterministic pseudo-random numbers */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('math', () => {
  it('solves linear systems and recovers regression weights', () => {
    expect(
      solve(
        [
          [2, 1],
          [1, 3],
        ],
        [3, 5],
      ).map((v) => +v.toFixed(6)),
    ).toEqual([0.8, 1.4])
    const r = rng(1)
    const X = Array.from({ length: 400 }, () => [1, r() * 10, r() * 5])
    const y = X.map((x) => 2 + 0.5 * x[1] - 1.5 * x[2])
    expect(ridge(X, y, 0, [0]).map((v) => +v.toFixed(3))).toEqual([2, 0.5, -1.5])
  })
  it('shrinks harder with a larger prior and leaves free columns alone', () => {
    const X = Array.from({ length: 40 }, (_, i) => [1, i % 2 ? 1 : -1])
    const y = X.map((x) => 3 + x[1])
    const loose = ridge(X, y, 1, [0])
    const tight = ridge(X, y, 400, [0])
    expect(Math.abs(tight[1])).toBeLessThan(Math.abs(loose[1]))
    expect(tight[0]).toBeCloseTo(3, 6)
  })
  it('computes quantiles and standard errors', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1)
    expect(meanSe([1, 1, 1]).se).toBe(0)
    expect(meanSe([5]).se).toBe(Infinity)
  })
})

describe('features', () => {
  const g = (week: number, pts: number, xfp: number | null = pts) => ({
    ...gameUsage(week, { rec_tgt: 5 }, pts, xfp),
  })
  it('weights recent games 3:2:1, newest first', () => {
    expect(recencyMean([12, 6, 0])).toBe((36 + 12) / 6)
    expect(recencyMean([])).toBeNull()
  })
  it('scales recent signals by games played and uses last season only from 4+ games', () => {
    const f = features(10, [g(3, 16)], 12)
    expect(f.games).toBe(1)
    expect(f.x[0]).toBeCloseTo((16 - 10) / 3) // one game counts for a third
    expect(f.x[2]).toBe(2)
    expect(features(10, [], null).x).toEqual([0, 0, 0])
  })
  it('maps league reception scoring to the nearest standard format', () => {
    expect([formatFor(1), formatFor(0.5), formatFor(0), formatFor(undefined)]).toEqual([
      'ppr',
      'half',
      'std',
      'std',
    ])
  })
  it('scores expected points from usage', () => {
    expect(
      xfpOf('WR', { rec_tgt: 10, rec_rz_tgt: 2 }, { rec_tgt: 1.5, rec_rz_tgt: 1, rush_att: 0.8 }),
    ).toBe(17)
    expect(xfpOf('K', { fgm: 2 }, {})).toBeNull()
  })
  it('fits expected-points weights from played games', () => {
    const r = rng(2)
    const games = Array.from({ length: 300 }, () => {
      const t = Math.round(r() * 12)
      const z = Math.round(r() * 3)
      return {
        pos: 'WR',
        stats: { rec_tgt: t, rec_rz_tgt: z, rush_att: 0 },
        pts: 1.6 * t + 1.0 * z,
      }
    })
    const w = fitXfp(games).WR
    expect(w.rec_tgt).toBeCloseTo(1.6, 1)
    expect(w.rec_rz_tgt).toBeCloseTo(1.0, 1)
  })
})

/* Synthetic league: the baseline over-projects by 1.5 and misses a usage signal worth 0.5 × (xFP − baseline). */
function synthetic(weeks: number, seed = 3): Sample[] {
  const r = rng(seed)
  const out: Sample[] = []
  for (let w = 1; w <= weeks; w++)
    for (let p = 0; p < 60; p++) {
      const baseline = 5 + r() * 15
      const xfp = baseline + (r() - 0.5) * 8
      const f = features(
        baseline,
        [
          {
            week: w - 1,
            pts: baseline,
            xfp,
            snapShare: null,
            targets: 0,
            carries: 0,
            rzOpps: 0,
            tds: 0,
          },
          {
            week: w - 2,
            pts: baseline,
            xfp,
            snapShare: null,
            targets: 0,
            carries: 0,
            rzOpps: 0,
            tds: 0,
          },
          {
            week: w - 3,
            pts: baseline,
            xfp,
            snapShare: null,
            targets: 0,
            carries: 0,
            rzOpps: 0,
            tds: 0,
          },
        ],
        null,
      )
      const actual = Math.max(0, baseline - 1.5 + 0.5 * (xfp - baseline) + (r() - 0.5) * 6)
      out.push({ pos: 'WR', week: w, t: w, f, actual, injury: '' })
    }
  return out
}

describe('fitting and the validation gate', () => {
  it('learns a real signal and the baseline bias', () => {
    const c = fitCoef(synthetic(20))
    expect(c.beta[0]).toBeCloseTo(-1.5, 0)
    expect(c.beta[2]).toBeGreaterThan(0.3)
  })
  it('returns the baseline when the player is not projected to play', () => {
    const c = fitCoef(synthetic(20))
    expect(predict(features(0.4, [], null), c)).toBe(0.4)
  })
  it('backtests without look-ahead: a week is never in its own training data', () => {
    const s = synthetic(10)
    const all = backtest(s, 4)
    // changing week 9's outcomes must not change predictions for weeks 4-8
    const changed = s.map((x) => (x.t === 9 ? { ...x, actual: x.actual + 50 } : x))
    const again = backtest(changed, 4)
    const early = (p: Prediction[]) => p.filter((x) => x.t < 9).map((x) => x.model)
    expect(early(again)).toEqual(early(all))
    expect(all.every((p) => p.t >= 4)).toBe(true)
  })
  it('enables a correction only when the backtest improvement is significant', () => {
    const real = gate(backtest(synthetic(20), 4))
    expect(real.enabled).toBe(true)
    // pure noise: the model has nothing to learn
    const r = rng(9)
    const noise = synthetic(20).map((s) => ({
      ...s,
      actual: Math.max(0, s.f.baseline + (r() - 0.5) * 6),
    }))
    expect(gate(backtest(noise, 4)).enabled).toBe(false)
    expect(gate([]).reason).toMatch(/Too few/)
  })
  it('measures error, bias and interval coverage', () => {
    const p: Prediction[] = [
      { pos: 'WR', week: 1, t: 1, baseline: 10, model: 8, actual: 8, injury: '', lo: 5, hi: 12 },
      { pos: 'WR', week: 1, t: 1, baseline: 10, model: 12, actual: 14, injury: '', lo: 9, hi: 13 },
    ]
    const m = metrics(p)
    expect(m.maeBaseline).toBe(3)
    expect(m.maeModel).toBe(1)
    expect(m.biasBaseline).toBe(-1)
    expect(m.coverage).toBe(0.5)
  })
  it('builds calibrated-looking intervals from errors by projection tier', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ proj: 10, actual: 10 + (i - 50) / 10 }))
    const q = residualQuantiles(rows)
    expect(q[0]).toEqual([0, 0, 0]) // no rows under 8
    const r = rangeFor(10, q)!
    expect(r.floor).toBeCloseTo(6.04, 1)
    expect(r.ceiling).toBeCloseTo(13.94, 1)
  })
})

describe('project', () => {
  const fm: FormatModel = {
    xfp: {},
    positions: {
      WR: {
        coef: { beta: [-1, 0, 0.5, 0], n: 500 },
        quantiles: [
          [-4, 0, 6],
          [-6, 0, 9],
          [-9, 0, 12],
        ],
        gate: { enabled: true, delta: -0.1, se: 0.02, n: 500, reason: '' },
      },
      TE: {
        coef: { beta: [-1, 0, 0.5, 0], n: 500 },
        quantiles: [
          [-4, 0, 6],
          [-6, 0, 9],
          [-9, 0, 12],
        ],
        gate: { enabled: false, delta: 0.1, se: 0.02, n: 500, reason: '' },
      },
    },
    baselineQuantiles: {
      TE: [
        [-3, 0, 5],
        [-5, 0, 8],
        [-8, 0, 11],
      ],
    },
  }
  const f = features(
    10,
    [
      { week: 3, pts: 10, xfp: 16, snapShare: 0.8, targets: 9, carries: 0, rzOpps: 1, tds: 0 },
      { week: 2, pts: 10, xfp: 16, snapShare: 0.8, targets: 9, carries: 0, rzOpps: 1, tds: 0 },
      { week: 1, pts: 10, xfp: 16, snapShare: 0.8, targets: 9, carries: 0, rzOpps: 1, tds: 0 },
    ],
    null,
  )
  it('applies an enabled correction and explains each signal', () => {
    const p = project('WR', f, fm)
    expect(p.enabled).toBe(true)
    expect(p.value).toBeCloseTo(10 - 1 + 0.5 * 6)
    expect(p.contributions.reduce((a, c) => a + c.pts, 0)).toBeCloseTo(p.value - p.baseline)
    expect(p.range).toEqual({ floor: 6, median: 12, ceiling: 21 })
  })
  it('keeps the baseline (with baseline intervals) when the correction is off or missing', () => {
    const te = project('TE', f, fm)
    expect(te).toMatchObject({ enabled: false, value: 10, contributions: [] })
    expect(te.range).toEqual({ floor: 5, median: 10, ceiling: 18 })
    expect(project('K', f, undefined)).toMatchObject({ enabled: false, value: 10, range: null })
  })
})
