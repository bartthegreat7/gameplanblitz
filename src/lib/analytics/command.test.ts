import {
  actionItems,
  gameStrip,
  greetingFor,
  oddsChange,
  percentile,
  radarProfile,
  recordOdds,
  teamHealth,
  type ActionInput,
  type StripPlayer,
} from './command'
import type { Candidate, LineupPlan, SlotPlan } from './lineupPlan'
import type { Usage, UsageBook } from './opportunity'

const cand = (id: string, o: Partial<Candidate> = {}): Candidate =>
  ({ id, name: id.toUpperCase(), pos: 'RB', team: 'AAA', opponent: 'BBB', proj: 10, sd: null, floor: null, ceiling: null, n: 0, injury: '', out: false, bye: false, started: false, usage: null, matchup: null, ...o }) as Candidate
const slot = (label: string, current: Candidate | null, recommended = current): SlotPlan =>
  ({ slot: label, label, current, recommended, locked: false, changed: current !== recommended, move: false, partner: null, delta: 0, reasons: [], evidence: [], confidence: null }) as SlotPlan
const plan = (slots: SlotPlan[], o: Partial<LineupPlan> = {}): LineupPlan =>
  ({ mode: 'projection', slots, start: [], sit: [], current: { proj: 50, sd: null, floor: null, ceiling: null }, recommended: { proj: 50, sd: null, floor: null, ceiling: null }, ...o }) as LineupPlan

describe('greeting', () => {
  it('follows the local hour', () => {
    expect(greetingFor(6)).toBe('Good Morning')
    expect(greetingFor(13)).toBe('Good Afternoon')
    expect(greetingFor(19)).toBe('Good Evening')
    expect(greetingFor(2)).toBe('Good Evening')
  })
})

describe('team health', () => {
  it('flags empty, out, bye, doubtful and questionable starters, worst first', () => {
    const h = teamHealth(
      plan([
        slot('QB', cand('qb')),
        slot('RB', cand('rb', { injury: 'Questionable' })),
        slot('WR', cand('wr', { injury: 'Out', out: true })),
        slot('TE', cand('te', { bye: true })),
        slot('FLEX', null),
        slot('K', cand('k', { injury: 'Doubtful' })),
      ]),
    )
    expect(h.slots).toBe(6)
    expect(h.ready).toBe(1)
    expect(h.concerns.map((c) => c.level)).toEqual(['empty', 'out', 'bye', 'doubtful', 'questionable'])
    expect(h.status).toBe('action')
  })

  it('only monitors when the sole concern is a questionable player, and is ready otherwise', () => {
    expect(teamHealth(plan([slot('QB', cand('qb', { injury: 'Questionable' }))])).status).toBe('monitor')
    const ok = teamHealth(plan([slot('QB', cand('qb')), slot('RB', cand('rb'))]))
    expect(ok).toMatchObject({ status: 'ready', ready: 2, readiness: 100, concerns: [] })
  })
})

describe('action items', () => {
  const base: ActionInput = {
    plan: plan([slot('QB', cand('qb'))]),
    health: teamHealth(plan([slot('QB', cand('qb'))])),
    waivers: { upgrades: [] },
    trades: { mutual: 0 },
    weatherFlags: 0,
    weatherChecked: true,
  }

  it('marks tasks done only when the data shows them resolved', () => {
    const items = actionItems(base)
    expect(items.every((i) => i.state === 'done')).toBe(true)
    expect(items.map((i) => i.id)).toEqual(['lineup', 'injuries', 'questionable', 'waivers', 'trades', 'weather'])
  })

  it('asks for attention with the evidence, and puts attention first', () => {
    const items = actionItems({
      ...base,
      plan: plan([slot('QB', cand('qb'), cand('qb2'))], { start: [cand('qb2')], current: { proj: 40, sd: null, floor: null, ceiling: null }, recommended: { proj: 46.5, sd: null, floor: null, ceiling: null } }),
      health: teamHealth(plan([slot('QB', cand('qb', { injury: 'Questionable' }))])),
      waivers: { upgrades: [{ name: 'F. Agent', gain: 3.24 }] },
      weatherFlags: 2,
    })
    const by = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(by.lineup).toMatchObject({ state: 'attention', detail: '1 change worth +6.5 projected pts.' })
    expect(by.questionable).toMatchObject({ state: 'attention', title: 'Monitor 1 questionable player' })
    expect(by.injuries.state).toBe('done')
    expect(by.waivers.detail).toBe('1 upgrade: best is F. Agent (+3.2 pts/wk).')
    expect(by.weather).toMatchObject({ state: 'attention', to: '/weather' })
    const states = items.map((i) => i.state)
    expect(states.indexOf('done')).toBeGreaterThan(states.lastIndexOf('attention'))
  })

  it('keeps loading or optional work pending, never done', () => {
    const items = actionItems({ ...base, plan: null, waivers: null, trades: { mutual: 2 }, weatherFlags: null })
    const by = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(by.lineup.state).toBe('pending')
    expect(by.waivers.state).toBe('pending')
    expect(by.trades).toMatchObject({ state: 'pending', detail: '2 fair trades that help both teams. Optional.' })
    expect(by.weather.state).toBe('pending')
    expect(actionItems({ ...base, weatherChecked: false }).find((i) => i.id === 'weather')!.state).toBe('pending')
  })
})

