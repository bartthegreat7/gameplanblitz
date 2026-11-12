import { rateConfidence } from '../evidence'
import { optimalLineup } from '../lineup'
import { buildModel, player, roster } from '../../test/fixtures'
import { analyzeLineup } from './lineupAnalysis'
import { signed } from '../format'
import { hungarian, optimalAssignment, pairDisplaced, planLineup, STABILITY, type Candidate } from './lineupPlan'
import { buildHistory, type GameLog } from './history'
import { defenseKey, defenseVsPosition } from './matchup'
import { hasStarted, isBye, weekContext } from './schedule'
import { usageTrend } from './usage'
import { playerSpread, positionSds, projectionRange, sampleSd, Z80 } from './volatility'

/* ---------------- helpers ---------------- */

const log = (week: number, pts: number, snapShare: number | null = null): GameLog => ({ week, pts, snapShare, opponent: null, team: null })
const cand = (id: string, pos: string, proj: number, o: Partial<Candidate> = {}): Candidate => ({
  id, name: id, pos, team: `T${id}`, opponent: null, proj, sd: null, floor: null, ceiling: null,
  n: 0, injury: '', out: false, bye: false, started: false, usage: null, matchup: null, ...o,
})
const pool = (...cs: Candidate[]) => new Map(cs.map((c) => [c.id, c]))

/* ---------------- assignment ---------------- */

describe('optimalAssignment', () => {
  const POS: Record<string, string> = { wr1: 'WR', rb1: 'RB', te1: 'TE' }
  const VAL: Record<string, number> = { wr1: 10, rb1: 9, te1: 1 }
  const slots = ['WRRB_FLEX', 'REC_FLEX'] // RB/WR flex and WR/TE flex overlap without nesting

  it('beats greedy fill when flex slots overlap (regression)', () => {
    const ids = ['wr1', 'rb1', 'te1']
    const greedy = optimalLineup(ids, slots, (id) => POS[id], (id) => VAL[id])
    const greedyTotal = greedy.reduce((t, s) => t + (s.pick?.pj ?? 0), 0)
    expect(greedyTotal).toBe(11) // WR takes the first flex, TE is forced into the second

    const exact = optimalAssignment(slots, ids.map((id) => ({ id, pos: POS[id], value: VAL[id] })))
    expect(exact).toEqual(['rb1', 'wr1']) // RB in the RB/WR flex, WR in the WR/TE flex
    expect(exact.reduce((t, id) => t + VAL[id!], 0)).toBe(19)
  })

  it('leaves a slot empty when nobody is eligible, and never reuses a player', () => {
    expect(optimalAssignment(['RB', 'RB', 'TE'], [{ id: 'a', pos: 'RB', value: 5 }])).toEqual(['a', null, null])
  })

  it('prefers a zero-value eligible player over an empty slot', () => {
    expect(optimalAssignment(['RB'], [{ id: 'a', pos: 'RB', value: 0 }])).toEqual(['a'])
  })

  it('keeps players in their current slots when it costs nothing', () => {
    const players = [
      { id: 'x', pos: 'RB', value: 10 },
      { id: 'y', pos: 'RB', value: 10 },
    ]
    expect(optimalAssignment(['RB', 'RB'], players, ['y', 'x'])).toEqual(['y', 'x'])
    expect(optimalAssignment(['RB', 'RB'], players, ['x', 'y'])).toEqual(['x', 'y'])
  })

  it('does not hold a player in place when moving him is worth real points', () => {
    const players = [
      { id: 'cur', pos: 'RB', value: 5 },
      { id: 'better', pos: 'RB', value: 5 + STABILITY * 100 },
    ]
    expect(optimalAssignment(['RB'], players, ['cur'])).toEqual(['better'])
  })

  it('matches brute force on random small leagues (seeded)', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const allSlots = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'WRRB_FLEX', 'REC_FLEX', 'SUPER_FLEX']
    const allPos = ['QB', 'RB', 'WR', 'TE']
    const ELIG: Record<string, string[]> = {
      QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
      WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    }
    for (let trial = 0; trial < 40; trial++) {
      const slots = Array.from({ length: 4 }, () => allSlots[Math.floor(rnd() * allSlots.length)])
      const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, pos: allPos[Math.floor(rnd() * 4)], value: Math.round(rnd() * 200) / 10 }))
      // brute force: best total over all injective, eligibility-respecting assignments (slots may stay empty)
      let best = 0
      const go = (i: number, used: Set<string>, total: number) => {
        if (i === slots.length) return void (best = Math.max(best, total))
        go(i + 1, used, total) // empty
        for (const p of players) if (!used.has(p.id) && ELIG[slots[i]].includes(p.pos)) go(i + 1, new Set(used).add(p.id), total + p.value)
      }
      go(0, new Set(), 0)
      const got = optimalAssignment(slots, players).reduce((t, id) => t + (players.find((p) => p.id === id)?.value ?? 0), 0)
      expect(got).toBeCloseTo(best, 6)
    }
  })
})

