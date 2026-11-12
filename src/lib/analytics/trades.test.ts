import { parseFcData, pickKey } from '../fantasycalc'
import type { SleeperLeague } from '../sleeper'
import { buildModel, player, roster } from '../../test/fixtures'
import type { HorizonWeek } from './lineupValue'
import { futurePickSeasons, ownedPicks, type PickAsset } from './picks'
import {
  evaluateTrade,
  FLAT_PER_WEEK,
  findTrades,
  MIN_FAIRNESS,
  MIN_YOU_PER_WEEK,
  ONE_SIDED_FLOOR_PER_WEEK,
  rateTradeConfidence,
  type TradeInput,
} from './trades'

/* ---------------- helpers ---------------- */

const hz = (week: number, entries: Record<string, number>): HorizonWeek => ({
  week,
  proj: new Map(Object.entries(entries).map(([id, pts]) => [id, { pts }])),
})
const same = (e: Record<string, number>) => [hz(5, e), hz(6, e), hz(7, e)]
const pl = (id: string, pos: string, extra = {}) => player(id, pos, { last_name: id, ...extra })

interface Setup {
  rosters: { id: number; players: string[]; extra?: Record<string, unknown> }[]
  players: Record<string, ReturnType<typeof player>>
  proj: Record<string, number>
  values: Record<string, number>
  slots?: string[]
  positions?: string[]
  horizon?: HorizonWeek[]
  picks?: Map<number, PickAsset[]>
}
function input(s: Setup): TradeInput {
  const model = buildModel({
    players: s.players,
    rosters: s.rosters.map((r) => ({ ...roster(r.id, r.id === 1 ? 'u1' : 'u2', r.players), ...r.extra })),
    startSlots: s.slots ?? ['RB', 'WR'],
    proj: {},
  })
  return {
    model,
    league: { roster_positions: s.positions ?? ['RB', 'WR', 'BN', 'BN', 'BN'], settings: {} } as unknown as SleeperLeague,
    horizon: s.horizon ?? same(s.proj),
    schedule: null,
    values: new Map(Object.entries(s.values)),
    picks: s.picks ?? new Map(),
    scale: 'redraft',
  }
}
const side = (...players: string[]) => ({ players, picks: [] as PickAsset[] })

/** Me (1): RB 8, WR 20, bench WR 12. Them (2): RB 15, bench RB 14, WR 6. Slots RB + WR. */
const BASE: Setup = {
  rosters: [
    { id: 1, players: ['rbA', 'wrA', 'wrB'] },
    { id: 2, players: ['rbB', 'rbC', 'wrC'] },
  ],
  players: { rbA: pl('rbA', 'RB'), wrA: pl('wrA', 'WR'), wrB: pl('wrB', 'WR'), rbB: pl('rbB', 'RB'), rbC: pl('rbC', 'RB'), wrC: pl('wrC', 'WR') },
  proj: { rbA: 8, wrA: 20, wrB: 12, rbB: 15, rbC: 14, wrC: 6 },
  values: { rbA: 3000, wrA: 6000, wrB: 2000, rbB: 5000, rbC: 2100, wrC: 1000 },
}

/* ---------------- evaluation ---------------- */

