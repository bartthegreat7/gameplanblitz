import { bids, edge, findTrades, gameDay, lineupCheck, standings, topFreeAgents, valueRows } from './insights'
import type { SleeperLeague, SleeperMatchup } from './sleeper'
import { buildModel, player, roster } from '../test/fixtures'

const matchup = (roster_id: number, matchup_id: number, starters: string[]): SleeperMatchup => ({
  roster_id,
  matchup_id,
  points: 0,
  starters,
  players: starters,
})

/** Me (roster 1): RB1 starter @8, WR1 @10. Free agents: RB fa1 @9.5, RB fa2 @8.5, WR fa3 @4. */
function base(extra: { rbProj?: number } = {}) {
  return buildModel({
    players: {
      rb1: player('rb1', 'RB'),
      wr1: player('wr1', 'WR'),
      rb9: player('rb9', 'RB'),
      fa1: player('fa1', 'RB'),
      fa2: player('fa2', 'RB'),
      fa3: player('fa3', 'WR'),
      opp1: player('opp1', 'RB'),
    },
    rosters: [roster(1, 'u1', ['rb1', 'wr1', 'rb9']), roster(2, 'u2', ['opp1'])],
    startSlots: ['RB', 'WR'],
    proj: { rb1: extra.rbProj ?? 8, wr1: 10, rb9: 2, fa1: 9.5, fa2: 8.5, fa3: 4, opp1: 6 },
  })
}

describe('gameDay', () => {
  it('projects both lineups and a logistic win probability', () => {
    const m = base()
    const gd = gameDay(m, [matchup(1, 7, ['rb1', 'wr1']), matchup(2, 7, ['opp1'])])!
    expect(gd.myProj).toBe(18) // RB 8 + WR 10
    expect(gd.oppProj).toBe(6)
    expect(gd.winPct).toBe(Math.round(100 / (1 + Math.exp(-12 / 28))))
    expect(gd.myName).toBe('My Team')
    expect(gd.battles[0]).toMatchObject({ slot: 'RB', meWin: true })
    expect(gd.battles[1].opp.name).toBe('—') // opponent has no WR
  })
  it('is null when there is no matchup', () => {
    expect(gameDay(base(), [])).toBeNull()
  })
})

describe('lineupCheck', () => {
  it('flags empty slots and starters who are Out', () => {
    const m = buildModel({
      players: { rb1: player('rb1', 'RB', { injury_status: 'Out' }), wr1: player('wr1', 'WR') },
      rosters: [roster(1, 'u1', ['rb1', 'wr1'])],
      startSlots: ['RB', 'WR', 'TE'],
      proj: { rb1: 8, wr1: 10 },
    })
    const issues = lineupCheck(m, [matchup(1, 1, ['rb1', 'wr1', '0'])])!
    expect(issues.map((i) => i.title)).toEqual(['Empty TE slot', 'r. Player is Out'])
  })

  it('suggests a bench player who projects > 0.5 better in the same slot', () => {
    const m = buildModel({
      players: { rb1: player('rb1', 'RB'), rb2: player('rb2', 'RB') },
      rosters: [roster(1, 'u1', ['rb1', 'rb2'])],
      startSlots: ['RB'],
      proj: { rb1: 5, rb2: 9 },
    })
    const issues = lineupCheck(m, [matchup(1, 1, ['rb1'])])!
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toBe('Bench upgrade at RB')
  })

  it('reports no issues for a clean lineup', () => {
    expect(lineupCheck(base(), [matchup(1, 1, ['rb1', 'wr1'])])).toEqual([])
  })
})

describe('edge', () => {
  const ms = [matchup(1, 1, ['rb1', 'wr1'])]
  it('counts a free agent as an upgrade when he projects at least +1.0', () => {
    const e = edge(base(), ms)!
    expect(e.upgrades).toHaveLength(1)
    expect(e.upgrades[0]).toMatchObject({ from: 'rb1', to: 'fa1' })
    expect(e.upgrades[0].gain).toBeCloseTo(1.5)
    expect(e.upgradePts).toBeCloseTo(1.5)
  })
  it('ignores a free agent who is only +0.9 better', () => {
    expect(edge(base({ rbProj: 8.6 }), ms)!.upgrades).toHaveLength(0)
  })
})

