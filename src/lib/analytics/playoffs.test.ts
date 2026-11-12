import {
  bracketOrder,
  byeCount,
  gamesFrom,
  MIN_SD,
  mulberry32,
  normal,
  rankTeams,
  remainingSOS,
  simulate,
  teamModels,
  type Game,
  type SimInput,
  type StandingRow,
} from './playoffs'

const row = (rosterId: number, wins: number, losses: number, pf: number, ties = 0): StandingRow => ({ rosterId, wins, losses, ties, pf })
const team = (rosterId: number, mean: number, sd = 15) => ({ rosterId, mean, sd })

describe('randomness', () => {
  it('is reproducible for a seed and different across seeds', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const sa = Array.from({ length: 5 }, a)
    expect(Array.from({ length: 5 }, b)).toEqual(sa)
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa)
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true)
  })
  it('produces standard normal samples', () => {
    const rng = mulberry32(7)
    const xs = Array.from({ length: 20000 }, () => normal(rng))
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
    expect(Math.abs(m)).toBeLessThan(0.03)
    expect(Math.abs(sd - 1)).toBeLessThan(0.03)
  })
})

describe('teamModels', () => {
  const scores = new Map([
    [1, [100, 110, 120, 130]], // mean 115, sd 12.9
    [2, [90]], // too few games for its own sd
    [3, []], // no games at all
  ])
  const projected = new Map([[1, 125], [2, 100], [3, 95]])
  const ids = [1, 2, 3]

  it('uses season average, projection, or a 50/50 blend', () => {
    expect(teamModels({ rosterIds: ids, scores, projected, basis: 'season' })[0].mean).toBe(115)
    expect(teamModels({ rosterIds: ids, scores, projected, basis: 'projection' })[0].mean).toBe(125)
    expect(teamModels({ rosterIds: ids, scores, projected, basis: 'blend' })[0].mean).toBe(120)
  })
  it('falls back to the projection for a team with no games', () => {
    expect(teamModels({ rosterIds: ids, scores, projected, basis: 'season' })[2].mean).toBe(95)
  })
  it('uses the team\'s own volatility with 3+ games, else the pooled league value, never below the floor', () => {
    const t = teamModels({ rosterIds: ids, scores, projected, basis: 'blend' })
    expect(t[0].sd).toBeCloseTo(Math.sqrt(500 / 3), 6)
    expect(t[1].sd).toBe(t[2].sd) // both pooled
    expect(t[1].sd).toBeGreaterThanOrEqual(MIN_SD)
    const flat = teamModels({ rosterIds: [1], scores: new Map([[1, [100, 100, 100, 100]]]), projected: new Map(), basis: 'season' })
    expect(flat[0].sd).toBe(MIN_SD)
  })
})

