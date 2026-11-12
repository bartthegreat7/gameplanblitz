import { playerValue, pointsFor, seasonPPG, winProbability } from './scoring'

describe('pointsFor', () => {
  const scoring = { rec: 1, rec_yd: 0.1, rec_td: 6 }

  it('sums stat * weight over the league scoring keys', () => {
    // 5 rec + 60 yd * .1 + 1 td * 6 = 5 + 6 + 6
    expect(pointsFor({ rec: 5, rec_yd: 60, rec_td: 1 }, scoring)).toBeCloseTo(17)
  })
  it('ignores stats with no scoring weight', () => {
    expect(pointsFor({ rec: 2, fumbles_lost_unscored: 3 }, scoring)).toBe(2)
  })
  it('returns 0 for missing stats', () => {
    expect(pointsFor(undefined, scoring)).toBe(0)
    expect(pointsFor(null, scoring)).toBe(0)
  })
  it('falls back to pre-packaged points when league scoring yields 0', () => {
    expect(pointsFor({ pts_ppr: 12.5 }, { rec: 1 })).toBe(12.5)
    expect(pointsFor({ pts_half_ppr: 11 }, { rec: 0.5 })).toBe(11)
    expect(pointsFor({ pts_std: 9 }, {})).toBe(9)
    // full PPR points are not used for a non-PPR league
    expect(pointsFor({ pts_ppr: 12.5 }, { rec: 0 })).toBe(0)
  })
})

describe('seasonPPG', () => {
  it('divides season points by games played', () => {
    expect(seasonPPG({ rec: 10, gp: 2 }, { rec: 1 })).toBe(5)
  })
  it('uses gms_active when gp is missing', () => {
    expect(seasonPPG({ rec: 9, gms_active: 3 }, { rec: 1 })).toBe(3)
  })
  it('is null with no games', () => {
    expect(seasonPPG({ rec: 10, gp: 0 }, { rec: 1 })).toBeNull()
    expect(seasonPPG(undefined, { rec: 1 })).toBeNull()
  })
})

describe('playerValue', () => {
  it('blends season PPG and projection 50/50', () => {
    expect(playerValue(10, 14)).toBe(12)
  })
  it('falls back to the projection without a season average', () => {
    expect(playerValue(null, 14)).toBe(14)
  })
})

describe('winProbability', () => {
  it('is 50% for equal projections', () => {
    expect(winProbability(100, 100)).toBe(0.5)
  })
  it('is logistic with scale 28', () => {
    expect(winProbability(128, 100)).toBeCloseTo(1 / (1 + Math.exp(-1)), 10)
    expect(winProbability(100, 128)).toBeCloseTo(1 - 1 / (1 + Math.exp(-1)), 10)
  })
})
