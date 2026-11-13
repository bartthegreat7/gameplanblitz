import type { SleeperMatchup, SleeperTransaction } from '../sleeper'
import { managerProfiles, partnerIdeas, tendencies } from './behavior'
import { pairGames } from './league'

const POS: Record<string, string> = { r1: 'RB', r2: 'RB', r3: 'RB', w1: 'WR', w2: 'WR', q1: 'QB' }
const pos = (id: string) => POS[id] ?? ''
const TX: SleeperTransaction[] = [
  { type: 'trade', status: 'complete', created: 300, roster_ids: [1, 2], adds: { r1: 1, w1: 2 }, drops: { r1: 2, w1: 1 } },
  { type: 'trade', status: 'complete', created: 300, roster_ids: [1, 2], adds: { r1: 1, w1: 2 }, drops: { r1: 2, w1: 1 } }, // listed twice
  { type: 'waiver', status: 'complete', created: 100, adds: { r2: 1 }, settings: { waiver_bid: 20 } },
  { type: 'waiver', status: 'complete', created: 150, adds: { r3: 1 }, settings: { waiver_bid: 12 } },
  { type: 'waiver', status: 'failed', created: 150, adds: { r3: 3 }, settings: { waiver_bid: 5 } },
  { type: 'waiver', status: 'complete', created: 160, adds: { w2: 3 }, settings: { waiver_bid: 2 } },
  { type: 'waiver', status: 'complete', created: 170, adds: { q1: 3 }, settings: { waiver_bid: 4 } },
  { type: 'free_agent', status: 'complete', created: 200, adds: { q1: 2 } },
]
const row = (roster_id: number, matchup_id: number, starters: string[], pp: Record<string, number>): SleeperMatchup => ({
  roster_id,
  matchup_id,
  points: 10,
  starters,
  players: starters,
  players_points: pp,
})
const WEEKS = [{ week: 1, games: pairGames([row(1, 1, ['r1', 'w1'], { r1: 5, w1: 5 }), row(2, 1, ['q1'], { q1: 0 }), row(3, 2, ['w2', 'q1'], { w2: 1, q1: 2 })]) }]

describe('league behavior', () => {
  const profiles = managerProfiles({
    rosterIds: [1, 2, 3],
    transactions: TX,
    weeks: WEEKS,
    slots: 2,
    pos,
    drafts: [{ season: '2024', picks: [{ round: 3, player_id: 'r1', roster_id: 7, is_keeper: true }], rosterFor: (r) => (r === 7 ? 2 : null) }],
  })

  it('counts completed trades once, claims, FAAB, failed claims, lineups and keepers per manager', () => {
    const a = profiles.get(1)!
    expect(a).toMatchObject({ trades: 1, waiverClaims: 2, faabSpent: 32, bids: [20, 12], failedClaims: 0, lastMove: 300 })
    expect(a.partners.get(2)).toBe(1)
    expect(a.addsByPos).toEqual({ RB: 3 })
    expect(a.tradeIn).toEqual({ RB: 1 })
    expect(a.tradeOut).toEqual({ WR: 1 })
    const b = profiles.get(2)!
    expect(b).toMatchObject({ trades: 1, freeAgentAdds: 1, emptySlots: 1, zeroStarters: 1, weeks: 1 })
    expect(b.keepers).toEqual([{ season: '2024', playerId: 'r1', round: 3 }])
    expect(profiles.get(3)).toMatchObject({ failedClaims: 1, waiverClaims: 2, trades: 0 })
  })

  it('describes tendencies with the counts behind them, never motives', () => {
    const all = [...profiles.values()]
    const t1 = tendencies(profiles.get(1)!, all)
    // one trade each for 1 and 2: a tie is not "most frequent"
    expect(t1.map((t) => t.text)).toEqual(['Adds RBs more than the league', 'Bids aggressively on waivers'])
    expect(t1[1].evidence).toBe('median winning bid $16 vs $8 league-wide')
    expect(t1[0].evidence).toBe('100% of their adds vs 43% league-wide (3 of 3)')
    const t3 = tendencies(profiles.get(3)!, all)
    expect(t3.map((t) => t.text)).toContain('Has not traded this season')
    const t2 = tendencies(profiles.get(2)!, all)
    expect(t2.find((t) => t.text === 'Has left starting spots unproductive')?.evidence).toBe('1 empty slot and 1 scoreless starter over 1 weeks')
    expect(t2.find((t) => t.text === 'Uses keepers')).toBeTruthy()
  })

  it('ranks trade partners by complementary needs plus observed trading', () => {
    const ideas = partnerIdeas(
      1,
      [
        { rosterId: 3, theyNeed: ['RB'], youNeed: ['WR'] },
        { rosterId: 2, theyNeed: ['RB'], youNeed: ['WR'] },
      ],
      profiles,
    )
    expect(ideas.map((x) => x.rosterId)).toEqual([2, 3])
    expect(ideas[0].reasons).toContain('Has traded with you 1 time')
  })
})
