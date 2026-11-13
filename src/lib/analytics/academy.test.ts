import type { SleeperMatchup } from '../sleeper'
import { progress, reviewWeek, type WeekReview } from './academy'

const POS: Record<string, string> = { a: 'RB', b: 'RB', c: 'WR', d: 'WR' }
const posOf = (id: string) => POS[id]
const row = (starters: string[], pp: Record<string, number>, points?: number): SleeperMatchup => ({
  roster_id: 1,
  matchup_id: 1,
  points: points ?? starters.reduce((t, id) => t + (pp[id] ?? 0), 0),
  starters,
  players: Object.keys(POS),
  players_points: pp,
})
const opp = (points: number): SleeperMatchup => ({ roster_id: 2, matchup_id: 1, points, starters: [], players: [] })

describe('decision reviews', () => {
  it('separates the process (projections before kickoff) from the outcome (points)', () => {
    // started b (proj 6) over a (proj 10) at RB: a process miss, and a outscored b
    const r = reviewWeek({
      week: 3,
      mine: row(['b', 'c'], { a: 15, b: 4, c: 12, d: 3 }),
      opp: opp(14),
      startSlots: ['RB', 'WR'],
      posOf,
      projOf: (id) => ({ a: 10, b: 6, c: 9, d: 7 })[id]!,
    })
    expect(r).toMatchObject({ setProj: 15, bestProj: 19, processGap: 4, bestProjActual: 27, setActual: 16, bestActual: 27, hindsightGap: 11, result: 'W', margin: 2 })
    expect(r.decisions).toEqual([{ slot: 'RB', started: { id: 'b', proj: 6, actual: 4 }, benched: { id: 'a', proj: 10, actual: 15 }, verdict: 'process-miss' }])
  })

  it('calls a projection-backed choice unlucky (not a mistake), and a lucky miss lucky', () => {
    const unlucky = reviewWeek({
      week: 4,
      mine: row(['a', 'c'], { a: 3, b: 20, c: 10, d: 2 }),
      opp: opp(30),
      startSlots: ['RB', 'WR'],
      posOf,
      projOf: (id) => ({ a: 12, b: 6, c: 9, d: 7 })[id]!,
    })
    expect(unlucky.processGap).toBe(0)
    expect(unlucky.decisions).toEqual([expect.objectContaining({ verdict: 'unlucky', started: expect.objectContaining({ id: 'a' }), benched: expect.objectContaining({ id: 'b' }) })])
    const lucky = reviewWeek({
      week: 5,
      mine: row(['b', 'c'], { a: 2, b: 18, c: 9, d: 1 }),
      opp: opp(10),
      startSlots: ['RB', 'WR'],
      posOf,
      projOf: (id) => ({ a: 10, b: 6, c: 9, d: 7 })[id]!,
    })
    expect(lucky.decisions[0].verdict).toBe('lucky')
  })

  it('weighs each bench player against one starter only', () => {
    // two WR starters (c, d) both projected below bench WR e: only one decision mentions e
    const pos = (id: string) => (id.startsWith('r') ? 'RB' : 'WR')
    const r = reviewWeek({
      week: 6,
      mine: { roster_id: 1, matchup_id: 1, points: 10, starters: ['c', 'd'], players: ['c', 'd', 'e'], players_points: { c: 5, d: 5, e: 20 } },
      opp: null,
      startSlots: ['WR', 'WR'],
      posOf: pos,
      projOf: (id) => ({ c: 6, d: 7, e: 15 })[id]!,
    })
    expect(r.decisions.filter((d) => d.benched.id === 'e')).toHaveLength(1)
    expect(r.result).toBeNull()
  })

  it('tracks progress: optimal weeks, the process gap trend and where misses happen', () => {
    const w = (week: number, processGap: number, slot = 'FLEX', verdict: 'process-miss' | 'unlucky' = 'process-miss'): WeekReview => ({
      week,
      setProj: 100,
      bestProj: 100 + processGap,
      processGap,
      bestProjActual: 100,
      setActual: 100,
      bestActual: 110,
      hindsightGap: 10,
      result: 'W',
      margin: 5,
      decisions: processGap ? [{ slot, verdict, started: { id: 'x', proj: 1, actual: 1 }, benched: { id: 'y', proj: 2, actual: 2 } }] : [],
    })
    const p = progress([w(1, 6), w(2, 4, 'RB'), w(3, 0), w(4, 1)])
    expect(p).toMatchObject({ weeks: 4, optimalWeeks: 1, avgProcessGap: 2.75, trend: { early: 5, recent: 0.5 } })
    expect(p.focus).toEqual([{ slot: 'FLEX', misses: 2 }, { slot: 'RB', misses: 1 }])
    expect(progress([w(1, 2)]).trend).toBeNull()
  })
})
