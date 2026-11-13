import type { SleeperMatchup, SleeperRoster } from '../sleeper'
import {
  championRoster,
  leagueRecords,
  managerStats,
  regularWeeks,
  rivalries,
  seasonStandings,
  tallyAwards,
  type SeasonData,
} from './leagueHistory'

const row = (roster_id: number, matchup_id: number, points: number): SleeperMatchup => ({ roster_id, matchup_id, points, starters: [], players: [] })
const roster = (roster_id: number, owner_id: string) => ({ roster_id, owner_id, players: [], starters: [] }) as unknown as SleeperRoster

/* 2024: roster 1 = ann, 2 = bob. 2025: roster ids swapped (ann is 2). Playoffs start week 3. */
const s2024: SeasonData = {
  season: '2024',
  leagueId: 'A',
  name: 'L',
  rosters: [roster(1, 'ann'), roster(2, 'bob')],
  users: [],
  weeks: regularWeeks(
    [
      { week: 1, matchups: [row(1, 1, 120), row(2, 1, 90)] },
      { week: 2, matchups: [row(1, 1, 80), row(2, 1, 80.5)] },
      { week: 3, matchups: [row(1, 1, 200), row(2, 1, 10)] }, // playoffs: excluded
    ],
    3,
  ),
  bracket: [{ r: 1, m: 1, t1: 1, t2: 2, w: 2, l: 1, p: 1 }],
}
const s2025: SeasonData = {
  season: '2025',
  leagueId: 'B',
  name: 'L',
  rosters: [roster(1, 'bob'), roster(2, 'ann')],
  users: [],
  weeks: regularWeeks(
    [
      { week: 1, matchups: [row(1, 1, 100), row(2, 1, 130)] },
      { week: 2, matchups: [row(1, 1, 0), row(2, 1, 0)] }, // not played yet: excluded
    ],
    15,
  ),
  bracket: null,
}

describe('league history', () => {
  it('keeps regular-season weeks with scores and finds the champion from the bracket', () => {
    expect(s2024.weeks.map((w) => w.week)).toEqual([1, 2])
    expect(s2025.weeks.map((w) => w.week)).toEqual([1])
    expect(championRoster(s2024.bracket)).toBe(2)
    expect(championRoster([{ r: 1, m: 1, t1: 1, t2: 2, w: 1, l: 2 }, { r: 2, m: 2, t1: 1, t2: 3, w: 3, l: 1 }])).toBe(3) // single last-round game
    expect(championRoster(null)).toBeNull()
  })

  it('rebuilds each season’s standings and follows managers across changed roster ids', () => {
    expect(seasonStandings(s2024).map((r) => [r.userId, r.w, r.l, r.champion])).toEqual([
      ['ann', 1, 1, false],
      ['bob', 1, 1, true],
    ])
    const stats = managerStats([s2024, s2025])
    expect(stats[0]).toMatchObject({ userId: 'bob', titles: 1, seasons: 2, w: 1, l: 2 })
    expect(stats.find((x) => x.userId === 'ann')).toMatchObject({ w: 2, l: 1, pf: 330, bestFinish: 1 })
  })

  it('finds all-time records and rivalries from real results only', () => {
    const r = Object.fromEntries(leagueRecords([s2024, s2025]).map((x) => [x.title, x]))
    expect(r['Highest weekly score']).toMatchObject({ userId: 'ann', season: '2025', week: 1, value: 130 })
    expect(r['Lowest weekly score']).toMatchObject({ value: 80 })
    expect(r['Biggest blowout']).toMatchObject({ userId: 'ann', otherId: 'bob', value: 30 })
    expect(r['Closest finish']).toMatchObject({ userId: 'bob', otherId: 'ann', value: 0.5 })
    expect(r['Most points in a season']).toMatchObject({ userId: 'ann', season: '2024', value: 200 })
    const riv = rivalries([s2024, s2025])
    expect(riv).toEqual([{ a: 'ann', b: 'bob', aWins: 2, bWins: 1, ties: 0, games: 3, margin: 59.5, last: { season: '2025', week: 1, winner: 'ann' } }])
    expect(rivalries([s2025])).toEqual([]) // one meeting is not a rivalry
  })

  it('tallies weekly award winners', () => {
    const t = tallyAwards([[{ title: 'High', rosterId: 1 }], [{ title: 'High', rosterId: 1 }, { title: 'Bench', rosterId: 2 }]])
    expect(t.get('High')!.get(1)).toBe(2)
    expect(t.get('Bench')!.get(2)).toBe(1)
  })
})