describe('hungarian', () => {
  it('solves a known 3x3 minimum-cost assignment', () => {
    // rows pick columns [1, 0, 2] with total cost 1 + 2 + 3 = 6... verify against brute force below
    const cost = [[4, 1, 3], [2, 0, 5], [3, 2, 2]]
    const pick = hungarian(cost)
    const total = pick.reduce((t, c, r) => t + cost[r][c], 0)
    expect(total).toBe(5) // 1 (r0,c1) + 2 (r1,c0) + 2 (r2,c2)
  })
})

/* ---------------- volatility, usage, matchup, schedule, history ---------------- */

describe('volatility', () => {
  it('sampleSd uses n-1', () => {
    expect(sampleSd([10, 12, 14])).toBe(2)
    expect(sampleSd([5])).toBe(0)
  })

  it('pools positional sd from players with enough games only', () => {
    const history = new Map<string, GameLog[]>([
      ['a', [10, 12, 14, 16].map((p, i) => log(i + 1, p))], // ss = 20, df = 3
      ['b', [8, 8, 8, 8].map((p, i) => log(i + 1, p))], // ss = 0, df = 3
      ['c', [100, 0, 100].map((p, i) => log(i + 1, p))], // only 3 games: ignored
    ])
    const sds = positionSds(history, () => 'RB')
    expect(sds.get('RB')).toBeCloseTo(Math.sqrt(20 / 6), 10)
  })

  it('shrinks a player toward the positional sd', () => {
    const games = [10, 12, 14, 16].map((p, i) => log(i + 1, p))
    const s2 = 20 / 3
    const spread = playerSpread(games, 4)
    expect(spread.n).toBe(4)
    expect(spread.mean).toBe(13)
    expect(spread.lowSample).toBe(false)
    expect(spread.sd).toBeCloseTo(Math.sqrt((3 * s2 + 3 * 16) / 6), 10)
  })

  it('uses the positional sd for a player with ≤1 game, and is unknown with no basis at all', () => {
    expect(playerSpread([log(1, 9)], 4).sd).toBe(4)
    expect(playerSpread(undefined, 4)).toMatchObject({ n: 0, mean: null, sd: 4, lowSample: true })
    expect(playerSpread(undefined, undefined).sd).toBeNull()
    expect(playerSpread([log(1, 9)], undefined).sd).toBeNull()
  })

  it('builds a 10th–90th percentile range floored at zero', () => {
    const r = projectionRange(10, 2)!
    expect(r.floor).toBeCloseTo(10 - Z80 * 2, 10)
    expect(r.ceiling).toBeCloseTo(10 + Z80 * 2, 10)
    expect(projectionRange(1, 2)!.floor).toBe(0)
    expect(projectionRange(10, null)).toBeNull()
  })
})

describe('usageTrend', () => {
  it('flags a rising snap share (last 3 vs season)', () => {
    const t = usageTrend([0.5, 0.5, 0.5, 0.7, 0.7, 0.7].map((s, i) => log(i + 1, 10, s)))!
    expect(t.recent).toBeCloseTo(0.7)
    expect(t.season).toBeCloseTo(0.6)
    expect(t.label).toBe('rising')
  })
  it('flags falling and steady', () => {
    expect(usageTrend([0.8, 0.8, 0.8, 0.5, 0.5, 0.5].map((s, i) => log(i + 1, 10, s)))!.label).toBe('falling')
    expect(usageTrend([0.6, 0.62, 0.6, 0.61].map((s, i) => log(i + 1, 10, s)))!.label).toBe('steady')
  })
  it('is null without enough snap data', () => {
    expect(usageTrend([0.5, 0.6, 0.7].map((s, i) => log(i + 1, 10, s)))).toBeNull()
    expect(usageTrend([1, 2, 3, 4].map((p, i) => log(i + 1, p, null)))).toBeNull()
    expect(usageTrend(undefined)).toBeNull()
  })
})

