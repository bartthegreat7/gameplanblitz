import { alertsFor, loadBaseline, saveBaseline, sortAlerts, type AlertState } from './alerts'

const base: AlertState = {
  savedAt: '2026-11-10',
  week: 5,
  injuries: { a: '', b: 'Questionable', c: '' },
  starters: ['a', 'b'],
  proj: { a: 12, b: 9 },
  weather: {},
  breakouts: ['x'],
}
const ctx = { name: (id: string) => id.toUpperCase(), firstGame: 'Thu, Nov 12' }

describe('alerts', () => {
  it('without a baseline, shows only what is true now', () => {
    const cur = { ...base, injuries: { ...base.injuries, a: 'Out' } }
    const a = alertsFor(null, cur, ctx)
    expect(a.map((x) => [x.severity, x.title])).toEqual([
      ['high', 'A is listed Out and in your lineup'],
      ['low', 'Your first starter plays Thu, Nov 12'],
    ])
  })
  it('reports designation changes, lineup and projection moves, new weather and breakouts', () => {
    const cur: AlertState = {
      ...base,
      injuries: { a: '', b: 'Doubtful', c: 'Questionable' },
      starters: ['a', 'c'],
      proj: { a: 14.5, c: 6 },
      weather: { a: 'Strong wind (24 mph, gusts 35)' },
      breakouts: ['x', 'y'],
    }
    const titles = sortAlerts(alertsFor(base, cur, ctx)).map((x) => `${x.severity}: ${x.title}`)
    expect(titles).toEqual([
      'high: B: Questionable → Doubtful',
      'medium: C: no designation → Questionable',
      "medium: A's projection rose 2.5 pts",
      'medium: Weather flagged for A',
      'low: Your first starter plays Thu, Nov 12',
      'low: Your starting lineup changed',
      'low: Y is showing rising usage',
    ])
  })
  it('ignores small projection moves, unchanged weather, and projection moves across weeks', () => {
    const cur = { ...base, proj: { a: 13.5, b: 9 }, weather: {} }
    expect(alertsFor(base, cur, { ...ctx, firstGame: null })).toEqual([])
    expect(
      alertsFor(base, { ...base, week: 6, proj: { a: 20, b: 1 } }, { ...ctx, firstGame: null }),
    ).toEqual([])
  })
  it('keys alerts so the same change is never shown twice', () => {
    const cur = { ...base, injuries: { ...base.injuries, b: 'Out' } }
    const keys = alertsFor(base, cur, ctx).map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('stores the baseline per league', () => {
    saveBaseline('L9', base)
    expect(loadBaseline('L9')).toEqual(base)
    expect(loadBaseline('other')).toBeNull()
  })
})
