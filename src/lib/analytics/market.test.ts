import { addSnapshot, oppTrend, pctChange, signalFor, trackedChange } from './market'
import type { Usage } from './opportunity'

const u = (
  week: number,
  touches: number,
  targets: number,
  pts: number,
  xfp: number | null = pts,
): Usage => ({
  week,
  team: 'A',
  snapShare: null,
  targets,
  carries: touches,
  touches,
  rzOpps: 0,
  pts,
  xfp,
})

describe('opportunity trend', () => {
  it('compares the last 2 games with earlier ones and measures efficiency', () => {
    const t = oppTrend([u(1, 10, 2, 8), u(2, 10, 2, 8), u(3, 14, 4, 20, 12), u(4, 14, 4, 18, 12)])!
    expect(t).toEqual({ recent: 18, earlier: 12, overExpected: 7 })
    expect(oppTrend([u(1, 1, 1, 1), u(2, 1, 1, 1), u(3, 1, 1, 1)])).toBeNull()
    expect(
      oppTrend([u(1, 1, 1, 1), u(2, 1, 1, 1), u(3, 1, 1, 1, null), u(4, 1, 1, 1)])!.overExpected,
    ).toBeNull()
  })
})

describe('signals', () => {
  const fc = (value: number, trend30: number) => ({ value, rank: 1, trend30 })
  const steady = { recent: 12, earlier: 12, overExpected: 0 }
  it('computes the 30-day change against the value 30 days ago', () => {
    expect(pctChange(fc(900, -100))).toBeCloseTo(-0.1)
    expect(pctChange({ value: 5, rank: 1 })).toBeNull()
  })
  it('buy low: value fell 10%+ while opportunity held, and he is not ruled out', () => {
    expect(signalFor(fc(800, -200), steady, '').signal).toBe('buy-low')
    expect(signalFor(fc(800, -200), steady, 'Questionable').signal).toBe('buy-low')
    expect(signalFor(fc(800, -200), steady, 'IR').signal).toBeNull()
    expect(signalFor(fc(800, -200), { ...steady, recent: 8 }, '').signal).toBeNull() // usage fell too
    expect(signalFor(fc(950, -50), steady, '').signal).toBeNull() // only 5%
  })
  it('sell high: value rose 10%+ on efficiency, or while opportunity fell', () => {
    expect(signalFor(fc(1200, 200), { ...steady, overExpected: 4 }, '').signal).toBe('sell-high')
    expect(signalFor(fc(1200, 200), { recent: 8, earlier: 12, overExpected: 0 }, '').signal).toBe(
      'sell-high',
    )
    expect(signalFor(fc(1200, 200), steady, '').signal).toBeNull() // rising on real opportunity: no call
    expect(signalFor(fc(1200, 200), null, '').signal).toBeNull()
  })
})

describe('snapshots', () => {
  it('keeps one per day, the last 60 days, and measures tracked change', () => {
    let list = addSnapshot([], { date: '2026-11-01', values: { a: 100 } })
    list = addSnapshot(list, { date: '2026-11-01', values: { a: 110 } }) // same day replaces
    expect(list).toHaveLength(1)
    expect(trackedChange(list, 'a')).toBeNull()
    list = addSnapshot(list, { date: '2026-11-08', values: { a: 140, b: 5 } })
    expect(trackedChange(list, 'a')).toEqual({ change: 30, since: '2026-11-01' })
    expect(trackedChange(list, 'b')).toBeNull()
    for (let d = 1; d <= 70; d++)
      list = addSnapshot(list, { date: `2027-01-${String(d).padStart(2, '0')}`, values: {} })
    expect(list).toHaveLength(60)
  })
})
