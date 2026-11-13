import type { SleeperMatchup } from '../sleeper'
import { pairGames, type WeekGames } from './league'
import { luckReport } from './luck'

const row = (roster_id: number, matchup_id: number, points: number): SleeperMatchup => ({ roster_id, matchup_id, points, starters: [], players: [] })
const week = (w: number, rows: SleeperMatchup[]): WeekGames => ({ week: w, games: pairGames(rows) })

/* Week 1: 1 (100) beats 2 (90); 4 (120) beats 3 (80). Week 2: 1 (70) beats 3 (60); 2 (110) beats 4 (100). */
const W = [
  week(1, [row(1, 1, 100), row(2, 1, 90), row(3, 2, 80), row(4, 2, 120)]),
  week(2, [row(1, 1, 70), row(3, 1, 60), row(2, 2, 110), row(4, 2, 100)]),
]

describe('expected wins and luck', () => {
  it('computes all-play, expected wins and luck from the weekly scores (luck sums to zero)', () => {
    const r = luckReport(W)
    const by = new Map(r.teams.map((t) => [t.rosterId, t]))
    expect(r.teams.map((t) => t.rosterId)).toEqual([1, 3, 2, 4]) // luckiest first
    expect(by.get(1)).toMatchObject({ w: 2, l: 0, allPlay: { w: 3, l: 3, t: 0 }, allPlayPct: 0.5 })
    expect(by.get(1)!.expectedWins).toBeCloseTo(1)
    expect(by.get(1)!.luck).toBeCloseTo(1)
    expect(by.get(2)!.expectedWins).toBeCloseTo(4 / 3)
    expect(by.get(4)!.luck).toBeCloseTo(-2 / 3)
    expect(r.teams.reduce((a, t) => a + t.luck, 0)).toBeCloseTo(0)
    expect(r.leagueAvg).toBeCloseTo(91.25)
    expect(by.get(1)!.sos).toBeCloseTo(75 - 91.25) // faced 90 and 60
    expect(by.get(1)!.pf).toBe(170)
    expect(by.get(1)!.pa).toBe(150)
  })

  it('tags lucky wins and unlucky losses by that week’s all-play share', () => {
    const r = luckReport(W)
    const by = new Map(r.teams.map((t) => [t.rosterId, t]))
    expect(by.get(1)!.weeks.map((w) => w.tag)).toEqual([null, 'lucky-win']) // 70 beat only one other score
    expect(by.get(4)!.weeks.map((w) => w.tag)).toEqual([null, 'unlucky-loss']) // 100 beat two of three
    expect(by.get(1)!.weeks[1]).toMatchObject({ allPlayWins: 1, allPlayOf: 3, result: 'W', oppPoints: 60 })
  })

  it('plays every team on every other schedule (a game against itself becomes one against the owner)', () => {
    const r = luckReport(W)
    expect([...r.swap.get(1)!]).toEqual([
      [1, 2],
      [2, 1], // week 1 vs 2 (owner, since 2 played 1): W; week 2 vs 4: L
      [3, 1],
      [4, 1],
    ])
    const t1 = r.teams.find((t) => t.rosterId === 1)!
    expect(t1.scheduleBest).toEqual({ wins: 2, with: 1 })
    expect(t1.scheduleWorst).toEqual({ wins: 1, with: 2 })
  })

  it('adds the median game to both actual and expected wins, so luck is unchanged', () => {
    const plain = luckReport(W)
    const med = luckReport(W, { medianGame: true })
    const t1 = med.teams.find((t) => t.rosterId === 1)!
    expect(t1).toMatchObject({ w: 3, l: 1 }) // above the median in week 1 (95), below it in week 2 (85)
    expect(t1.weeks.map((w) => w.median)).toEqual(['W', 'L'])
    expect(t1.expectedWins).toBeCloseTo(2)
    for (const t of med.teams) expect(t.luck).toBeCloseTo(plain.teams.find((p) => p.rosterId === t.rosterId)!.luck)
  })

  it('counts ties as half a win and ignores weeks with no scores', () => {
    const r = luckReport([week(1, [row(1, 1, 50), row(2, 1, 50)]), week(2, [row(1, 1, 0), row(2, 1, 0)])])
    expect(r.weeks).toBe(1)
    expect(r.teams[0]).toMatchObject({ w: 0, l: 0, t: 1, allPlay: { w: 0, l: 0, t: 1 }, expectedWins: 0.5, luck: 0 })
  })
})