describe('game day strip', () => {
  const p = (id: string, team: string, o: Partial<StripPlayer> = {}): StripPlayer => ({ id, name: id, team, points: 0, remaining: 10, state: 'not-started', ...o })
  const sched = [
    { game_id: 'g1', week: 5, status: 'complete', date: '2025-10-05', home: 'AAA', away: 'BBB' },
    { game_id: 'g2', week: 5, status: 'pre_game', date: '2025-10-06', home: 'CCC', away: 'DDD' },
    { game_id: 'g3', week: 5, status: 'pre_game', date: '2025-10-05', home: 'EEE', away: 'FFF' },
    { game_id: 'g4', week: 5, status: 'pre_game', date: '2025-10-05', home: 'GGG', away: 'HHH' },
    { game_id: 'g5', week: 6, status: 'pre_game', date: '2025-10-12', home: 'CCC', away: 'AAA' },
  ]

  it('keeps only games with starters, live first, finals last, with the net projected stake', () => {
    const games = gameStrip(
      sched,
      5,
      [p('a', 'AAA', { remaining: 0, points: 12, state: 'final' }), p('c', 'CCC', { remaining: 8 }), p('e', 'FFF', { points: 3, remaining: 7 })],
      [p('d', 'DDD', { remaining: 5 })],
    )
    expect(games.map((g) => [g.id, g.state])).toEqual([
      ['g3', 'live'], // schedule still says pre_game, but points are on the board
      ['g2', 'scheduled'],
      ['g1', 'final'],
    ])
    expect(games.find((g) => g.id === 'g2')!.net).toBe(3)
  })
})

describe('breakout radar profile', () => {
  const u = (o: Partial<Usage>): Usage => ({ week: 1, team: 'AAA', snapShare: 0.5, targets: 2, carries: 5, touches: 7, rzOpps: 0, pts: 6, xfp: 6, ...o })
  const book: UsageBook = {
    games: new Map([
      ['star', [u({ touches: 5, targets: 1 }), u({ touches: 6, targets: 1 }), u({ snapShare: 0.8, touches: 15, targets: 6, rzOpps: 2, xfp: 16 }), u({ snapShare: 0.9, touches: 17, targets: 6, rzOpps: 2, xfp: 18 })]],
      ['mid', [u({}), u({}), u({}), u({})]],
      ['low', [u({}), u({}), u({ snapShare: 0.2, touches: 2, targets: 0, xfp: 2 }), u({ snapShare: 0.2, touches: 2, targets: 0, xfp: 2 })]],
      ['wr', [u({}), u({}), u({ targets: 12 }), u({ targets: 12 })]],
    ]),
    teamWeeks: new Map(),
  }
  const pos = (id: string) => (id === 'wr' ? 'WR' : 'RB')

  it('places each recent average among same-position players, from the stats only', () => {
    const r = radarProfile(book, pos, 'star')!
    expect(r.peers).toBe(3) // the WR is not a peer
    const ax = Object.fromEntries(r.axes.map((a) => [a.key, a]))
    expect(ax.snap).toMatchObject({ display: '85%', pct: (2 + 0.5) / 3 * 100 })
    expect(ax.touches.display).toBe('16.0/g')
    expect(ax.growth.display).toBe('+15.5/g') // (21 + 23) / 2 − (6 + 7) / 2
    expect(radarProfile(book, pos, 'low')!.axes.find((a) => a.key === 'touches')!.pct).toBeCloseTo((0 + 0.5) / 3 * 100)
  })

  it('reports unknown values as n/a, and needs enough games', () => {
    const b2: UsageBook = { games: new Map([['x', [u({ snapShare: null }), u({})]]]), teamWeeks: new Map() }
    const r = radarProfile(b2, () => 'RB', 'x')!
    expect(r.axes.find((a) => a.key === 'snap')).toMatchObject({ raw: null, display: 'n/a', pct: 0 })
    expect(r.axes.find((a) => a.key === 'growth')!.display).toBe('n/a') // no earlier games
    expect(radarProfile({ games: new Map([['y', [u({})]]]), teamWeeks: new Map() }, () => 'RB', 'y')).toBeNull()
    expect(percentile([], 3)).toBe(0)
  })
})

describe('playoff odds history', () => {
  it('keeps one snapshot per day and compares with the latest earlier day', () => {
    let h = recordOdds([], { day: '2025-10-01', week: 4, pct: 50 })
    h = recordOdds(h, { day: '2025-10-03', week: 5, pct: 60 })
    h = recordOdds(h, { day: '2025-10-03', week: 5, pct: 62 })
    expect(h).toHaveLength(2)
    expect(oddsChange(h, '2025-10-03', 62)).toMatchObject({ delta: 12, since: { day: '2025-10-01' } })
    expect(oddsChange(h.slice(1), '2025-10-03', 62)).toBeNull()
  })
})
