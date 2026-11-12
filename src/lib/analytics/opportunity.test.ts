import type { PlayerMap, StatRow } from '../sleeper'
import {
  availabilityOf,
  breakouts,
  domino,
  teamContext,
  usageBook,
  type WeekData,
} from './opportunity'

const P = (player_id: string, position: string, team: string, extra = {}) => ({
  player_id,
  position,
  team,
  ...extra,
})
const row = (player_id: string, team: string, stats: Record<string, number>): StatRow => ({
  player_id,
  team,
  stats: { gp: 1, off_snp: 0, tm_off_snp: 60, ...stats },
})
const pts = (s: Record<string, number>) =>
  (s.rec ?? 0) + 0.1 * (s.rec_yd ?? 0) + 0.1 * (s.rush_yd ?? 0)

describe('availability', () => {
  it('never treats Questionable as out', () => {
    expect([
      availabilityOf('Out'),
      availabilityOf('IR'),
      availabilityOf('Doubtful'),
      availabilityOf('Questionable'),
      availabilityOf(null),
    ]).toEqual(['out', 'out', 'doubtful', 'questionable', 'active'])
  })
})

describe('teamContext', () => {
  it('finds the depth-chart QB1 and offensive-line injuries', () => {
    const players = {
      q1: P('q1', 'QB', 'AAA', { depth_chart_order: 1, injury_status: 'Questionable' }),
      q2: P('q2', 'QB', 'AAA', { depth_chart_order: 2 }),
      t: P('t', 'T', 'AAA', { injury_status: 'Out' }),
      g: P('g', 'G', 'AAA'),
      x: P('x', 'C', 'BBB', { injury_status: 'Out' }),
    } as PlayerMap
    expect(teamContext(players, 'AAA')).toEqual({
      qb: { id: 'q1', status: 'Questionable' },
      olInjuries: [{ id: 't', pos: 'T', status: 'Out' }],
    })
  })
})

/* Team AAA, weeks 1-4. RB1 plays weeks 1-2 then misses 3-4. RB2's carries jump without him; WR flat. */
const weeks: WeekData[] = [1, 2, 3, 4].map((week) => ({
  week,
  rows: [
    ...(week <= 2 ? [row('rb1', 'AAA', { rush_att: 18, off_snp: 45 })] : []),
    row(
      'rb2',
      'AAA',
      week <= 2
        ? { rush_att: 5, off_snp: 15 }
        : { rush_att: 16, rec: 2, rec_tgt: 3, off_snp: 42, rush_rz_att: 2 },
    ),
    row('wr1', 'AAA', { rec_tgt: 7, rec: 5, off_snp: 55 }),
  ],
}))
const players = {
  rb1: P('rb1', 'RB', 'AAA', { injury_status: 'Out', depth_chart_order: 1 }),
  rb2: P('rb2', 'RB', 'AAA', { depth_chart_order: 2 }),
  rb3: P('rb3', 'RB', 'AAA', { depth_chart_order: 3 }), // no games: depth chart only
  wr1: P('wr1', 'WR', 'AAA'),
  k: P('k', 'K', 'AAA'),
} as PlayerMap

describe('domino', () => {
  const book = usageBook(weeks, pts, () => null)
  const r = domino(book, players, 'rb1')
  it('measures teammates in games the player missed vs games he played', () => {
    const rb2 = r.find((x) => x.id === 'rb2')!
    expect(rb2).toMatchObject({ without: 2, with: 2, depth: 2 })
    expect(rb2.delta!.touches).toBe(13) // 18 - 5
    expect(rb2.delta!.snapShare).toBeCloseTo(0.45)
    expect(r.find((x) => x.id === 'wr1')!.delta!.targets).toBe(0) // no change for the receiver
  })
  it('lists depth-chart backups with no games as unmeasured, and skips unrelated positions', () => {
    expect(r.find((x) => x.id === 'rb3')).toMatchObject({ delta: null, depth: 3 })
    expect(r.some((x) => x.id === 'k')).toBe(false)
    expect(r[0].id).toBe('rb2') // biggest measured gain first
  })
  it('gives no number when the player has not missed a game', () => {
    const full = usageBook(weeks.slice(0, 2), pts, () => null)
    expect(domino(full, players, 'rb1').every((x) => x.delta === null)).toBe(true)
  })
})

describe('breakouts', () => {
  it('flags rising usage with 2+ signals and explains them', () => {
    const book = usageBook(weeks, pts, (id, s) =>
      id === 'rb2' ? 0.6 * (s.rush_att ?? 0) + 1.2 * (s.rec_tgt ?? 0) : null,
    )
    const b = breakouts(book, (id) => players[id]?.position ?? '')
    expect(b.map((x) => x.id)).toEqual(['rb2'])
    expect(b[0].signals.join(' | ')).toMatch(
      /Snap share up 45 pts .*Touches up 13\.0 per game.*Red-zone chances up 2\.0/,
    )
    // usage worth more than the scoring: xfp 0.6*16 + 1.2*3 = 13.2 vs 2 pts
    expect(b[0].signals.some((s) => /Usage worth 13\.2 pts/.test(s))).toBe(true)
  })
  it('needs enough earlier games to compare against', () => {
    const book = usageBook(weeks.slice(1), pts, () => null) // only 1 earlier game
    expect(breakouts(book, (id) => players[id]?.position ?? '')).toEqual([])
  })
})
