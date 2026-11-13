import { buildModel, player, roster } from '../../test/fixtures'
import { CADENCE, focusFor, mergeHistory, recStatus } from './autopilot'
import type { GmAction } from './gm'
import { byeWeeks, leagueXray, movesByRoster, tradePartners } from './xray'

/* 4 teams, slots QB + RB + WR. Team 1: strong QB/RB, weak WR. Team 2: strong WR, weak RB. */
const P = (id: string, pos: string, team = 'AAA', extra = {}) => player(id, pos, { team, ...extra })
const m = buildModel({
  players: {
    q1: P('q1', 'QB'), r1: P('r1', 'RB'), w1: P('w1', 'WR', 'BBB'), r1b: P('r1b', 'RB', 'CCC'),
    q2: P('q2', 'QB'), r2: P('r2', 'RB'), w2: P('w2', 'WR', 'BBB', { injury_status: 'Questionable' }), w2b: P('w2b', 'WR'),
    q3: P('q3', 'QB'), r3: P('r3', 'RB'), w3: P('w3', 'WR'),
    q4: P('q4', 'QB'), r4: P('r4', 'RB'), w4: P('w4', 'WR'),
  },
  rosters: [
    roster(1, 'u1', ['q1', 'r1', 'w1', 'r1b']),
    roster(2, 'u2', ['q2', 'r2', 'w2', 'w2b']),
    roster(3, 'u3', ['q3', 'r3', 'w3']),
    roster(4, 'u4', ['q4', 'r4', 'w4']),
  ],
  startSlots: ['QB', 'RB', 'WR'],
  proj: { q1: 25, r1: 20, w1: 5, r1b: 12, q2: 15, r2: 5, w2: 22, w2b: 9, q3: 18, r3: 12, w3: 12, q4: 17, r4: 11, w4: 11 },
  fc: { q1: 100, r1: 200 },
})

describe('league x-ray', () => {
  const byes = byeWeeks(
    [
      { week: 6, home: 'AAA', away: 'XXX' },
      { week: 7, home: 'BBB', away: 'XXX' },
      { week: 7, home: 'CCC', away: 'YYY' },
    ],
    6,
    7,
  )
  const xs = leagueXray(m, {
    byeWeeksOf: byes,
    transactions: [
      { type: 'waiver', status: 'complete', adds: { r1b: 1 }, roster_ids: [1] },
      { type: 'free_agent', status: 'failed', adds: { x: 1 } },
      { type: 'trade', status: 'complete', roster_ids: [1, 2], adds: { a: 1, b: 2 } },
    ],
  })
  const t1 = xs.find((x) => x.rosterId === 1)!
  const t2 = xs.find((x) => x.rosterId === 2)!

  it('ranks every team at each position and finds strengths and weaknesses', () => {
    expect(t1.total).toBe(50)
    expect(t1.groups.get('QB')).toEqual({ proj: 25, rank: 1 })
    expect(t1.strengths).toEqual(['QB', 'RB'])
    expect(t1.weaknesses).toEqual(['WR'])
    expect(t2.strengths).toEqual(['WR'])
    expect(t2.weaknesses).toEqual(['QB', 'RB'])
  })

  it('measures bench depth, injured starters, bye exposure, market value and moves', () => {
    expect(t1.bench).toEqual([{ id: 'r1b', proj: 12 }])
    expect(t2.injured).toEqual([{ id: 'w2', status: 'Questionable' }])
    expect(t1.byeWorst).toEqual({ week: 7, count: 2 }) // q1 and r1 (AAA) are off in week 7
    expect(t1.value).toBe(300)
    expect(t1.moves).toEqual({ adds: 1, trades: 1 })
    expect(movesByRoster([]).size).toBe(0)
    expect(byes('ZZZ')).toEqual([]) // unknown team: never assumed on a bye
  })

  it('pairs complementary rosters as trade partners, never claiming intent', () => {
    const fits = tradePartners(xs, 1)
    expect(fits[0]).toEqual({ rosterId: 2, theyNeed: ['QB', 'RB'], youNeed: ['WR'] })
    expect(fits.every((f) => f.theyNeed.length && f.youNeed.length)).toBe(true)
  })
})

describe('autopilot', () => {
  const act = (id: string, priority: 1 | 2 | 3 = 2): GmAction => ({ id, area: 'lineup', priority, title: `Do ${id}`, detail: '', impact: '+1', confidence: null, sources: [], to: '/lineup' })

  it('follows the weekly cadence', () => {
    expect(focusFor(2).label).toBe('Tuesday')
    expect(focusFor(3).label).toBe('Tuesday') // Wednesday keeps Tuesday's focus
    expect(focusFor(5).label).toBe('Thursday')
    expect(focusFor(0).label).toBe('Sunday')
    expect(CADENCE).toHaveLength(5)
  })

  it('records each recommendation once per week and reports what cleared', () => {
    let h = mergeHistory([], 5, [act('a'), act('b')], 100)
    h = mergeHistory(h, 5, [act('a', 1)], 200)
    expect(h).toHaveLength(2)
    expect(h.find((e) => e.actionId === 'a')).toMatchObject({ firstSeen: 100, lastSeen: 200, priority: 1 })
    const now = new Set(['a'])
    expect(recStatus(h.find((e) => e.actionId === 'a')!, 5, now)).toBe('active')
    expect(recStatus(h.find((e) => e.actionId === 'b')!, 5, now)).toBe('cleared')
    expect(recStatus(h[0], 6, now)).toBe('earlier-week')
  })
})
