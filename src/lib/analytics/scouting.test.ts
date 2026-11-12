import { buildModel, player, roster } from '../../test/fixtures'
import { winProbability } from '../scoring'
import type { SleeperMatchup } from '../sleeper'
import { groupOf, headToHead, lineupFacts, positionStrengths, projectedLineup, scoreHistory, teamForm } from './scouting'

const mu = (roster_id: number, matchup_id: number | null, points: number, starters: string[] = []): SleeperMatchup => ({ roster_id, matchup_id, points, starters, players: starters })

describe('scoreHistory and teamForm', () => {
  const weeks = [
    { week: 2, matchups: [mu(1, 1, 120), mu(2, 1, 100)] },
    { week: 1, matchups: [mu(1, 1, 90), mu(2, 1, 110)] },
    { week: 3, matchups: [mu(1, 1, 130), mu(2, 1, 130)] },
    { week: 4, matchups: [mu(1, 1, 140), mu(2, 1, 100)] },
    { week: 5, matchups: [mu(1, 1, 0), mu(2, 1, 0)] }, // not played yet
    { week: 6, matchups: [mu(1, null, 0)] }, // bye / no matchup
  ]
  const h = scoreHistory(weeks, 1)

  it('lists completed weeks in order with results, skipping unplayed weeks', () => {
    expect(h.map((x) => [x.week, x.points, x.opponentPoints, x.result])).toEqual([
      [1, 90, 110, 'L'], [2, 120, 100, 'W'], [3, 130, 130, 'T'], [4, 140, 100, 'W'],
    ])
    expect(h[0].opponentRosterId).toBe(2)
  })

  it('summarizes record, average, recent form and streak', () => {
    const f = teamForm(h)!
    expect(f).toMatchObject({ games: 4, avg: 120, high: 140, low: 90, record: '2-1-1', streak: 'W1' })
    expect(f.last3).toBeCloseTo(130)
    expect(f.label).toBe('hot') // 130 - 120 >= 8
  })

  it('is null with no games', () => {
    expect(teamForm([])).toBeNull()
  })
})

/* Me: QB 20, RB 10/8, WR 15. Them: QB 12, RB 18, WR 9 (and a third team for league averages). */
const m = buildModel({
  players: {
    q1: player('q1', 'QB'), r1: player('r1', 'RB'), r2: player('r2', 'RB'), w1: player('w1', 'WR'),
    q2: player('q2', 'QB'), r3: player('r3', 'RB'), w2: player('w2', 'WR'), w3: player('w3', 'WR', { injury_status: 'Out' }),
    q3: player('q3', 'QB'), r4: player('r4', 'RB'), w4: player('w4', 'WR'),
  },
  rosters: [roster(1, 'u1', ['q1', 'r1', 'r2', 'w1']), roster(2, 'u2', ['q2', 'r3', 'w2', 'w3']), roster(3, 'u3', ['q3', 'r4', 'w4'])],
  startSlots: ['QB', 'RB', 'WR', 'FLEX'],
  proj: { q1: 20, r1: 10, r2: 8, w1: 15, q2: 12, r3: 18, w2: 9, w3: 30, q3: 16, r4: 11, w4: 11 },
})

describe('projected lineups and strengths', () => {
  it('maps slots to groups', () => {
    expect(['QB', 'FLEX', 'SUPER_FLEX', 'WRRB_FLEX', 'REC_FLEX', 'K', 'DL'].map(groupOf)).toEqual(['QB', 'FLEX', 'FLEX', 'FLEX', 'FLEX', 'K', 'OTHER'])
  })
  it('builds the best projected lineup and leaves Out players out, even if a slot stays empty', () => {
    const line = projectedLineup(m, 2)
    expect(line.map((s) => [s.slot, s.id, s.proj])).toEqual([['QB', 'q2', 12], ['RB', 'r3', 18], ['WR', 'w2', 9], ['FLEX', null, 0]])
  })
  it('ranks each position group across the league', () => {
    const s = positionStrengths(m, 1)
    const qb = s.find((x) => x.group === 'QB')!
    expect(qb).toMatchObject({ proj: 20, rank: 1, of: 3 })
    expect(qb.leagueAvg).toBeCloseTo((20 + 12 + 16) / 3)
    expect(s.find((x) => x.group === 'RB')).toMatchObject({ proj: 10, rank: 3 })
  })
  it('compares two teams group by group with the standard win model', () => {
    const h = headToHead(m, 1, 2)
    expect(h.groups.find((g) => g.group === 'QB')!.edge).toBe(8)
    expect(h.groups.find((g) => g.group === 'RB')!.edge).toBe(-8)
    expect(h.myProj).toBe(53) // 20 + 10 + 15 + 8
    expect(h.theirProj).toBe(39) // 12 + 18 + 9 + 0
    expect(h.winPct).toBe(Math.round(100 * winProbability(53, 39)))
  })
})

describe('lineupFacts', () => {
  it('reports empty slots and starters listed Out or Questionable, as shown in Sleeper', () => {
    const withQ = buildModel({
      players: { q2: player('q2', 'QB', { injury_status: 'Questionable' }), w3: player('w3', 'WR', { injury_status: 'Out' }) },
      rosters: [roster(1, 'u1', []), roster(2, 'u2', ['q2', 'w3'])],
      startSlots: ['QB', 'RB', 'WR', 'FLEX'],
      proj: {},
    })
    const f = lineupFacts(withQ, mu(2, 1, 0, ['q2', '0', 'w3']))!
    expect(f.empty).toEqual(['RB', 'FLEX'])
    expect(f.unavailable).toEqual([{ id: 'w3', injury: 'Out' }])
    expect(f.questionable).toEqual([{ id: 'q2', injury: 'Questionable' }])
    expect(lineupFacts(withQ, null)).toBeNull()
  })
})