describe('defenseVsPosition', () => {
  const row = (player_id: string, opponent: string, pts: number, played = 1) => ({ player_id, opponent, stats: { pts, gp: played } })
  const pos: Record<string, string> = { rb1: 'RB', rb2: 'RB', wr1: 'WR', k1: 'K' }
  const weeks = [{ week: 1, rows: [row('rb1', 'DEN', 20), row('rb2', 'KC', 10), row('wr1', 'DEN', 5), row('k1', 'DEN', 99), row('rb1', 'DEN', 50, 0)] }]
  const map = defenseVsPosition(weeks, { pts: 1 }, (id) => pos[id])

  it('ranks defenses by points allowed per game, 1 = most generous', () => {
    expect(map.get(defenseKey('DEN', 'RB'))).toMatchObject({ perGame: 20, rank: 1, of: 2, leagueAvg: 15 })
    expect(map.get(defenseKey('KC', 'RB'))).toMatchObject({ perGame: 10, rank: 2 })
  })
  it('ignores kickers, and players who did not play', () => {
    expect(map.has(defenseKey('DEN', 'K'))).toBe(false)
    expect(map.get(defenseKey('DEN', 'RB'))!.perGame).toBe(20) // the unplayed 50 is excluded
  })
  it('counts a defense with no yardage to a position as 0 allowed', () => {
    expect(map.get(defenseKey('KC', 'WR'))).toMatchObject({ perGame: 0, rank: 2 })
  })
})

describe('schedule context', () => {
  const games = [
    { game_id: '1', week: 5, status: 'complete', date: '', home: 'AAA', away: 'BBB' },
    { game_id: '2', week: 5, status: 'pre_game', date: '', home: 'CCC', away: 'DDD' },
    { game_id: '3', week: 6, status: 'pre_game', date: '', home: 'AAA', away: 'EEE' },
  ]
  const ctx = weekContext(games, 5)
  it('maps opponents and detects byes among known teams only', () => {
    expect(ctx.opponent.get('AAA')).toBe('BBB')
    expect(isBye(ctx, 'EEE')).toBe(true) // known team, no game in week 5
    expect(isBye(ctx, 'ZZZ')).toBe(false) // never in the schedule: not flagged
    expect(isBye(ctx, '')).toBe(false)
  })
  it('flags no one as on a bye when the schedule has no games at all for the week', () => {
    // week 9 is absent from the data: that is missing data, not a league-wide bye
    const empty = weekContext(games, 9)
    expect(empty.known.has('AAA')).toBe(true)
    expect(isBye(empty, 'AAA')).toBe(false)
    expect(isBye(empty, 'EEE')).toBe(false)
  })
  it('treats anything other than pre_game as started (locked)', () => {
    expect(hasStarted(ctx, 'AAA')).toBe(true)
    expect(hasStarted(ctx, 'CCC')).toBe(false)
    expect(hasStarted(ctx, 'EEE')).toBe(false)
    expect(hasStarted(weekContext([{ ...games[1], status: 'in_progress' }], 5), 'CCC')).toBe(true)
  })
})

describe('buildHistory', () => {
  it('records only games played, with league-scored points and snap share', () => {
    const h = buildHistory(
      [
        { week: 2, rows: [{ player_id: 'a', stats: { pts: 7, gp: 1, off_snp: 30, tm_off_snp: 60 }, opponent: 'DEN' }] },
        { week: 1, rows: [{ player_id: 'a', stats: { pts: 3, gp: 1 } }, { player_id: 'a', stats: { pts: 99, gp: 0 } }, { player_id: 'b', stats: { pts: 50 } }] },
      ],
      { pts: 1 },
    )
    expect(h.get('a')!.map((g) => [g.week, g.pts, g.snapShare])).toEqual([[1, 3, null], [2, 7, 0.5]]) // sorted by week
    expect(h.get('a')![1].opponent).toBe('DEN')
    expect(h.has('b')).toBe(false) // no games played
  })
})

