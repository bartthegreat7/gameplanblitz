import type { SleeperMatchup } from '../sleeper'
import { leaderPositions, weekLeaders } from './leaders'

const POS: Record<string, string> = { qb1: 'QB', qb2: 'QB', rb1: 'RB', rb2: 'RB', rb3: 'RB', wr1: 'WR', BUF: 'DEF', idp: 'LB' }
const pos = (id: string) => POS[id] ?? ''

const mu = (o: Partial<SleeperMatchup>): SleeperMatchup => ({
  roster_id: 1,
  matchup_id: 1,
  points: 0,
  starters: [],
  players: [],
  ...o,
})

describe('weekly leaders', () => {
  const week = [
    mu({ roster_id: 1, matchup_id: 1, points: 101.2, starters: ['qb1', 'rb1'], players: ['qb1', 'rb1', 'rb3'], players_points: { qb1: 24.5, rb1: 12, rb3: 30.1 } }),
    mu({ roster_id: 2, matchup_id: 1, points: 88.4, starters: ['qb2', 'rb2', 'BUF'], players: ['qb2', 'rb2', 'BUF', 'idp'], players_points: { qb2: 18, rb2: 12, BUF: 9, idp: 7 } }),
    mu({ roster_id: 3, matchup_id: 2, points: 120.0, starters: ['wr1'], players: ['wr1'], starters_points: [26.3] }),
    mu({ roster_id: 4, matchup_id: null, points: 0, starters: [], players: [] }),
  ]

  it('ranks every team by points this week, with the opponent score', () => {
    const l = weekLeaders(week, pos)
    expect(l.teams.map((t) => [t.rosterId, t.points, t.oppRosterId, t.oppPoints])).toEqual([
      [3, 120, null, null],
      [1, 101.2, 2, 88.4],
      [2, 88.4, 1, 101.2],
      [4, 0, null, null],
    ])
    expect(l.scored).toBe(true)
  })

  it('ranks rostered players at each position, bench included and marked', () => {
    const l = weekLeaders(week, pos)
    expect(l.byPosition.get('RB')!.map((p) => [p.id, p.points, p.started])).toEqual([
      ['rb3', 30.1, false], // best RB sat on a bench
      ['rb1', 12, true],
      ['rb2', 12, true],
    ])
    expect(l.byPosition.get('QB')![0]).toMatchObject({ id: 'qb1', rosterId: 1 })
    expect(l.byPosition.get('WR')![0]).toMatchObject({ id: 'wr1', points: 26.3, started: true }) // from starters_points
    expect(leaderPositions(l.byPosition)).toEqual(['QB', 'RB', 'WR', 'DEF', 'LB'])
  })

  it('says when nothing has been scored yet', () => {
    expect(weekLeaders([mu({ points: 0, players_points: { qb1: 0 } })], pos).scored).toBe(false)
  })
})
