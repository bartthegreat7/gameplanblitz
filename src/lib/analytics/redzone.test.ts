import type { GameState } from './gameday'
import { currentLeaders, diffSnaps, mergeEvents, snapOf, starterAlerts, type RzEvent } from './redzone'
import type { BoardGame, BoardSide } from './scoreboard'

const side = (rosterId: number, players: [string, number, GameState?, string?][]): BoardSide => {
  const ps = players.map(([id, points, state = 'in-progress', injury = '']) => ({ id, name: id, pos: 'RB', slot: 'RB', points, proj: 10, remaining: 0, state, injury }))
  const points = ps.reduce((t, p) => t + p.points, 0)
  return {
    rosterId,
    points,
    projectedFinal: points,
    pregame: 20,
    playersLeft: ps.filter((p) => p.state !== 'final').length,
    live: { rosterId, name: `T${rosterId}`, points, projectedFinal: points, remaining: 0, totalProj: 20, players: ps },
  }
}
const game = (matchupId: number, a: BoardSide, b: BoardSide | null): BoardGame => ({ matchupId, a, b, status: 'live', aWinPct: 0.5, close: false, upset: false })
const names = { team: (id: number) => `Team ${id}`, player: (id: string) => id.toUpperCase() }

describe('RedZone', () => {
  const g1 = [game(1, side(1, [['a', 10], ['b', 2]]), side(2, [['c', 8]]))]
  const g2 = [game(1, side(1, [['a', 10], ['b', 2]]), side(2, [['c', 15]]))] // c +7: big play, and 2 takes the lead
  const s1 = snapOf(g1, 1000, 5)
  const s2 = snapOf(g2, 2000, 5)

  it('reports nothing on the first update, a new week or an unchanged update', () => {
    expect(diffSnaps(null, s1, g1, names)).toEqual([])
    expect(diffSnaps({ ...s1, week: 4 }, s2, g2, names)).toEqual([])
    expect(diffSnaps(s1, s1, g1, names)).toEqual([])
  })

  it('finds big plays and lead changes between two updates', () => {
    const ev = diffSnaps(s1, s2, g2, names)
    expect(ev.map((e) => [e.kind, e.text])).toEqual([
      ['big-play', 'C +7.0 for Team 2 (now 15.0)'],
      ['lead-change', 'Team 2 takes the lead over Team 1, 15.0–12.0'],
    ])
  })

  it('labels a drop in points as a stat correction and finds ties', () => {
    const g3 = [game(1, side(1, [['a', 10], ['b', 2]]), side(2, [['c', 12]]))] // c −3: correction, 12–12
    const ev = diffSnaps(s2, snapOf(g3, 3000, 5), g3, names)
    expect(ev.map((e) => e.kind)).toEqual(['correction', 'tied'])
    expect(ev[0].text).toMatch(/C −3\.0 for Team 2: a stat correction/)
  })

  it('merges events newest first without duplicates', () => {
    const e = (key: string, at: number) => ({ key, at }) as RzEvent
    expect(mergeEvents([e('x', 1)], [e('x', 1), e('y', 2)]).map((x) => x.key)).toEqual(['y', 'x'])
    expect(mergeEvents([], [e('a', 1), e('b', 2), e('c', 3)], 2).map((x) => x.key)).toEqual(['c', 'b'])
  })

  it('lists leaders closest first and starters who cannot play before kickoff', () => {
    const gs = [
      game(1, side(1, [['a', 30]]), side(2, [['c', 10]])),
      game(2, side(3, [['d', 11]]), side(4, [['e', 12], ['f', 0, 'not-started', 'Out'], ['g', 0, 'not-started', 'Questionable']])),
    ]
    expect(currentLeaders(gs).map((l) => [l.leader, l.margin])).toEqual([
      [4, 1],
      [1, 20],
    ])
    expect(starterAlerts(gs)).toEqual([{ matchupId: 2, rosterId: 4, playerId: 'f', injury: 'Out' }])
  })
})
