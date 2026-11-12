import { buildModel, player, roster } from '../../test/fixtures'
import {
  breakoutPickups,
  deadlineFor,
  injuryOpenings,
  injuryWatch,
  weatherRisk,
} from './edgeSignals'
import { buildBrief } from './gm'
import { usageBook, type Breakout, type WeekData } from './opportunity'

const m = buildModel({
  players: {
    q: player('q', 'RB', { injury_status: 'Questionable' }),
    d: player('d', 'WR', { injury_status: 'Doubtful', team: 'BBB' }),
    b1: player('b1', 'RB'),
    b2: player('b2', 'WR', { injury_status: 'Out' }),
    fa: player('fa', 'RB', { team: 'BBB' }),
  },
  rosters: [roster(1, 'u1', ['q', 'd', 'b1', 'b2'])],
  startSlots: ['RB', 'WR'],
  proj: { q: 12, d: 9, b1: 7, b2: 15, fa: 4 },
})
const schedule = [
  { game_id: '1', week: 5, status: 'pre_game', date: '2026-11-15', home: 'AAA', away: 'BBB' },
]

describe('injury watch', () => {
  const a = injuryWatch(m, ['q', 'd'], ['RB', 'WR'], schedule, 5)
  it('flags Questionable as this week and Doubtful as do now, naming a healthy eligible backup', () => {
    expect(a.map((x) => [x.title, x.priority])).toEqual([
      ['Monitor q. Player (Questionable)', 2],
      ['Monitor d. Player (Doubtful)', 1],
    ])
    expect(a[0].detail).toMatch(/Best eligible backup on your bench: b. Player \(7\.0 proj\)/)
    // the only bench WR is Out, so no backup is offered
    expect(a[1].detail).toMatch(/No eligible healthy backup/)
  })
  it('gives the game date as the deadline, honest about the kickoff time', () => {
    expect(a[0].deadline).toMatch(/^Before kickoff on Sun, Nov 15 \(kickoff time not published\)$/)
    expect(deadlineFor(schedule, 'ZZZ', 5)).toBeUndefined()
  })
})

describe('weather, breakouts and injury openings', () => {
  it('turns flagged forecasts into context-only actions', () => {
    const w = weatherRisk(
      m,
      [{ id: 'q', risks: ['Strong wind (24 mph, gusts 35)'], matchup: 'BBB @ AAA' }],
      schedule,
      5,
    )
    expect(w[0]).toMatchObject({
      area: 'weather',
      priority: 3,
      impact: 'Context only',
      detail: 'Strong wind (24 mph, gusts 35).',
    })
  })
  it('only suggests breakout players who are free agents', () => {
    const b = (id: string): Breakout => ({
      id,
      pos: 'RB',
      signals: ['Snap share up 20 pts', 'Targets up 3.0 per game'],
      recent: { snapShare: 0.6, targets: 5, touches: 12, rzOpps: 1, pts: 9, xfp: null },
      earlier: { snapShare: 0.4, targets: 2, touches: 8, rzOpps: 0, pts: 6 },
      games: 6,
    })
    const picks = breakoutPickups(m, [b('q'), b('fa')], m.allRostered())
    expect(picks.map((p) => p.id)).toEqual(['breakout-fa'])
    expect(picks[0].uncertainty).toMatch(/last 2 games vs 4 earlier/)
  })
  it('suggests free agents whose usage rose when a rostered teammate (out/doubtful) sat', () => {
    // d (WR, BBB, Doubtful) missed weeks 3-4; fa (RB, BBB) got more work then
    const weeks: WeekData[] = [1, 2, 3, 4].map((week): WeekData => ({
      week,
      rows: [
        ...(week <= 2
          ? [{ player_id: 'd', team: 'BBB', stats: { gp: 1, rec_tgt: 8, rec: 5 } }]
          : []),
        {
          player_id: 'fa',
          team: 'BBB',
          stats: {
            gp: 1,
            ...(week <= 2 ? { rush_att: 3, rec_tgt: 1 } : { rush_att: 8, rec_tgt: 3, rec: 2 }),
          },
        },
      ],
    }))
    const book = usageBook(
      weeks,
      (s) => s.rec ?? 0,
      () => null,
    )
    const o = injuryOpenings(m, book, m.allRostered())
    expect(o.map((x) => x.title)).toEqual([
      'Investigate f. Player: more work when d. Player is out',
    ])
    expect(o[0].uncertainty).toMatch(/Small sample/)
    expect(injuryOpenings(m, book, m.allRostered(), 99)).toEqual([])
  })
})

describe('The Edge ordering', () => {
  it('merges extra signals into the brief by urgency, and can return everything', () => {
    const extras = injuryWatch(m, ['q', 'd'], ['RB', 'WR'], schedule, 5)
    const base = {
      week: 5,
      opponent: null,
      lineup: null,
      waivers: null,
      trades: null,
      h2h: null,
      playoff: null,
      myNews: [],
      keepers: null,
      keeperLeague: false,
    }
    const all = buildBrief({ ...base, extras }, Infinity).actions
    expect(all.map((a) => a.priority)).toEqual([1, 2])
    expect(buildBrief({ ...base, extras }, 1).actions).toHaveLength(1)
  })
})
