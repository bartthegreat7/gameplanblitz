import type { SleeperMatchup } from '../sleeper'
import type { WeekReview } from './academy'
import { adviceRecord, biggestMisses, calibration, matchupPoints } from './trust'

const row = (roster_id: number, matchup_id: number, points: number, starters: string[], pp: Record<string, number> = {}): SleeperMatchup => ({
  roster_id,
  matchup_id,
  points,
  starters,
  players: starters,
  players_points: pp,
})

describe('prediction trust', () => {
  it('scores each matchup’s favorite from the set lineups’ projections, skipping ties', () => {
    const projOf = (id: string) => ({ a: 30, b: 10, c: 20, d: 20, e: 5, f: 5 })[id] ?? 0
    const pts = matchupPoints([
      {
        matchups: [row(1, 1, 90, ['a']), row(2, 1, 100, ['b']), row(3, 2, 80, ['c']), row(4, 2, 70, ['d']), row(5, 3, 50, ['e']), row(6, 3, 50, ['f'])],
        projOf,
      },
    ])
    expect(pts).toHaveLength(2)
    expect(pts[0].p).toBeGreaterThan(0.65) // 30 vs 10 projected
    expect(pts[0].won).toBe(false) // the favorite lost
    expect(pts[1]).toEqual({ p: 0.5, won: true }) // even projections: the first team counts as the favorite
  })

  it('bins predictions and computes the Brier score (coin flip = 0.25)', () => {
    const c = calibration([
      { p: 0.55, won: true },
      { p: 0.55, won: false },
      { p: 0.85, won: true },
      { p: 0.95, won: true },
    ])
    expect(c.n).toBe(4)
    expect(c.brier).toBeCloseTo((0.45 ** 2 + 0.55 ** 2 + 0.15 ** 2 + 0.05 ** 2) / 4)
    expect(c.bins).toEqual([
      { label: '50-60%', n: 2, predicted: 0.55, observed: 0.5 },
      { label: '80-90%', n: 1, predicted: 0.85, observed: 1 },
      { label: '90-100%', n: 1, predicted: 0.95, observed: 1 },
    ])
  })

  it('compares the lineup advice with the lineup you set, without claiming causation', () => {
    const r = (processGap: number, bestProjActual: number, setActual: number) => ({ processGap, bestProjActual, setActual }) as WeekReview
    expect(adviceRecord([r(0, 100, 100), r(4, 110, 100), r(3, 90, 95)])).toEqual({ weeks: 3, followed: 1, differed: 2, adviceScoredMore: 1, net: 5 })
  })

  it('lists the biggest misses among the starters', () => {
    const m = biggestMisses(row(1, 1, 0, ['a', 'b', '0'], { a: 30, b: 9 }), (id) => ({ a: 12, b: 10 })[id] ?? 0)
    expect(m).toEqual([
      { id: 'a', proj: 12, actual: 30, error: 18 },
      { id: 'b', proj: 10, actual: 9, error: -1 },
    ])
  })
})