describe('evaluateTrade', () => {
  const e = evaluateTrade(input(BASE), 2, side('wrB'), side('rbC'))

  it('prices both sides and reports fairness on one scale', () => {
    expect(e).toMatchObject({ giveValue: 2000, getValue: 2100, theirName: 'Rival' })
    expect(e.fairness).toBeCloseTo(1 - 100 / 2100, 10)
  })

  it('measures each lineup before vs after over the horizon', () => {
    // me: RB slot 8 -> 14 (+6/wk). them: WR slot 6 -> 12 (+6/wk). 3 weeks each.
    expect(e.you.perWeek).toEqual([6, 6, 6])
    expect(e.you.total).toBe(18)
    expect(e.them.total).toBe(18)
    expect(e.you.starts).toEqual([{ id: 'rbC', name: 'r. rbC', slot: 'RB' }])
    expect(e.you.benches.map((b) => b.id)).toEqual(['rbA'])
    expect(e.them.starts.map((s) => [s.id, s.slot])).toEqual([['wrB', 'WR']])
    expect(e.activeWeeks).toBe(3)
  })

  it('calls a deal that improves both lineups win-win and estimates acceptance as an estimate', () => {
    expect(e.verdict.label).toBe('Win-win')
    expect(e.verdict.acceptable).toBe('likely')
    expect(e.verdict.text).toMatch(/estimate, not a prediction/)
    expect(e.confidence).toMatchObject({ level: 'high', points: 4 })
    expect(e.flags).toEqual([])
  })

  it('reports lineup fit and market value separately', () => {
    expect(e.reasons[0]).toMatch(/You give w\. wrB \(2,000\) and get r\. rbC \(2,100\): 95% fair on FantasyCalc redraft values/)
    expect(e.reasons[1]).toMatch(/Your lineup: \+18\.0 over 3 weeks; r\. rbC starts at RB; r\. rbA loses his starting spot/)
    expect(e.evidence.map((x) => x.label)).toEqual(['Market value', 'Your lineup', "Rival's lineup"])
  })

  it('is lopsided when values differ, even if the lineups both gain', () => {
    const lop = evaluateTrade(input(BASE), 2, side('wrB'), side('rbB')) // 2000 for 5000
    expect(lop.fairness).toBeCloseTo(0.4, 10)
    expect(lop.verdict.acceptable).toBe('unlikely')
    expect(lop.verdict.text).toMatch(/Lopsided on value \(40% fair\)/)
  })

  // two extra bench players, one each, who start for nobody
  const WITH_BENCH: Setup = {
    ...BASE,
    rosters: [{ id: 1, players: [...BASE.rosters[0].players, 'benchM'] }, { id: 2, players: [...BASE.rosters[1].players, 'benchT'] }],
    players: { ...BASE.players, benchM: pl('benchM', 'WR'), benchT: pl('benchT', 'WR') },
    proj: { ...BASE.proj, benchM: 1, benchT: 1 },
    values: { ...BASE.values, benchM: 1000, benchT: 1000 },
  }

  it('says "helps you" when only your lineup gains', () => {
    // I send a useless bench WR for their bench RB, who would start for me; their lineup is unchanged
    const e = evaluateTrade(input(WITH_BENCH), 2, side('benchM'), side('rbC'))
    expect(e.you.total).toBe(18) // RB 8 -> 14 for 3 weeks
    expect(e.them.total).toBe(0)
    expect(e.verdict.label).toBe('Helps you')
    expect(e.verdict.text).toMatch(/theirs stays about the same/)
  })

  it('marks a fair deal that costs their lineup as needing a sweetener, not as acceptable', () => {
    // equal value, but they lose their starting RB (15 -> 14) and my bench WR (1) never starts for them
    const s = { ...WITH_BENCH, values: { ...WITH_BENCH.values, benchM: 5000, rbB: 5000 } }
    const e = evaluateTrade(input(s), 2, side('benchM'), side('rbB'))
    expect(e.fairness).toBe(1)
    expect(e.them.total).toBe(-3)
    expect(e.verdict.acceptable).toBe('unlikely')
    expect(e.verdict.text).toMatch(/Fair on value but it hurts their lineup: they may want a sweetener/)
  })

  it('says "helps them" when it costs your lineup and improves theirs', () => {
    // I send my starting WR (20) for their bench RB (14): WR slot falls to 12 (-8), RB rises 8 -> 14 (+6)
    const e = evaluateTrade(input(WITH_BENCH), 2, side('wrA'), side('rbC'))
    expect(e.you.total).toBe(-6)
    expect(e.them.total).toBe(42) // their WR 6 -> 20 for 3 weeks
    expect(e.verdict.label).toBe('Helps them')
  })

  it('names a deal that changes neither lineup as roughly neutral', () => {
    // two bench players who start for no one swap sides
    const e = evaluateTrade(input(WITH_BENCH), 2, side('benchM'), side('benchT'))
    expect(e.you.total).toBe(0)
    expect(e.them.total).toBe(0)
    expect(e.verdict.label).toBe('Roughly neutral')
  })

  it('rejects deals that include assets the teams do not own', () => {
    const i = input(BASE)
    expect(() => evaluateTrade(i, 2, side('rbB'), side('rbC'))).toThrow(/only give players on your roster/) // rbB is theirs
    expect(() => evaluateTrade(i, 2, side('wrB'), side('rbA'))).toThrow(/only get players on the other team/) // rbA is mine
    expect(() => evaluateTrade(i, 1, side('wrB'), side('rbA'))).toThrow(/another team/) // trading with yourself
    expect(() => evaluateTrade(i, 9, side('wrB'), side('rbC'))).toThrow(/another team/) // no such team
    const theirPick: PickAsset = { key: 'k', season: '2027', round: 1, originalRosterId: 2, ownerRosterId: 2, value: 1, label: 'p' }
    expect(() => evaluateTrade(i, 2, { players: [], picks: [theirPick] }, side('rbC'))).toThrow(/only give picks you own/)
  })
})