/* ---------------- confidence rubric ---------------- */

describe('rateConfidence', () => {
  it.each([
    [{ marginZ: 1, sampleOk: true, injuryFlag: false }, 4, 'high'],
    [{ marginZ: 0.75, sampleOk: true, injuryFlag: false }, 4, 'high'],
    [{ marginZ: 0.35, sampleOk: true, injuryFlag: false }, 3, 'medium'],
    [{ marginZ: 0.5, sampleOk: false, injuryFlag: false }, 2, 'medium'],
    [{ marginZ: 0.1, sampleOk: false, injuryFlag: false }, 1, 'low'],
    [{ marginZ: 0, sampleOk: false, injuryFlag: true }, -1, 'low'],
  ])('%j → %i points, %s', (factors, points, level) => {
    const c = rateConfidence(factors)
    expect(c.points).toBe(points)
    expect(c.level).toBe(level)
    expect(c.notes).toHaveLength(3)
  })
})

/* ---------------- displaced-player pairing ---------------- */

describe('pairDisplaced', () => {
  it('pairs each newcomer with a benched player of the same position first', () => {
    const m = pairDisplaced(
      [cand('wrIn', 'WR', 12), cand('rbIn', 'RB', 9)],
      [cand('rbOut', 'RB', 5), cand('wrOut', 'WR', 6)],
    )
    expect(m.get('wrIn')!.id).toBe('wrOut')
    expect(m.get('rbIn')!.id).toBe('rbOut')
  })
  it('falls back to the highest-projected remaining player, and to null when none remain', () => {
    const m = pairDisplaced([cand('teIn', 'TE', 9), cand('wrIn', 'WR', 8)], [cand('rbOut', 'RB', 5)])
    expect(m.get('teIn')!.id).toBe('rbOut')
    expect(m.get('wrIn')).toBeNull() // filling a slot, nobody displaced
  })
})

describe('signed', () => {
  it('formats gains and losses, with a true minus sign', () => {
    expect(signed(3.74)).toBe('+3.7')
    expect(signed(-1.7)).toBe('−1.7')
    expect(signed(0)).toBe('+0.0')
    expect(signed(-0.01)).toBe('+0.0') // rounds to zero: no "−0.0"
  })
})

/* ---------------- lineup plan ---------------- */

