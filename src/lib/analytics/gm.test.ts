import { rateConfidence } from '../evidence'
import type { Article } from '../news'
import { buildBrief, MAX_ACTIONS, type GmInput } from './gm'
import type { LineupAnalysis } from './lineupAnalysis'
import type { Candidate, SlotPlan } from './lineupPlan'

const conf = rateConfidence({ marginZ: 1, sampleOk: true, injuryFlag: false })
const cand = (id: string, o: Partial<Candidate> = {}): Candidate => ({
  id, name: id, pos: 'RB', team: 'T', opponent: null, proj: 10, sd: null, floor: null, ceiling: null, n: 0, injury: '', out: false, bye: false, started: false, usage: null, matchup: null, ...o,
})
const slot = (o: Partial<SlotPlan>): SlotPlan => ({
  slot: 'RB', label: 'RB', current: null, recommended: null, locked: false, changed: false, move: false, partner: null, delta: 0, reasons: [], evidence: [], confidence: null, ...o,
})
const lineup = (slots: SlotPlan[]): LineupAnalysis => ({
  plan: { mode: 'projection', slots, start: [], sit: [], current: { proj: 0, sd: null, floor: null, ceiling: null }, recommended: { proj: 0, sd: null, floor: null, ceiling: null } },
  candidates: [], provider: 'testco', historyWeeks: 0, hasSchedule: true,
})
const base: GmInput = { week: 5, opponent: 'Rival', lineup: null, waivers: null, trades: null, h2h: null, playoff: null, myNews: [], keepers: null, keeperLeague: false }

describe('buildBrief', () => {
  it('puts lineup facts (Out starter) first as "do now", then projected upgrades', () => {
    const b = buildBrief({
      ...base,
      lineup: lineup([
        slot({ changed: true, current: cand('hurt', { out: true, injury: 'Out' }), recommended: cand('sub'), partner: cand('hurt', { out: true, injury: 'Out' }), delta: 9, reasons: ['Start sub over hurt'], confidence: conf }),
        slot({ slot: 'WR', label: 'WR', changed: true, current: cand('meh'), recommended: cand('better'), partner: cand('meh'), delta: 2.5, reasons: ['Start better over meh'] }),
        slot({ slot: 'FLEX', label: 'FLEX', changed: true, move: true, current: cand('x'), recommended: cand('y') }), // a move, not an action
      ]),
    })
    expect(b.actions.map((a) => [a.priority, a.title])).toEqual([
      [1, 'Replace hurt (Out) with sub'],
      [2, 'Start better over meh'],
    ])
    expect(b.actions[0]).toMatchObject({ impact: '+9.0 projected pts', to: '/lineup', confidence: conf })
    expect(b.actions[0].sources).toEqual(['Sleeper projections (testco)', 'Lineup Optimizer'])
  })

  it('lists projected upgrades largest first and drops ones under the noise floor', () => {
    const b = buildBrief({
      ...base,
      lineup: lineup([
        slot({ changed: true, current: cand('a'), recommended: cand('b'), delta: 2, reasons: ['small'] }),
        slot({ changed: true, current: cand('c'), recommended: cand('d'), delta: 0.4, reasons: ['noise'] }),
        slot({ changed: true, current: cand('e'), recommended: cand('f'), delta: 7, reasons: ['big'] }),
      ]),
    })
    expect(b.actions.map((a) => a.detail)).toEqual(['big', 'small'])
  })

  it('treats an empty slot as a fact to fix now', () => {
    const b = buildBrief({ ...base, lineup: lineup([slot({ changed: true, current: null, recommended: cand('fill'), delta: 6 })]) })
    expect(b.actions[0]).toMatchObject({ priority: 1, title: 'Fill your empty RB slot with fill' })
  })

  it('adds the best waiver upgrade, roster news, a win-win trade, and orders by priority', () => {
    const news: Article[] = [
      { id: 'n1', title: 'Star limited in practice', url: 'https://x', publisher: 'RotoWire', players: [{ id: 's', name: 'Star' }] },
      { id: 'n2', title: 'Second', url: 'https://x', publisher: 'FantasyPros' },
      { id: 'n3', title: 'Third (not shown)', url: 'https://x' },
    ]
    const b = buildBrief({
      ...base,
      myNews: news,
      waivers: { candidates: [{ kind: 'speculative' }, { kind: 'upgrade', id: 'fa', name: 'Free Agent', drop: { id: 'd', name: 'Dud', pos: 'RB', team: 'T' }, tier: 'must', gainPerWeek: 4.2, reasons: ['Adds +12.6'], confidence: conf }] } as unknown as GmInput['waivers'],
      trades: { mutual: [{ theirName: 'Rival', get: { players: ['a'], picks: [] }, give: { players: ['b'], picks: [] }, you: { total: 6 }, them: { total: 3 }, activeWeeks: 3, reasons: ['r1', 'r2', 'r3'], confidence: conf }], oneSided: [], evaluated: 1 } as unknown as GmInput['trades'],
    })
    expect(b.actions.map((a) => a.area)).toEqual(['news', 'news', 'waivers', 'trades'])
    expect(b.actions.find((a) => a.area === 'waivers')).toMatchObject({ title: 'Add Free Agent, drop Dud', priority: 2, impact: '+4.2 pts/wk' })
    expect(b.actions.find((a) => a.area === 'trades')).toMatchObject({ title: 'Explore a trade with Rival: get 1 for 1', impact: '+6.0 pts over 3 wk, they gain +3.0', detail: 'r1 r2' })
    expect(b.actions[0]).toMatchObject({ title: 'Read: Star limited in practice', sources: ['RotoWire'], impact: 'Star', confidence: null })
  })

  it('mentions the playoff race only while it is open, and keepers only in keeper leagues', () => {
    const odds = (p: number) => ({ rosterId: 1, playoffPct: p, byePct: 0, firstSeedPct: 0, championPct: 10, avgWins: 7, avgSeed: 3, seedPct: [] })
    expect(buildBrief({ ...base, playoff: odds(50) }).actions.map((a) => a.area)).toEqual(['playoffs'])
    expect(buildBrief({ ...base, playoff: odds(99) }).actions).toEqual([])
    const keepers = [{ id: 'k', name: 'Keeper', recommended: true, surplus: 4, reasons: ['a', 'b'] }] as unknown as GmInput['keepers']
    expect(buildBrief({ ...base, keepers, keeperLeague: false }).actions).toEqual([])
    expect(buildBrief({ ...base, keepers, keeperLeague: true }).actions[0]).toMatchObject({ title: 'Keeper outlook: Keeper', impact: 'saves 4 rounds' })
  })

  it('summarizes the week and caps the list', () => {
    const many = lineup(Array.from({ length: 12 }, (_, k) => slot({ changed: true, current: cand(`c${k}`), recommended: cand(`r${k}`), delta: 1 })))
    const b = buildBrief({ ...base, lineup: many, h2h: { groups: [], myProj: 110, theirProj: 100, winPct: 59 } })
    expect(b.actions).toHaveLength(MAX_ACTIONS)
    expect(b.summary).toMatchObject({ week: 5, opponent: 'Rival', myProj: 110, oppProj: 100, winPct: 59, playoffPct: null })
  })

  it('has nothing to say when every tool is quiet', () => {
    expect(buildBrief(base).actions).toEqual([])
  })
})
