import { gridFromTriple, QGRID, residualGrid } from '../projection/engine'
import { IDX, leanFor, pickFor, sampleDist, simulateStartSit } from './startsit'

const grid = (center: number, spread: number) => QGRID.map((q) => center + (q - 0.5) * 2 * spread)

describe('error grids', () => {
  it('builds 19 quantiles per tier from enough games', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ proj: 10, actual: 10 + (i - 50) / 5 }))
    const g = residualGrid(rows)
    expect(g[0]).toEqual([])
    expect(g[1]).toHaveLength(19)
    expect(g[1][9]).toBeCloseTo(0, 0)
  })
  it('falls back to a conservative grid from three percentiles', () => {
    const g = gridFromTriple([-4, 0, 6])
    expect(g[0]).toBe(-4) // 5th held at the 10th
    expect(g[IDX.floor]).toBe(-4)
    expect(g[IDX.median]).toBe(0)
    expect(g[IDX.ceiling]).toBe(6)
    expect(g[18]).toBe(6)
  })
})

describe('simulation', () => {
  it('samples the quantile grid by inverse CDF', () => {
    const d = grid(10, 5)
    expect(sampleDist(d, 0.5)).toBeCloseTo(10)
    expect(sampleDist(d, 0.01)).toBe(d[0]) // tails held
    expect(sampleDist(d, 0.99)).toBe(d[18])
  })
  it('is reproducible and splits identical players evenly', () => {
    const a = simulateStartSit([grid(10, 5), grid(10, 5)], 4000)
    expect(a.best[0]).toBeCloseTo(0.5, 1)
    expect(simulateStartSit([grid(12, 5), grid(10, 5)])).toEqual(
      simulateStartSit([grid(12, 5), grid(10, 5)]),
    )
  })
  it('favors the higher projection, more so with tight distributions', () => {
    const wide = simulateStartSit([grid(12, 8), grid(10, 8)]).best[0]
    const tight = simulateStartSit([grid(12, 2), grid(10, 2)]).best[0]
    expect(wide).toBeGreaterThan(0.5)
    expect(tight).toBeGreaterThan(wide)
    expect(simulateStartSit([grid(12, 2), grid(10, 2), grid(3, 1)]).best[2]).toBe(0)
  })
})

describe('lean', () => {
  it('protects a lead, chases upside as an underdog', () => {
    expect([leanFor(70), leanFor(30), leanFor(50), leanFor(null)]).toEqual([
      'floor',
      'ceiling',
      'median',
      'median',
    ])
  })
  it('picks the player best at that part of the distribution', () => {
    const safe = grid(10, 2) // floor ~8.2, ceiling ~11.8
    const boom = grid(10, 8) // floor ~2.8, ceiling ~17.2
    expect(pickFor('floor', [safe, boom])).toBe(0)
    expect(pickFor('ceiling', [safe, boom])).toBe(1)
    expect(pickFor('median', [null, boom])).toBe(1)
  })
})
