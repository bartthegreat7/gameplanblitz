import {
  defaultRules,
  draftRounds,
  evaluateKeepers,
  impliedRound,
  keeperCost,
  keeperEligible,
  yearsKept,
  type KeeperInput,
  type KeeperRules,
} from './keepers'

const RULES: KeeperRules = { maxKeepers: 2, costMode: 'draft-round', roundPenalty: 1, undraftedRound: 14, maxYears: 2 }

describe('keeper rules (regression)', () => {
  it('defaults from league settings', () => {
    expect(defaultRules({ maxKeepers: 3, draftRounds: 16 })).toEqual({ maxKeepers: 3, costMode: 'draft-round', roundPenalty: 1, undraftedRound: 16, maxYears: 0 })
    expect(defaultRules({})).toMatchObject({ maxKeepers: 1, undraftedRound: 15 })
  })

  it('costs the drafted round in the first year, one round earlier per year kept', () => {
    expect(keeperCost(8, 0, RULES)).toEqual({ round: 8, capped: false, basis: 'drafted' })
    expect(keeperCost(8, 1, RULES)).toEqual({ round: 7, capped: false, basis: 'drafted' })
    expect(keeperCost(8, 3, { ...RULES, roundPenalty: 2 })).toEqual({ round: 2, capped: false, basis: 'drafted' })
  })

  it('charges the undrafted round for waiver pickups', () => {
    expect(keeperCost(null, 0, RULES)).toEqual({ round: 14, capped: false, basis: 'undrafted' })
    expect(keeperCost(null, 1, RULES).round).toBe(13)
  })

  it('never costs earlier than round 1, and flags when escalation hits the cap', () => {
    expect(keeperCost(2, 5, RULES)).toEqual({ round: 1, capped: true, basis: 'drafted' })
    expect(keeperCost(1, 0, RULES)).toEqual({ round: 1, capped: false, basis: 'drafted' })
  })

  it('is free when the league has no keeper cost', () => {
    expect(keeperCost(3, 2, { ...RULES, costMode: 'none' })).toEqual({ round: null, capped: false, basis: 'free' })
  })

  it('enforces the maximum years kept (0 = no limit)', () => {
    expect(keeperEligible(1, RULES)).toBe(true)
    expect(keeperEligible(2, RULES)).toBe(false)
    expect(keeperEligible(9, { ...RULES, maxYears: 0 })).toBe(true)
  })

  it('maps a market rank to a draft round for the league size', () => {
    expect(impliedRound(1, 12)).toBe(1)
    expect(impliedRound(12, 12)).toBe(1)
    expect(impliedRound(13, 12)).toBe(2)
    expect(impliedRound(30, 10)).toBe(3)
  })
})

describe('draft history', () => {
  it('reads the round each player was drafted', () => {
    const r = draftRounds([{ round: 1, player_id: 'a', roster_id: 1 }, { round: 3, player_id: 'b', roster_id: 2 }, { round: 9, player_id: 'a', roster_id: 1 }, { round: 4, player_id: null, roster_id: 1 }])
    expect([...r]).toEqual([['a', 1], ['b', 3]])
  })
  it('counts consecutive seasons as a keeper, newest first', () => {
    const k = (id: string, kept: boolean) => ({ round: 5, player_id: id, roster_id: 1, is_keeper: kept })
    const drafts = [[k('a', true), k('b', false)], [k('a', true), k('b', true)], [k('a', false)]]
    expect(yearsKept(drafts, 'a')).toBe(2)
    expect(yearsKept(drafts, 'b')).toBe(0) // the streak must start with the latest draft
    expect(yearsKept([], 'a')).toBe(0)
  })
})

describe('evaluateKeepers', () => {
  const p = (id: string, o: Partial<KeeperInput>): KeeperInput => ({ id, name: id, pos: 'RB', draftedRound: 10, yearsKept: 0, dynastyRank: 50, dynastyValue: 3000, ppg: 12, ...o })
  const players = [
    p('steal', { draftedRound: 10, dynastyRank: 15 }), // market round 2 (12 teams), costs 10 → +8
    p('waiver', { draftedRound: null, dynastyRank: 40 }), // costs 14, market 4 → +10
    p('star', { draftedRound: 1, dynastyRank: 3 }), // costs 1, market 1 → 0
    p('overpay', { draftedRound: 2, dynastyRank: 60 }), // costs 2, market 5 → -3
    p('maxed', { draftedRound: 12, dynastyRank: 10, yearsKept: 2 }), // ineligible
    p('unknown', { draftedRound: 9, dynastyRank: null, dynastyValue: null }),
  ]
  const out = evaluateKeepers(players, RULES, 12)
  const by = (id: string) => out.find((c) => c.id === id)!

  it('computes cost, market round and surplus in rounds', () => {
    expect(by('steal')).toMatchObject({ marketRound: 2, surplus: 8, eligible: true })
    expect(by('waiver')).toMatchObject({ surplus: 10 })
    expect(by('waiver').cost.basis).toBe('undrafted')
    expect(by('star').surplus).toBe(0)
    expect(by('overpay').surplus).toBe(-3)
    expect(by('unknown')).toMatchObject({ marketRound: null, surplus: null })
  })

  it('recommends up to the keeper limit: eligible players with a real saving, best first', () => {
    expect(out.filter((c) => c.recommended).map((c) => c.id)).toEqual(['waiver', 'steal'])
    expect(by('maxed').recommended).toBe(false) // biggest saving, but ineligible
    expect(by('star').recommended).toBe(false) // no saving
    expect(out.slice(0, 2).map((c) => c.id)).toEqual(['waiver', 'steal']) // recommended first
  })

  it('explains each decision with sources', () => {
    expect(by('steal').reasons.join(' ')).toMatch(/Costs a 10th-round pick \(drafted in round 10\).*#15, roughly a 2nd-round pick.*saves about 8 rounds/)
    expect(by('maxed').reasons[0]).toMatch(/Kept 2 years already: your rules allow 2/)
    expect(by('overpay').reasons.join(' ')).toMatch(/costs 3 rounds more than the market/)
    expect(by('unknown').reasons.join(' ')).toMatch(/Not on FantasyCalc's dynasty board/)
    expect(by('steal').evidence.map((e) => e.source)).toEqual(expect.arrayContaining(['FantasyCalc dynasty values']))
  })

  it('with free keepers, recommends the most valuable eligible players', () => {
    const free = evaluateKeepers(players, { ...RULES, costMode: 'none' }, 12)
    expect(free.filter((c) => c.recommended).map((c) => c.id)).toEqual(['star', 'steal'])
  })

  it('respects a keeper limit of one', () => {
    expect(evaluateKeepers(players, { ...RULES, maxKeepers: 1 }, 12).filter((c) => c.recommended).map((c) => c.id)).toEqual(['waiver'])
  })
})
