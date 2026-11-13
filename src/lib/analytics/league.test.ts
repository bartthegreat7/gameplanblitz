import type { SleeperMatchup } from '../sleeper'
import {
  allPlay,
  movers,
  outcome,
  pairGames,
  powerRankings,
  recordsThrough,
  standingsOrder,
  storylines,
  weekAwards,
  type WeekGames,
} from './league'

const row = (roster_id: number, matchup_id: number | null, points: number, extra: Partial<SleeperMatchup> = {}): SleeperMatchup => ({
  roster_id,
  matchup_id,
  points,
  starters: [],
  players: [],
  ...extra,
})
const wk = (week: number, rows: SleeperMatchup[]): WeekGames => ({ week, games: pairGames(rows) })
const NAMES: Record<number, string> = { 1: 'Ants', 2: 'Bears', 3: 'Cats', 4: 'Dogs' }
const name = (id: number) => NAMES[id]

/* 4 teams, 3 weeks. Final records: Ants 3-0, Bears 1-2, Cats 1-2, Dogs 1-2. */
const season: WeekGames[] = [
  wk(1, [row(1, 1, 120), row(2, 1, 100), row(3, 2, 90), row(4, 2, 95)]),
  wk(2, [row(1, 1, 110), row(3, 1, 80), row(2, 2, 130), row(4, 2, 70)]),
  wk(3, [row(1, 1, 99.6), row(4, 1, 99.2), row(2, 2, 140), row(3, 2, 141)]),
]

describe('pairing matchups', () => {
  it('makes one game per matchup id, never duplicates a team, and keeps unmatched teams solo', () => {
    const games = pairGames([row(2, 7, 50), row(1, 7, 60), row(1, 7, 60), row(3, null, 40)])
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({ matchupId: 7, a: { rosterId: 1 }, b: { rosterId: 2 } })
    expect(games[1]).toMatchObject({ a: { rosterId: 3 }, b: null })
    expect(outcome(games[0])).toMatchObject({ winner: { rosterId: 1 }, margin: 10 })
    expect(outcome(pairGames([row(1, 1, 50), row(2, 1, 50)])[0])).toBeNull() // tie
  })
})

describe('records and rankings', () => {
  it('rebuilds head-to-head records and standings from the scores', () => {
    const r = recordsThrough(season, 3)
    expect(r.get(1)).toMatchObject({ w: 3, l: 0, pf: 329.6 })
    expect(r.get(3)).toMatchObject({ w: 1, l: 2 })
    expect(standingsOrder(recordsThrough(season, 1))).toEqual([1, 4, 2, 3])
  })

  it('counts all-play results against every other team each week', () => {
    const ap = allPlay(season, 1)
    expect(ap.get(1)).toEqual({ w: 3, l: 0, t: 0 })
    expect(ap.get(3)).toEqual({ w: 0, l: 3, t: 0 })
  })

  it('ranks by all-play, scoring and projected strength, and reports movers', () => {
    const before = powerRankings(season, 2, null)
    const after = powerRankings(season, 3, new Map([[1, 100], [2, 130], [3, 90], [4, 80]]))
    expect(after[0].rosterId).toBe(2) // best all-play and points per game
    expect(after.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    // before week 3 Ants and Bears tie on all-play (5-1) and points per game; Ants rank first on the id tie-break
    expect(before.map((r) => r.rosterId)).toEqual([1, 2, 3, 4])
    const m = movers(before, after)
    expect(m[0]).toEqual({ rosterId: 2, from: 2, to: 1, change: 1 })
    expect(m.find((x) => x.rosterId === 1)).toMatchObject({ from: 1, to: 2, change: -1 })
  })
})

describe('weekly awards', () => {
  it('names the high score, blowout, closest game, toughest loss and best bench performance', () => {
    const games = pairGames([
      row(1, 1, 99.6, { starters: ['a'], players_points: { a: 99.6, bench1: 31 } }),
      row(4, 1, 99.2),
      row(2, 2, 140),
      row(3, 2, 141),
    ])
    const { awards, unavailable } = weekAwards(games)
    const by = Object.fromEntries(awards.map((a) => [a.id, a]))
    expect(by.high).toMatchObject({ rosterId: 3, value: 141 })
    expect(by.blowout).toMatchObject({ rosterId: 3, otherId: 2 })
    expect(by.closest.rosterId).toBe(1)
    expect(by.closest.value).toBeCloseTo(0.4)
    expect(by.tough).toMatchObject({ rosterId: 2, value: 140 })
    expect(by.bench).toMatchObject({ rosterId: 1, playerId: 'bench1', value: 31 })
    expect(unavailable.map((u) => u.title)).toEqual(['Comeback of the Week', 'Biggest Upset'])
  })

  it('awards the biggest upset only with projections, and nothing before any scoring', () => {
    const games = pairGames([row(1, 1, 100), row(2, 1, 90), row(3, 2, 80), row(4, 2, 70)])
    const proj: Record<number, number> = { 1: 95, 2: 115, 3: 100, 4: 90 }
    const { awards } = weekAwards(games, (id) => proj[id])
    expect(awards.find((a) => a.id === 'upset')).toMatchObject({ rosterId: 1, otherId: 2, value: 20, model: true })
    expect(weekAwards(pairGames([row(1, 1, 0), row(2, 1, 0)])).awards).toEqual([])
  })
})

describe('storylines', () => {
  it('finds the leader upset, contenders meeting, sub-point finishes, the top scorer losing and streaks', () => {
    const texts = storylines(season, 3, name, 2).map((s) => s.text)
    expect(texts).toContain('Ants edged Dogs by 0.40 points.')
    expect(texts).toContain('Ants has won 3 straight.')
    // week 2: Bears (2nd after week 1? no) — check the leader-upset rule on a crafted week
    const w = [...season, wk(4, [row(1, 1, 80), row(2, 1, 120), row(3, 2, 100), row(4, 2, 60)])]
    const s4 = storylines(w, 4, name, 2).map((s) => s.text)
    expect(s4).toContain('First-place Ants fell to Bears, 120.0-80.0.')
    expect(s4).toContain('Two teams in playoff position met: Bears beat Ants.')
    expect(storylines(season, 9, name, 2)).toEqual([])
  })
})