describe('planLineup', () => {
  const plan = (slots: string[], starters: string[], cs: Candidate[], mode: 'projection' | 'floor' | 'ceiling' = 'projection') =>
    planLineup({ startSlots: slots, currentStarters: starters, candidates: pool(...cs), mode, provider: 'testco' })

  it('replaces an Out starter with the best healthy bench player, with reasons and confidence', () => {
    const p = plan(['RB', 'WR'], ['rbOut', 'wr1'], [
      cand('rbOut', 'RB', 12, { out: true, injury: 'Out' }),
      cand('rbBench', 'RB', 7),
      cand('wr1', 'WR', 9),
    ])
    const s = p.slots[0]
    expect(s.changed).toBe(true)
    expect(s.recommended!.id).toBe('rbBench')
    expect(s.delta).toBe(7) // vs an effective 0 for the Out player
    expect(s.reasons.join(' ')).toMatch(/listed Out/)
    // certain fact = full margin (+2), no injury flag (+1), no game sample (0) → 3 = medium
    expect(s.confidence).toMatchObject({ level: 'medium', points: 3 })
    expect(p.slots[1].changed).toBe(false)
    expect(p.current.proj).toBe(9) // the Out player counts as 0
    expect(p.recommended.proj).toBe(16)
  })

  it('never moves a player whose game has started, nor starts one who already played', () => {
    const p = plan(['RB', 'WR'], ['rb1', 'wr1'], [
      cand('rb1', 'RB', 5, { started: true }),
      cand('rb2', 'RB', 20),
      cand('rbDone', 'RB', 30, { started: true }),
      cand('wr1', 'WR', 9),
    ])
    expect(p.slots[0]).toMatchObject({ locked: true, changed: false })
    expect(p.slots[0].recommended!.id).toBe('rb1')
    expect(p.slots[0].reasons[0]).toMatch(/Locked/)
    // rb2 cannot take the locked RB slot, and rbDone cannot be started: WR slot is unchanged too
    expect(p.slots.every((s) => !s.changed)).toBe(true)
  })

  it('does not start a bench player whose game already happened, even if he would win an open slot', () => {
    // Two open RB slots, both current starters have not played. The bench RB is the best player
    // available (30), but his game is over, so he can no longer be started in Sleeper.
    const p = plan(['RB', 'RB'], ['a', 'b'], [
      cand('a', 'RB', 5),
      cand('b', 'RB', 6),
      cand('benchDone', 'RB', 30, { started: true }),
      cand('benchLive', 'RB', 7),
    ])
    const starting = p.slots.map((s) => s.recommended!.id)
    expect(starting).not.toContain('benchDone')
    expect(starting.sort()).toEqual(['b', 'benchLive']) // best two players who can still be started
  })

  it('locks a started starter in place while still optimizing the open slots around him', () => {
    const p = plan(['RB', 'RB'], ['played', 'b'], [
      cand('played', 'RB', 2, { started: true }),
      cand('b', 'RB', 6),
      cand('benchLive', 'RB', 9),
    ])
    expect(p.slots[0]).toMatchObject({ locked: true, changed: false })
    expect(p.slots[1].recommended!.id).toBe('benchLive') // open slot still improves
  })

  it('never recommends a lineup worse than a legal current one (property test, seeded)', () => {
    let seed = 987
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const ELIG: Record<string, string[]> = {
      QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    }
    const slotNames = Object.keys(ELIG)
    const poss = ['QB', 'RB', 'WR', 'TE']
    for (let trial = 0; trial < 60; trial++) {
      const slots = Array.from({ length: 5 }, () => slotNames[Math.floor(rnd() * slotNames.length)])
      const cs = Array.from({ length: 9 }, (_, i) =>
        cand(`p${i}`, poss[Math.floor(rnd() * 4)], Math.round(rnd() * 250) / 10, {
          out: rnd() < 0.1, bye: rnd() < 0.1, started: rnd() < 0.15,
        }),
      )
      // build a LEGAL current lineup: each slot gets a distinct, position-eligible player (or stays empty)
      const used = new Set<string>()
      const starters = slots.map((s) => {
        const pick = cs.find((c) => !used.has(c.id) && ELIG[s].includes(c.pos) && rnd() < 0.7)
        if (pick) used.add(pick.id)
        return pick?.id ?? '0'
      })
      for (const mode of ['projection', 'floor', 'ceiling'] as const) {
        const cands = cs.map((c) => ({ ...c, floor: c.proj * 0.6, ceiling: c.proj * 1.4 }))
        const p = planLineup({ startSlots: slots, currentStarters: starters, candidates: pool(...cands), mode, provider: null })
        if (mode === 'projection') expect(p.recommended.proj).toBeGreaterThanOrEqual(p.current.proj - 1e-9)
        // no player appears twice, and every recommended player fits his slot
        const ids = p.slots.map((s) => s.recommended?.id).filter(Boolean)
        expect(new Set(ids).size).toBe(ids.length)
        p.slots.forEach((s) => s.recommended && expect(ELIG[s.slot]).toContain(s.recommended.pos))
        // nobody unavailable is newly recommended
        p.slots.forEach((s) => {
          if (s.changed && s.recommended) {
            expect(s.recommended.out).toBe(false)
            expect(s.recommended.bye).toBe(false)
            expect(s.recommended.started).toBe(false)
          }
        })
      }
    }
  })

  it('explains a reshuffle as a move plus a new starter judged against the player he displaces', () => {
    // RB slot: Etienne (11.3). FLEX slot: Kelce, an RB (15.0). Bench: Waddle, a WR (13.3).
    // Waddle can only start at FLEX, so Kelce moves to RB and Etienne sits: net +2.0.
    const p = plan(['RB', 'FLEX'], ['etienne', 'kelce'], [
      cand('etienne', 'RB', 11.3),
      cand('kelce', 'RB', 15),
      cand('waddle', 'WR', 13.3),
    ])
    expect(p.start.map((c) => c.id)).toEqual(['waddle'])
    expect(p.sit.map((c) => c.id)).toEqual(['etienne'])
    expect(p.recommended.proj - p.current.proj).toBeCloseTo(2)

    const [rb, flex] = p.slots
    expect(rb).toMatchObject({ move: true, changed: true, delta: 0, confidence: null })
    expect(rb.recommended!.id).toBe('kelce')
    expect(rb.reasons[0]).toMatch(/moves here from FLEX/)

    expect(flex).toMatchObject({ move: false, changed: true })
    expect(flex.recommended!.id).toBe('waddle')
    expect(flex.partner!.id).toBe('etienne') // judged against the benched RB, not against Kelce
    expect(flex.delta).toBeCloseTo(2) // never the misleading slot-level -1.7
    expect(flex.reasons[0]).toMatch(/Start waddle \(13\.3 proj\) over etienne \(11\.3\): \+2\.0/)
    expect(flex.reasons.join(' ')).toMatch(/kelce stays in your lineup, moving to RB/)
    expect(flex.confidence).not.toBeNull()
    // per-pair gains add up to the lineup's net change
    expect(p.slots.reduce((t, s) => t + s.delta, 0)).toBeCloseTo(p.recommended.proj - p.current.proj)
  })

  it('does not call a player "benched" when nobody can replace him', () => {
    // the only TE is on a bye: nothing to swap in, so he stays put (flagged), and is not in `sit`
    const p = plan(['TE', 'RB'], ['te', 'rbOut'], [
      cand('te', 'TE', 0, { bye: true }),
      cand('rbOut', 'RB', 9, { out: true, injury: 'Out' }),
      cand('rbBench', 'RB', 6),
    ])
    expect(p.sit.map((c) => c.id)).toEqual(['rbOut']) // replaced by rbBench
    expect(p.start.map((c) => c.id)).toEqual(['rbBench'])
    expect(p.slots[0]).toMatchObject({ changed: false, recommended: null })
    expect(p.slots[0].reasons[0]).toMatch(/No eligible, available player for the TE slot/)
  })

  it('excludes bye-week players from recommendations', () => {
    const p = plan(['RB'], ['rb1'], [cand('rb1', 'RB', 5), cand('rbBye', 'RB', 0, { bye: true }), cand('rb3', 'RB', 4)])
    expect(p.slots[0].recommended!.id).toBe('rb1')
  })

  it('fills an empty slot', () => {
    const p = plan(['RB', 'WR'], ['rb1', '0'], [cand('rb1', 'RB', 8), cand('wrBench', 'WR', 6)])
    expect(p.slots[1]).toMatchObject({ changed: true, delta: 6 })
    expect(p.slots[1].reasons[0]).toMatch(/Fill the empty WR slot/)
    expect(p.slots[1].confidence).not.toBeNull()
  })

  it('keeps an optimal lineup unchanged, even when equal players could swap slots', () => {
    const p = plan(['RB', 'RB'], ['x', 'y'], [cand('x', 'RB', 10), cand('y', 'RB', 10)])
    expect(p.slots.every((s) => !s.changed)).toBe(true)
    expect(p.slots.every((s) => s.confidence === null)).toBe(true)
  })

  it('changes the pick with the risk mode: volatile vs steady player', () => {
    const volatile = cand('a', 'RB', 10, { sd: 8, floor: 0, ceiling: 20.25 })
    const steady = cand('b', 'RB', 9, { sd: 1, floor: 7.72, ceiling: 10.28 })
    expect(plan(['RB'], ['a'], [volatile, steady], 'projection').slots[0].changed).toBe(false)
    const safe = plan(['RB'], ['a'], [volatile, steady], 'floor')
    expect(safe.slots[0].recommended!.id).toBe('b')
    expect(safe.slots[0].reasons.join(' ')).toMatch(/Safer: floor 7.7 vs 0.0/)
    expect(plan(['RB'], ['b'], [volatile, steady], 'ceiling').slots[0].recommended!.id).toBe('a')
  })

  it('sums team volatility as the root of summed variances (independence assumption)', () => {
    const p = plan(['RB', 'WR'], ['a', 'b'], [cand('a', 'RB', 10, { sd: 3 }), cand('b', 'WR', 10, { sd: 4 })])
    expect(p.current.sd).toBe(5)
    expect(p.current.floor).toBeCloseTo(20 - Z80 * 5, 10)
    expect(p.current.ceiling).toBeCloseTo(20 + Z80 * 5, 10)
  })

  it('has no team range when any starter volatility is unknown', () => {
    const p = plan(['RB', 'WR'], ['a', 'b'], [cand('a', 'RB', 10, { sd: 3 }), cand('b', 'WR', 10)])
    expect(p.current).toMatchObject({ sd: null, floor: null, ceiling: null })
  })
})

