import { fcParamsFor } from './fantasycalc'
import { f1, ordinal, relTime, toMillis, trunc } from './format'
import { buildNameIndex, matchPlayers } from './news'
import { normalizeProjections } from './sleeper'

describe('format', () => {
  it('f1 rounds to one decimal', () => {
    expect(f1(12.345)).toBe('12.3')
    expect(f1(null)).toBe('0.0')
  })
  it('ordinal handles teens and suffixes', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st',
    ])
  })
  it('trunc ellipsizes long names only', () => {
    expect(trunc('short', 20)).toBe('short')
    expect(trunc('a'.repeat(25), 20)).toBe('a'.repeat(19) + '…')
  })
  it('relTime buckets minutes, hours, days', () => {
    const now = 1_700_000_000_000
    expect(relTime(now - 10_000, now)).toBe('just now')
    expect(relTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(relTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relTime(now - 2 * 86_400_000, now)).toBe('2d ago')
  })
  it('toMillis accepts seconds, milliseconds and date strings', () => {
    expect(toMillis(1_700_000_000)).toBe(1_700_000_000_000)
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(toMillis(undefined, '2024-01-01T00:00:00Z')).toBe(Date.parse('2024-01-01T00:00:00Z'))
    expect(toMillis(undefined, 'nope')).toBeNaN()
  })
})

describe('normalizeProjections', () => {
  it('handles the array form', () => {
    const m = normalizeProjections([{ player_id: 'a', stats: { pts_ppr: 5 } }, { stats: {} }])
    expect([...m.keys()]).toEqual(['a'])
    expect(m.get('a')).toEqual({ pts_ppr: 5 })
  })
  it('handles the object form, with or without a stats wrapper', () => {
    const m = normalizeProjections({ a: { stats: { rec: 1 } }, b: { rec: 2 } })
    expect(m.get('a')).toEqual({ rec: 1 })
    expect(m.get('b')).toEqual({ rec: 2 })
  })
  it('returns an empty map for null', () => {
    expect(normalizeProjections(null).size).toBe(0)
  })
})

describe('fcParamsFor', () => {
  it('counts QB and SUPER_FLEX slots and reads PPR from scoring', () => {
    expect(
      fcParamsFor({ numTeams: 10, rosterCount: 12, scoring: { rec: 0.5 }, startSlots: ['QB', 'SUPER_FLEX', 'RB'] }),
    ).toEqual({ teams: 10, ppr: 0.5, qbs: 2 })
  })
  it('defaults to 1 PPR, 1 QB, and roster count when num_teams is absent', () => {
    expect(fcParamsFor({ rosterCount: 12, scoring: {}, startSlots: ['RB'] })).toEqual({ teams: 12, ppr: 1, qbs: 1 })
  })
})

describe('news → player matching', () => {
  const players = {
    p1: { position: 'WR', full_name: 'Ja’Marr Chase', first_name: 'Ja’Marr', last_name: 'Chase' },
    p2: { position: 'RB', full_name: 'Saquon Barkley', first_name: 'Saquon', last_name: 'Barkley' },
    d1: { position: 'DEF', first_name: 'Buffalo', last_name: 'Bills' },
  }
  const idx = buildNameIndex(['p1', 'p2', 'p3', 'd1'], {
    ...players,
    p3: { position: 'WR', full_name: 'Tank Bell', first_name: 'Tank', last_name: 'Bell' },
  })
  it('matches full names and 5+ letter last names', () => {
    expect(matchPlayers({ title: 'Saquon Barkley questionable' }, idx)).toEqual(['p2'])
    expect(matchPlayers({ title: 'Update', excerpt: 'Barkley practiced in full' }, idx)).toEqual(['p2'])
    expect(matchPlayers({ title: 'Chase has a big day' }, idx)).toEqual(['p1']) // "chase" is 5 letters
  })
  it('does not match last names under 5 letters, or defenses', () => {
    expect(matchPlayers({ title: 'Bell sits out the ball game' }, idx)).toEqual([])
    expect(matchPlayers({ title: 'Tank Bell is back' }, idx)).toEqual(['p3']) // full name still matches
    expect(matchPlayers({ title: 'Buffalo Bills win' }, idx)).toEqual([])
  })
})