describe('topFreeAgents', () => {
  it('lists unrostered players by projection, highest first', () => {
    expect(topFreeAgents(base(), 2).map((f) => f.id)).toEqual(['fa1', 'fa2'])
  })
})

describe('bids', () => {
  const league = (waiver_budget?: number) => ({ settings: { waiver_budget } }) as unknown as SleeperLeague
  const ms = [matchup(1, 1, ['rb1', 'wr1'])]

  it('suggests a share of remaining budget scaled by help over the weakest starter', () => {
    const m = buildModel({
      players: { rb1: player('rb1', 'RB'), fa1: player('fa1', 'RB') },
      rosters: [roster(1, 'u1', ['rb1'], { waiver_budget_used: 20 }), roster(2, 'u2', [], { waiver_budget_used: 50 })],
      startSlots: ['RB'],
      proj: { rb1: 4, fa1: 10 },
    })
    const b = bids(m, league(100), [matchup(1, 1, ['rb1'])])
    expect(b.left).toBe(80)
    expect(b.place).toBe(1) // I have $80 left; the rival has $50
    expect(b.maxOther).toBe(50)
    expect(b.rows[0]).toMatchObject({ id: 'fa1', help: 6, bid: 60 }) // round(6/8 * 80)
  })

  it('suggests $0 (null) when the upgrade is small, and detects rolling waivers', () => {
    const b = bids(base(), league(100), ms)
    expect(b.rows.every((r) => r.bid === null || r.help > 2)).toBe(true)
    expect(bids(base(), league(undefined), ms).usesFAAB).toBe(false)
  })
})

describe('standings', () => {
  it('sorts by wins then points for, combining integer and decimal parts', () => {
    const m = buildModel({
      players: {},
      rosters: [
        roster(1, 'u1', [], { wins: 5, losses: 2, fpts: 800, fpts_decimal: 50, fpts_against: 700, fpts_against_decimal: 25 }),
        roster(2, 'u2', [], { wins: 5, losses: 2, fpts: 810, fpts_decimal: 0 }),
        roster(3, 'u3', [], { wins: 6, losses: 1, fpts: 700 }),
      ],
      startSlots: [],
      proj: {},
    })
    const rows = standings(m)
    expect(rows.map((r) => r.rosterId)).toEqual([3, 2, 1])
    expect(rows[2].pf).toBeCloseTo(800.5)
    expect(rows[2].pa).toBeCloseTo(700.25)
    expect(rows[2].me).toBe(true)
  })
})

describe('valueRows', () => {
  it('blends season PPG with projection and sorts descending', () => {
    const m = buildModel({
      players: { a: player('a', 'RB'), b: player('b', 'WR') },
      rosters: [roster(1, 'u1', ['a', 'b'])],
      startSlots: [],
      proj: { a: 10, b: 16 },
      seasonStats: { a: { pts: 20, gp: 1 } }, // a: PPG 20
    })
    const rows = valueRows(m)
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']) // 16 (projection only) beats 15
    expect(rows[0]).toMatchObject({ value: 16, ppg: null })
    expect(rows[1]).toMatchObject({ value: 15 }) // .5 * 20 PPG + .5 * 10 proj
  })
})

describe('findTrades', () => {
  it('finds a fair swap that raises the weekly lineup', () => {
    const m = buildModel({
      players: { mine: player('mine', 'RB'), bench: player('bench', 'RB'), star: player('star', 'RB') },
      rosters: [roster(1, 'u1', ['mine']), roster(2, 'u2', ['star', 'bench'])],
      startSlots: ['RB'],
      proj: { mine: 8, star: 14, bench: 1 },
      fc: { mine: 1000, star: 1100, bench: 50 },
    })
    const deals = findTrades(m)
    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({ get: 'star', give: ['mine'], theirRosterId: 2 })
    expect(deals[0].you).toBeCloseTo(6)
    expect(deals[0].fair).toBe(Math.round((1 - 100 / 1100) * 100))
  })
  it('skips swaps that are unfair by value', () => {
    const m = buildModel({
      players: { mine: player('mine', 'RB'), star: player('star', 'RB') },
      rosters: [roster(1, 'u1', ['mine']), roster(2, 'u2', ['star'])],
      startSlots: ['RB'],
      proj: { mine: 8, star: 14 },
      fc: { mine: 300, star: 1100 },
    })
    expect(findTrades(m)).toEqual([])
  })
})