describe('evaluateTrade: cautions', () => {
  it('flags designated keepers on either side', () => {
    const s = { ...BASE, rosters: [{ id: 1, players: ['rbA', 'wrA', 'wrB'], extra: { keepers: ['wrB'] } }, { id: 2, players: ['rbB', 'rbC', 'wrC'], extra: { keepers: ['rbC'] } }] }
    const e = evaluateTrade(input(s), 2, side('wrB'), side('rbC'))
    expect(e.flags.join(' ')).toMatch(/w\. wrB is one of your designated keepers/)
    expect(e.flags.join(' ')).toMatch(/r\. rbC is one of Rival's designated keepers, so they may be unwilling/)
    expect(e.confidence.level).toBe('medium') // cautions cost the last rubric point... and 2 cautions are noted
  })

  it('flags injured assets', () => {
    const s = { ...BASE, players: { ...BASE.players, rbC: pl('rbC', 'RB', { injury_status: 'IR' }), wrB: pl('wrB', 'WR', { injury_status: 'Out' }) } }
    const e = evaluateTrade(input(s), 2, side('wrB'), side('rbC'))
    expect(e.flags).toEqual(expect.arrayContaining(['r. rbC is listed IR.', 'w. wrB is listed Out this week.']))
  })

  it('warns when a side ends up over the roster limit', () => {
    // limit 3; I have 3 players and take two for one
    const s = { ...BASE, positions: ['RB', 'WR', 'BN'] }
    const e = evaluateTrade(input(s), 2, side('wrB'), side('rbC', 'rbB'))
    expect(e.you.overBy).toBe(1)
    expect(e.flags.join(' ')).toMatch(/You would be 1 player over the roster limit and must drop one/)
  })

  it('notes that summed values ignore the consolidation premium on uneven-count deals', () => {
    const e = evaluateTrade(input(BASE), 2, side('wrB'), side('rbC', 'wrC'))
    expect(e.flags.join(' ')).toMatch(/premium to consolidate/)
  })

  it('cannot judge fairness when an asset has no market value', () => {
    const s = { ...BASE, values: { ...BASE.values, rbC: undefined as unknown as number } }
    delete (s.values as Record<string, unknown>).rbC
    const e = evaluateTrade(input(s), 2, side('wrB'), side('rbC'))
    expect(e.fairness).toBeNull()
    expect(e.verdict.acceptable).toBe('unknown')
    expect(e.flags.join(' ')).toMatch(/no FantasyCalc value/)
  })
})

describe('trade confidence rubric', () => {
  it.each([
    [{ activeWeeks: 3, valuesKnown: true, cautions: 0 }, 4, 'high'],
    [{ activeWeeks: 3, valuesKnown: true, cautions: 2 }, 3, 'medium'],
    [{ activeWeeks: 2, valuesKnown: true, cautions: 0 }, 3, 'medium'],
    [{ activeWeeks: 1, valuesKnown: true, cautions: 0 }, 2, 'medium'],
    [{ activeWeeks: 1, valuesKnown: false, cautions: 1 }, 0, 'low'],
  ])('%j → %i points, %s', (f, points, level) => {
    expect(rateTradeConfidence(f)).toMatchObject({ points, level })
  })
})

/* ---------------- picks ---------------- */

describe('picks', () => {
  it('parses generic pick rows (rounds, seasons) and ignores Early/Mid/Late variants and players', () => {
    const d = parseFcData([
      { player: { name: '2027 1st', position: 'PICK', sleeperId: 'FP_2027_1' }, value: 2700, overallRank: 1 },
      { player: { name: '2027 1st (Early)', position: 'PICK' }, value: 4625, overallRank: 1 },
      { player: { name: '2028 2nd', position: 'PICK' }, value: 1284, overallRank: 1 },
      { player: { name: 'Star Back', position: 'RB', sleeperId: '123' }, value: 9000, overallRank: 2 },
    ])
    expect([...d.picks]).toEqual([['2027-1', 2700], ['2028-2', 1284]])
    expect(d.players.get('123')).toEqual({ value: 9000, rank: 2 })
    expect(d.players.has('FP_2027_1')).toBe(false) // picks are never treated as players
  })

  const values = new Map([[pickKey(2027, 1), 2700], [pickKey(2027, 2), 1500], [pickKey(2028, 1), 2000]])
  it('lists the seasons that are priced and still in the future', () => {
    expect(futurePickSeasons(values, '2026')).toEqual(['2027', '2028'])
    expect(futurePickSeasons(values, '2027')).toEqual(['2028']) // 2027 draft already happened
  })
  it('gives everyone their own picks, then applies traded picks', () => {
    const owned = ownedPicks({
      rosterIds: [1, 2],
      seasons: ['2027'],
      rounds: 2,
      traded: [{ season: '2027', round: 1, roster_id: 2, owner_id: 1 }],
      values,
      teamName: (id) => `Team ${id}`,
    })
    expect(owned.get(1)!.map((p) => p.key).sort()).toEqual(['2027-1-1', '2027-1-2', '2027-2-1'])
    expect(owned.get(2)!.map((p) => p.key)).toEqual(['2027-2-2'])
    const acquired = owned.get(1)!.find((p) => p.key === '2027-1-2')!
    expect(acquired).toMatchObject({ ownerRosterId: 1, originalRosterId: 2, value: 2700 })
    expect(acquired.label).toBe('2027 1st-round pick (from Team 2)')
  })
  it('prices only rounds 1-4 and leaves other rounds unpriced', () => {
    const owned = ownedPicks({ rosterIds: [1], seasons: ['2027'], rounds: 9, traded: [], values, teamName: String })
    expect(owned.get(1)).toHaveLength(4) // capped at the 4 rounds FantasyCalc prices
    expect(owned.get(1)!.filter((p) => p.value === null)).toHaveLength(2) // rounds 3-4 have no value in this fixture
  })
  it('ignores a traded pick that points at an unknown roster', () => {
    const owned = ownedPicks({ rosterIds: [1, 2], seasons: ['2027'], rounds: 1, traded: [{ season: '2027', round: 1, roster_id: 1, owner_id: 99 }], values, teamName: String })
    expect(owned.get(1)).toEqual([])
    expect(owned.get(2)!.map((p) => p.key)).toEqual(['2027-1-2'])
  })
})

describe('evaluateTrade with picks', () => {
  const pick = (value: number | null): PickAsset => ({ key: '2027-1-1', season: '2027', round: 1, originalRosterId: 1, ownerRosterId: 1, value, label: '2027 1st-round pick' })

  it('adds pick value to its side and gives picks no lineup effect', () => {
    const e = evaluateTrade(input(BASE), 2, { players: [], picks: [pick(2000)] }, side('rbC'))
    expect(e.giveValue).toBe(2000)
    expect(e.getValue).toBe(2100)
    expect(e.fairness).toBeCloseTo(1 - 100 / 2100, 10)
    expect(e.you.total).toBe(18) // only the incoming RB matters: 8 -> 14 over 3 weeks
    expect(e.them.total).toBe(0) // they lose a bench RB, gain a pick
    expect(e.flags.join(' ')).toMatch(/Picks have no lineup effect now/)
  })
  it('cannot judge a deal with an unpriced pick', () => {
    const e = evaluateTrade(input(BASE), 2, { players: [], picks: [pick(null)] }, side('rbC'))
    expect(e.fairness).toBeNull()
    expect(e.verdict.acceptable).toBe('unknown')
  })
})

/* ---------------- finder ---------------- */

describe('findTrades', () => {
  it('finds the fair swap that improves both lineups', () => {
    const r = findTrades(input(BASE))
    expect(r.mutual).toHaveLength(1)
    expect(r.oneSided).toEqual([])
    const d = r.mutual[0]
    expect(d.give.players).toEqual(['wrB'])
    expect(d.get.players).toEqual(['rbC'])
    expect(d.you.total).toBe(18)
    expect(d.them.total).toBe(18)
    expect(r.evaluated).toBeGreaterThanOrEqual(1)
  })

  it('shows a fair deal that costs the other lineup nothing as "may need a sweetener", not as win-win', () => {
    const s: Setup = {
      rosters: [{ id: 1, players: ['rbA', 'wrA', 'wrB'] }, { id: 2, players: ['rbB', 'rbC', 'wrC'] }],
      players: BASE.players,
      // they give their starting RB (15) for my bench WR (12): RB 15->14.5 (-0.5), WR 11.5->12 (+0.5) = flat
      proj: { rbA: 8, wrA: 20, wrB: 12, rbB: 15, rbC: 14.5, wrC: 11.5 },
      values: { rbA: 3000, wrA: 6000, wrB: 2000, rbB: 2100, rbC: 900, wrC: 1500 },
    }
    const r = findTrades(input(s))
    expect(r.mutual).toEqual([])
    expect(r.oneSided).toHaveLength(1)
    expect(r.oneSided[0].get.players).toEqual(['rbB'])
    expect(r.oneSided[0].you.total).toBeCloseTo(21) // RB 8 -> 15 for 3 weeks
    expect(r.oneSided[0].verdict.label).toBe('Helps you')
  })

  it('keeps the best of several offers for the same player (your gain, then their gain)', () => {
    // two of my bench WRs (12 and 11) could each buy their bench RB: same gain for me, wrB helps them more
    const s: Setup = {
      ...BASE,
      rosters: [{ id: 1, players: ['rbA', 'wrA', 'wrB', 'wrD'] }, BASE.rosters[1]],
      players: { ...BASE.players, wrD: pl('wrD', 'WR') },
      proj: { ...BASE.proj, wrD: 11 },
      values: { ...BASE.values, wrD: 2050 },
    }
    const r = findTrades(input(s))
    const forRbC = [...r.mutual, ...r.oneSided].filter((d) => d.get.players[0] === 'rbC')
    expect(forRbC).toHaveLength(1)
    expect(forRbC[0].give.players).toEqual(['wrB']) // +6/wk for them, vs +5/wk with wrD
    expect(forRbC[0].them.total).toBe(18)
  })

  it('does not offer deals that are unfair on value', () => {
    const s = { ...BASE, values: { ...BASE.values, rbC: 9000 } } // rbC now far costlier than anything I'd give
    expect(findTrades(input(s)).mutual).toEqual([])
  })

  it('never offers designated keepers on either side', () => {
    const theirs = { ...BASE, rosters: [{ id: 1, players: ['rbA', 'wrA', 'wrB'] }, { id: 2, players: ['rbB', 'rbC', 'wrC'], extra: { keepers: ['rbC'] } }] }
    expect(findTrades(input(theirs)).mutual).toEqual([])
    const mine = { ...BASE, rosters: [{ id: 1, players: ['rbA', 'wrA', 'wrB'], extra: { keepers: ['wrB'] } }, { id: 2, players: ['rbB', 'rbC', 'wrC'] }] }
    expect(findTrades(input(mine)).mutual).toEqual([])
  })

  it('skips players with no market value', () => {
    const s = { ...BASE, values: { rbA: 3000, wrA: 6000, wrB: 2000, rbB: 5000, wrC: 1000 } } // rbC unpriced
    expect(findTrades(input(s)).mutual).toEqual([])
  })

  it('scales its thresholds to the weeks that have projections', () => {
    const s = { ...BASE, horizon: [hz(5, BASE.proj), hz(6, {}), hz(7, {})] }
    const d = findTrades(input(s)).mutual[0]
    expect(d.activeWeeks).toBe(1)
    expect(d.you.total).toBe(6) // one week at +6, not three
  })

  it('keeps its promises on random leagues (seeded property test)', () => {
    let seed = 777
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const poss = ['QB', 'RB', 'WR', 'TE']
    for (let trial = 0; trial < 25; trial++) {
      const ids = Array.from({ length: 18 }, (_, i) => `p${i}`)
      const players = Object.fromEntries(ids.map((id, i) => [id, pl(id, poss[i % 4])]))
      const proj = Object.fromEntries(ids.map((id) => [id, Math.round(rnd() * 200) / 10]))
      const values = Object.fromEntries(ids.map((id) => [id, 500 + Math.round(rnd() * 4000)]))
      const keepers = ids.filter(() => rnd() < 0.15)
      const s: Setup = {
        rosters: [
          { id: 1, players: ids.slice(0, 6), extra: { keepers: keepers.filter((k) => ids.slice(0, 6).includes(k)) } },
          { id: 2, players: ids.slice(6, 12), extra: { keepers: keepers.filter((k) => ids.slice(6, 12).includes(k)) } },
          { id: 3, players: ids.slice(12), extra: { keepers: keepers.filter((k) => ids.slice(12).includes(k)) } },
        ],
        players, proj, values,
        slots: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
        positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'],
      }
      const r = findTrades(input(s))
      const targets = new Set<string>()
      for (const [list, mutual] of [[r.mutual, true], [r.oneSided, false]] as const) {
        for (const d of list) {
          expect(d.fairness!).toBeGreaterThanOrEqual(MIN_FAIRNESS - 1e-9)
          expect(d.you.total).toBeGreaterThanOrEqual(MIN_YOU_PER_WEEK * d.activeWeeks - 1e-9)
          const flat = FLAT_PER_WEEK * d.activeWeeks
          if (mutual) expect(d.them.total).toBeGreaterThanOrEqual(flat - 1e-9)
          else {
            expect(d.them.total).toBeLessThan(flat)
            expect(d.them.total).toBeGreaterThanOrEqual(ONE_SIDED_FLOOR_PER_WEEK * d.activeWeeks - 1e-9)
          }
          expect(keepers).not.toContain(d.give.players[0])
          expect(keepers).not.toContain(d.get.players[0])
          expect(targets.has(d.get.players[0])).toBe(false) // one deal per player received
          targets.add(d.get.players[0])
        }
      }
    }
  })
})
