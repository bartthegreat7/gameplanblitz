import { build, buildSamples, slimRows, type SeasonData } from './build'

const row = (id: string, pos: string, stats: Record<string, number>, injury = '') => ({
  id,
  pos,
  stats,
  injury,
})

describe('slimRows', () => {
  it('normalizes array and object responses and keeps position + injury', () => {
    expect(
      slimRows([
        {
          player_id: '1',
          stats: { pts_ppr: 3 },
          player: { position: 'WR', injury_status: 'Questionable' },
        },
      ]),
    ).toEqual([row('1', 'WR', { pts_ppr: 3 }, 'Questionable')])
    expect(slimRows({ '2': { pts_ppr: 1 } })).toEqual([row('2', '', { pts_ppr: 1 })])
    expect(slimRows(null)).toEqual([])
  })
})

describe('buildSamples', () => {
  const season: SeasonData = {
    season: '2026',
    prevTotals: new Map([['a', { pts_ppr: 120, gp: 10 }]]),
    weeks: [
      {
        week: 1,
        proj: new Map([['a', row('a', 'WR', { pts_ppr: 10 })]]),
        actual: new Map([['a', row('a', 'WR', { pts_ppr: 20, gp: 1, rec_tgt: 9 })]]),
      },
      {
        week: 2,
        proj: new Map([['a', row('a', 'WR', { pts_ppr: 11 })]]),
        actual: new Map([['a', row('a', 'WR', { pts_ppr: 5, gp: 1, rec_tgt: 4 })]]),
      },
      { week: 3, proj: new Map([['a', row('a', 'WR', { pts_ppr: 12 })]]), actual: new Map() }, // did not play
    ],
  }
  const { samples } = buildSamples([season], 'ppr')

  it('uses only games before each week (no look-ahead) and last season as a stabilizer', () => {
    expect(samples.map((s) => [s.week, s.f.games, s.f.recent])).toEqual([
      [1, 0, null],
      [2, 1, 20],
      [3, 2, (5 * 3 + 20 * 2) / 5],
    ])
    expect(samples[0].f.prevPpg).toBe(12)
  })
  it('counts a player who did not play as 0', () => {
    expect(samples[2].actual).toBe(0)
  })
})

describe('build', () => {
  it('falls back cleanly when Sleeper is in the preseason (no current-season weeks)', async () => {
    const calls: string[] = []
    const f = async (url: string) => {
      calls.push(url)
      if (url.endsWith('/v1/state/nfl')) return { season: '2026', week: 1, season_type: 'pre' }
      return []
    }
    const file = await build({}, f, () => {})
    expect(file.seasons).toEqual(['2025'])
    expect(file.trainedThrough).toEqual({ season: '2025', week: 18 })
    expect(calls.some((u) => u.includes('/2026/'))).toBe(false)
  })
})
