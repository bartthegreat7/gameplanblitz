import { buildModel, player, roster } from '../../test/fixtures'
import { createValuer } from './lineupValue'
import { EMPTY_SCENARIO, evaluateScenario, isEmpty } from './whatif'

/* Me (1): RB a 10, RB b 6, WR c 8. Rival (2): RB x 9, WR y 12. FA: RB f 14. One RB + one WR start. */
const players = {
  a: player('a', 'RB'),
  b: player('b', 'RB', { team: 'BBB' }),
  c: player('c', 'WR'),
  x: player('x', 'RB'),
  y: player('y', 'WR', { injury_status: 'Questionable' }),
  f: player('f', 'RB'),
}
const m = buildModel({
  players,
  rosters: [roster(1, 'u1', ['a', 'b', 'c']), roster(2, 'u2', ['x', 'y'])],
  startSlots: ['RB', 'WR'],
  proj: { a: 10, b: 6, c: 8, x: 9, y: 12, f: 14 },
})
const pts = { a: 10, b: 6, c: 8, x: 9, y: 12, f: 14 } as Record<string, number>
const horizon = [5, 6].map((week) => ({ week, proj: new Map(Object.entries(pts).map(([id, p]) => [id, { pts: p }])) }))
// week 6: team BBB on a bye
const schedule = [
  { game_id: '1', week: 5, status: 'pre_game', date: '', home: 'AAA', away: 'BBB' },
  { game_id: '2', week: 6, status: 'pre_game', date: '', home: 'AAA', away: 'CCC' },
]
const v = createValuer(m, horizon, schedule)
const weeks = [5, 6]

describe('alternate reality simulator', () => {
  it('leaves everything unchanged with no changes', () => {
    const r = evaluateScenario(m, v, weeks, EMPTY_SCENARIO, 2)
    expect(isEmpty(EMPTY_SCENARIO)).toBe(true)
    expect(r.mine.current).toEqual(r.mine.proposed)
    expect(r.mine.current.week0).toBe(18)
    expect(r.opp!.current.week0).toBe(21)
    expect(r.win!.current).toBe(r.win!.proposed)
  })

  it('forces a start this week only', () => {
    const r = evaluateScenario(m, v, weeks, { ...EMPTY_SCENARIO, forceStart: ['b'] }, 2)
    expect(r.mine.proposed.week0).toBe(14) // b (6) + c (8)
    expect(r.mine.proposed.weekly[1]).toBe(18) // next week back to the best lineup
    expect(r.win!.proposed).toBeLessThan(r.win!.current)
  })

  it('adds a free agent, drops a player, and models an injury for N weeks', () => {
    const add = evaluateScenario(m, v, weeks, { ...EMPTY_SCENARIO, adds: ['f'], drops: ['b'] }, 2)
    expect(add.mine.proposed.weekly).toEqual([22, 22])
    const hurt = evaluateScenario(m, v, weeks, { ...EMPTY_SCENARIO, injuries: [{ id: 'a', weeks: 1 }] }, 2)
    expect(hurt.mine.proposed.weekly).toEqual([14, 18]) // b fills in week 5; a is back in week 6
  })

  it('applies a trade to both teams and recomputes the matchup', () => {
    const r = evaluateScenario(m, v, weeks, { ...EMPTY_SCENARIO, trade: { rosterId: 2, give: ['c'], get: ['y'] } }, 2)
    expect(r.mine.proposed.week0).toBe(22) // a + y
    expect(r.opp!.proposed.week0).toBe(17) // x + c
    expect(r.win!.proposed).toBeGreaterThan(50)
    expect(r.partner).toBeNull() // the partner is this week's opponent
    expect(r.mine.proposed.designated).toEqual(['y'])
  })

  it('reports roster risk: byes ahead and bench depth', () => {
    const r = evaluateScenario(m, v, weeks, { ...EMPTY_SCENARIO, forceStart: ['b'] }, 2)
    expect(r.mine.proposed.byeHit).toEqual({ week: 6, count: 1 }) // b (BBB) is off in week 6
    expect(r.mine.current.benchDepth).toBe(6)
  })
})