/* ---------------- end to end over the model ---------------- */

describe('analyzeLineup', () => {
  const rows = (id: string, pts: number[], opp = 'CCC') =>
    pts.map((p, i) => ({ week: i + 1, rows: [{ player_id: id, opponent: opp, stats: { pts: p, gp: 1, off_snp: 30, tm_off_snp: 60 } }] }))
  const merge = (...parts: { week: number; rows: { player_id: string; opponent: string; stats: Record<string, number> }[] }[][]) =>
    [1, 2, 3, 4].map((week) => ({ week, rows: parts.flatMap((p) => p.find((w) => w.week === week)!.rows) }))

  const model = buildModel({
    players: {
      rb1: player('rb1', 'RB'),
      rb2: player('rb2', 'RB', { team: 'BBB' }),
      wr1: player('wr1', 'WR'),
    },
    rosters: [roster(1, 'u1', ['rb1', 'rb2', 'wr1']), roster(2, 'u2', [])],
    startSlots: ['RB', 'WR'],
    proj: { rb1: 5, rb2: 12, wr1: 9 },
  })
  const matchups = [{ roster_id: 1, matchup_id: 1, points: 0, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'] }]
  const schedule = [
    { game_id: '1', week: 5, status: 'pre_game', date: '', home: 'AAA', away: 'CCC' },
    { game_id: '2', week: 5, status: 'pre_game', date: '', home: 'BBB', away: 'DDD' },
  ]
  const projectionRows = [{ player_id: 'rb2', stats: { pts: 12 }, opponent: 'DDD', company: 'testco' }]
  const weeks = merge(rows('rb1', [4, 6, 5, 7]), rows('rb2', [10, 14, 12, 12], 'DDD'), rows('wr1', [8, 9, 10, 9]))

  it('recommends the better bench RB, with ranges, evidence and source attribution', () => {
    const a = analyzeLineup({ model, matchups, projectionRows, weeks, schedule, week: 5, mode: 'projection' })!
    const s = a.plan.slots[0]
    expect(s.recommended!.id).toBe('rb2')
    expect(s.delta).toBe(7)
    expect(a.provider).toBe('testco')
    expect(a.historyWeeks).toBe(4)
    expect(s.evidence[0].source).toContain('testco')
    const rb2 = a.candidates.find((c) => c.id === 'rb2')!
    expect(rb2.n).toBe(4)
    expect(rb2.sd).not.toBeNull()
    expect(rb2.floor!).toBeLessThan(rb2.proj)
    expect(rb2.ceiling!).toBeGreaterThan(rb2.proj)
    expect(rb2.opponent).toBe('DDD')
    expect(rb2.usage?.label).toBe('steady')
  })

  it('still works without history or schedule, just without ranges and context', () => {
    const a = analyzeLineup({ model, matchups, projectionRows: [], weeks: [], schedule: null, week: 5, mode: 'projection' })!
    expect(a.plan.slots[0].recommended!.id).toBe('rb2')
    expect(a.plan.recommended.floor).toBeNull()
    expect(a.hasSchedule).toBe(false)
    expect(a.candidates.every((c) => !c.bye && !c.started)).toBe(true)
  })

  it('returns null when the team has no matchup', () => {
    expect(analyzeLineup({ model, matchups: [], projectionRows: [], weeks: [], schedule: null, week: 5, mode: 'projection' })).toBeNull()
  })
})