describe('bracketOrder', () => {
  it('places top seeds apart so 1 and 2 can only meet in the final', () => {
    expect(bracketOrder(2)).toEqual([1, 2])
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3])
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe('rankTeams', () => {
  it('orders by wins (ties count half), then points for', () => {
    const r = rankTeams([row(1, 5, 4, 1000), row(2, 5, 4, 1100), row(3, 6, 3, 900), row(4, 4, 4, 1500, 1)], mulberry32(1))
    expect(r.map((x) => x.rosterId)).toEqual([3, 2, 1, 4]) // 4 has 4.5 effective wins
  })
})

describe('simulate', () => {
  const base: SimInput = {
    teams: [team(1, 120), team(2, 110), team(3, 100), team(4, 90)],
    standings: [row(1, 3, 1, 450), row(2, 2, 2, 430), row(3, 2, 2, 410), row(4, 1, 3, 380)],
    remaining: [
      { week: 5, home: 1, away: 2 }, { week: 5, home: 3, away: 4 },
      { week: 6, home: 1, away: 3 }, { week: 6, home: 2, away: 4 },
    ],
    playoffTeams: 2,
    sims: 3000,
    seed: 2026,
  }

  it('is exactly reproducible for the same seed', () => {
    expect(simulate(base)).toEqual(simulate(base))
    expect(simulate({ ...base, seed: 2027 })).not.toEqual(simulate(base))
  })

  it('awards exactly the playoff spots and one champion per simulation', () => {
    const o = simulate(base)
    expect(o.reduce((a, t) => a + t.playoffPct, 0)).toBeCloseTo(200, 6)
    expect(o.reduce((a, t) => a + t.championPct, 0)).toBeCloseTo(100, 6)
    expect(o.reduce((a, t) => a + t.firstSeedPct, 0)).toBeCloseTo(100, 6)
    for (const t of o) expect(t.seedPct.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
  })

  it('favors better and higher-placed teams', () => {
    const o = simulate(base)
    expect(o[0].playoffPct).toBeGreaterThan(o[3].playoffPct)
    expect(o[0].championPct).toBeGreaterThan(o[3].championPct)
    expect(o[0].avgSeed).toBeLessThan(o[3].avgSeed)
  })

  it('is decided by the standings when no games remain (ties broken by points for)', () => {
    const o = simulate({ ...base, remaining: [], standings: [row(1, 3, 1, 400), row(2, 3, 1, 450), row(3, 2, 2, 999), row(4, 0, 4, 0)] })
    expect(o.map((t) => t.playoffPct)).toEqual([100, 100, 0, 0])
    expect(o[1].firstSeedPct).toBe(100) // same record, more points
  })

  it('makes a dominant team a near-lock', () => {
    const o = simulate({ ...base, teams: [team(1, 200, 10), team(2, 60, 10), team(3, 60, 10), team(4, 60, 10)], standings: base.standings.map((r) => ({ ...r, wins: 2, losses: 2 })) })
    expect(o[0].playoffPct).toBeGreaterThan(99)
    expect(o[0].championPct).toBeGreaterThan(95)
  })

  it('gives a team better odds when it wins a game than when it loses it', () => {
    const win = simulate({ ...base, forced: [{ week: 5, rosterId: 3, result: 'W' }] })
    const lose = simulate({ ...base, forced: [{ week: 5, rosterId: 3, result: 'L' }] })
    expect(win[2].playoffPct).toBeGreaterThan(lose[2].playoffPct)
    expect(win[2].avgWins).toBeGreaterThan(lose[2].avgWins)
  })

  it('a forced result is always honored', () => {
    const o = simulate({ ...base, sims: 500, forced: [{ week: 5, rosterId: 4, result: 'W' }, { week: 6, rosterId: 4, result: 'W' }] })
    expect(o[3].avgWins).toBeCloseTo(3, 9) // 1 win now + both remaining games, every time
  })

  it('gives byes to the top seeds when the bracket is not a power of two', () => {
    const six: SimInput = {
      ...base,
      teams: Array.from({ length: 8 }, (_, i) => team(i + 1, 100)),
      standings: Array.from({ length: 8 }, (_, i) => row(i + 1, 8 - i, i, 1000 - i)),
      remaining: [],
      playoffTeams: 6,
    }
    const o = simulate(six)
    expect(o.map((t) => t.byePct)).toEqual([100, 100, 0, 0, 0, 0, 0, 0])
    expect(o.map((t) => t.playoffPct)).toEqual([100, 100, 100, 100, 100, 100, 0, 0])
    expect(o.slice(6).every((t) => t.championPct === 0)).toBe(true)
    expect(o.reduce((a, t) => a + t.championPct, 0)).toBeCloseTo(100, 6)
  })
})

describe('schedule helpers', () => {
  it('pairs Sleeper matchups by matchup_id and skips byes', () => {
    const g = gamesFrom([{ week: 7, matchups: [
      { roster_id: 1, matchup_id: 1 }, { roster_id: 2, matchup_id: 2 }, { roster_id: 3, matchup_id: 1 }, { roster_id: 4, matchup_id: 2 }, { roster_id: 5, matchup_id: null },
    ] }])
    expect(g).toEqual([{ week: 7, home: 1, away: 3 }, { week: 7, home: 2, away: 4 }])
  })
  it('measures remaining strength of schedule against the league average', () => {
    const games: Game[] = [{ week: 5, home: 1, away: 2 }, { week: 6, home: 3, away: 1 }]
    const s = remainingSOS(1, games, [team(1, 100), team(2, 130), team(3, 120), team(4, 90)])
    expect(s.games).toBe(2)
    expect(s.vsAvg).toBeCloseTo(125 - 110) // opponents average 125; league average 110
    expect(remainingSOS(4, games, [team(1, 100)])).toEqual({ games: 0, vsAvg: 0 })
  })
})

describe('byeCount', () => {
  it('gives byes to fill the bracket to a power of two', () => {
    expect([1, 2, 4, 6, 7, 8, 10, 12].map(byeCount)).toEqual([0, 0, 0, 2, 1, 0, 6, 4])
  })
})
