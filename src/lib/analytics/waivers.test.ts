import type { SleeperLeague, SleeperTransaction } from '../sleeper'
import { buildModel, player, roster } from '../../test/fixtures'
import { bidHistory, bidStats, MARGINAL_GAIN, percentile, suggestBid } from './bids'
import { buildDepthIndex, depthInfo, formTrend, trendingInfo } from './signals'
import { analyzeWaivers, type HorizonWeek } from './waivers'
import type { GameLog } from './history'

const game = (week: number, pts: number): GameLog => ({ week, pts, snapShare: null, opponent: null, team: null })

/* ---------------- FAAB ---------------- */

describe('percentile and bidStats', () => {
  it('interpolates linearly', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3.25)
    expect(percentile([1, 2, 3, 4], 0)).toBe(1)
    expect(percentile([1, 2, 3, 4], 1)).toBe(4)
    expect(percentile([7], 0.9)).toBe(7)
    expect(percentile([], 0.5)).toBeNaN()
  })
  it('summarizes winning bids, null when empty', () => {
    expect(bidStats([20, 5, 15, 10])).toEqual({ n: 4, median: 12.5, p75: 16.25, max: 20 })
    expect(bidStats([])).toBeNull()
  })
})

describe('bidHistory', () => {
  const pos: Record<string, string> = { a: 'RB', b: 'RB', c: 'WR', d: 'WR' }
  const tx = (over: Partial<SleeperTransaction>): SleeperTransaction => ({
    type: 'waiver', status: 'complete', adds: { a: 1 }, settings: { waiver_bid: 10 }, ...over,
  })
  it('counts only completed waiver claims with a numeric bid', () => {
    const h = bidHistory(
      [
        tx({ adds: { a: 1 }, settings: { waiver_bid: 10 } }),
        tx({ adds: { b: 2 }, settings: { waiver_bid: 20 } }),
        tx({ adds: { c: 3 }, settings: { waiver_bid: 4 } }),
        tx({ type: 'trade' }),
        tx({ type: 'free_agent' }),
        tx({ status: 'failed', settings: { waiver_bid: 99 } }),
        tx({ settings: null }),
        tx({ settings: { waiver_bid: -5 } }),
        tx({ settings: { waiver_bid: Number.NaN } }),
        tx({ adds: null }),
      ],
      (id) => pos[id],
    )
    expect(h.all).toMatchObject({ n: 3, max: 20 })
    expect(h.byPos.get('RB')).toMatchObject({ n: 2, median: 15 })
    expect(h.byPos.get('WR')).toMatchObject({ n: 1, median: 4 })
  })
  it('counts each add in a multi-add claim', () => {
    const h = bidHistory([tx({ adds: { a: 1, c: 1 }, settings: { waiver_bid: 8 } })], (id) => pos[id])
    expect(h.all!.n).toBe(2)
  })
})

describe('suggestBid', () => {
  const rb = bidStats([5, 10, 15, 20])! // median 12.5, p75 16.25, max 20
  const history = { all: rb, byPos: new Map([['RB', rb]]) }

  it('is null with no budget left', () => {
    expect(suggestBid({ left: 0, gainPerWeek: 5, pos: 'RB', history })).toBeNull()
  })
  it('suggests a minimum bid for a marginal upgrade', () => {
    const s = suggestBid({ left: 50, gainPerWeek: MARGINAL_GAIN - 0.1, pos: 'RB', history })!
    expect(s).toMatchObject({ suggested: 1, low: 0, high: 1, basis: 'marginal' })
    expect(suggestBid({ left: 0.4, gainPerWeek: 0.5, pos: 'RB', history: null })).toBeNull() // under $1: nothing to bid
    expect(suggestBid({ left: 1.9, gainPerWeek: 5, pos: 'RB', history: null })!.high).toBeLessThanOrEqual(1) // whole dollars only
  })
  it('uses a median-to-75th-percentile band for a solid add, higher in it for a bigger upgrade', () => {
    const s = suggestBid({ left: 100, gainPerWeek: 3, pos: 'RB', history })!
    // band 12.5..16.25; t = (3 - 1.5) / (4 - 1.5) = 0.6 -> 12.5 + 0.6 * 3.75 = 14.75
    expect(s).toMatchObject({ basis: 'league-history', sample: 4, suggested: 15, low: 13, high: 16 })
    expect(s.explanation).toMatch(/4 winning bids for RBs/)
  })
  it('uses a 75th-percentile-to-max band for a priority add', () => {
    const s = suggestBid({ left: 100, gainPerWeek: 5, pos: 'RB', history })!
    // band 16.25..20; t = (5 - 4) / 6 -> 16.25 + 3.75 / 6 = 16.875
    expect(s).toMatchObject({ suggested: 17, low: 16, high: 20 })
  })
  it('scales the suggestion with the size of the upgrade, edge to edge, never decreasing', () => {
    const at = (g: number) => suggestBid({ left: 100, gainPerWeek: g, pos: 'RB', history })!.suggested
    expect(at(1.5)).toBe(13) // bottom of the solid band: the median
    expect(at(4)).toBe(16) // top of the solid band = bottom of the priority band: the 75th percentile
    expect(at(10)).toBe(20) // the max
    expect(at(30)).toBe(20) // never beyond the max
    const series = [1.5, 2, 3, 3.9, 4, 5, 7, 9, 10, 14].map(at)
    expect(series).toEqual([...series].sort((a, b) => a - b))
    expect(new Set(series).size).toBeGreaterThan(3) // genuinely discriminating
  })
  it('never suggests more than the remaining budget', () => {
    const s = suggestBid({ left: 10, gainPerWeek: 5, pos: 'RB', history })!
    expect(s.low).toBeLessThanOrEqual(10)
    expect(s.high).toBeLessThanOrEqual(10)
  })
  it('falls back to all positions when a position has too few bids', () => {
    const h = { all: rb, byPos: new Map([['TE', bidStats([30])!]]) }
    const s = suggestBid({ left: 100, gainPerWeek: 3, pos: 'TE', history: h })!
    expect(s.basis).toBe('league-history')
    expect(s.explanation).toMatch(/winning bids for players/)
  })
  it('uses a labeled rule of thumb when there is too little history', () => {
    const thin = { all: bidStats([5, 6])!, byPos: new Map() }
    for (const h of [null, thin]) {
      const s = suggestBid({ left: 100, gainPerWeek: 4, pos: 'RB', history: h })!
      expect(s).toMatchObject({ basis: 'rule-of-thumb', suggested: 20, low: 10, high: 30, sample: 0 })
      expect(s.explanation).toMatch(/rule of thumb/)
    }
  })
  it('keeps the rule of thumb within 2%–25% of the budget', () => {
    expect(suggestBid({ left: 100, gainPerWeek: 40, pos: 'RB', history: null })!.suggested).toBe(25)
    expect(suggestBid({ left: 100, gainPerWeek: 1.6, pos: 'RB', history: null })!.suggested).toBe(8)
  })
})

/* ---------------- signals ---------------- */

describe('formTrend', () => {
  it('compares the last 3 games with the season', () => {
    expect(formTrend([5, 5, 5, 10, 10, 10].map((p, i) => game(i + 1, p)))).toMatchObject({ label: 'rising', recent: 10, season: 7.5 })
    expect(formTrend([10, 10, 10, 5, 5, 5].map((p, i) => game(i + 1, p)))!.label).toBe('falling')
    expect(formTrend([8, 8, 9, 8].map((p, i) => game(i + 1, p)))!.label).toBe('steady')
  })
  it('needs enough games', () => {
    expect(formTrend([1, 2, 3].map((p, i) => game(i + 1, p)))).toBeNull()
    expect(formTrend(undefined)).toBeNull()
  })
})

describe('depth chart signals', () => {
  const players = {
    rb1: player('rb1', 'RB', { depth_chart_position: 'RB', depth_chart_order: 1, injury_status: 'Out', first_name: 'Star', last_name: 'Back' }),
    rb2: player('rb2', 'RB', { depth_chart_position: 'RB', depth_chart_order: 2 }),
    rb3: player('rb3', 'RB', { depth_chart_position: 'RB', depth_chart_order: 3 }),
    wr1: player('wr1', 'WR', { depth_chart_position: 'LWR', depth_chart_order: 1 }),
    rbOther: player('rbOther', 'RB', { team: 'ZZZ', depth_chart_position: 'RB', depth_chart_order: 1 }),
  }
  const idx = buildDepthIndex(players)
  const nameOf = (id: string) => id

  it('finds who is ahead and whether the next man is up', () => {
    expect(depthInfo(players, idx, 'rb2', nameOf)).toMatchObject({ order: 2, nextManUp: true, ahead: [{ id: 'rb1', injury: 'Out' }] })
    expect(depthInfo(players, idx, 'rb3', nameOf)!.ahead.map((a) => a.id)).toEqual(['rb1', 'rb2'])
    expect(depthInfo(players, idx, 'rb1', nameOf)).toMatchObject({ order: 1, ahead: [], nextManUp: false })
  })
  it('only compares teammates at the same position', () => {
    expect(depthInfo(players, idx, 'rbOther', nameOf)!.ahead).toEqual([])
  })
  it('ignores WR depth (split by alignment) and unknown players', () => {
    expect(depthInfo(players, idx, 'wr1', nameOf)).toBeNull()
    expect(depthInfo(players, idx, 'nobody', nameOf)).toBeNull()
  })
})

describe('trendingInfo', () => {
  const list = [{ player_id: 'a', count: 100 }, { player_id: 'b', count: 900 }, { player_id: 'c', count: 500 }]
  it('ranks by count', () => {
    expect(trendingInfo(list, 'b')).toEqual({ rank: 1, count: 900 })
    expect(trendingInfo(list, 'a')).toEqual({ rank: 3, count: 100 })
    expect(trendingInfo(list, 'zz')).toBeNull()
    expect(trendingInfo(null, 'a')).toBeNull()
  })
})

/* ---------------- add/drop evaluation ---------------- */

const hz = (week: number, entries: Record<string, number>): HorizonWeek => ({
  week,
  proj: new Map(Object.entries(entries).map(([id, pts]) => [id, { pts }])),
})
const same = (entries: Record<string, number>): HorizonWeek[] => [hz(5, entries), hz(6, entries), hz(7, entries)]
const league = (positions: string[]) => ({ roster_positions: positions, settings: {} }) as unknown as SleeperLeague

function setup(opts: {
  mine: string[]
  players: Record<string, ReturnType<typeof player>>
  slots: string[]
  positions: string[]
  horizon: HorizonWeek[]
  extra?: Record<string, unknown>
}) {
  const model = buildModel({
    players: opts.players,
    rosters: [{ ...roster(1, 'u1', opts.mine), ...opts.extra }, roster(2, 'u2', [])],
    startSlots: opts.slots,
    proj: {},
  })
  return { model, league: league(opts.positions), horizon: opts.horizon }
}
const run = (s: ReturnType<typeof setup>, over: Partial<Parameters<typeof analyzeWaivers>[0]> = {}) =>
  analyzeWaivers({ ...s, weeks: [], schedule: null, trending: null, provider: 'testco', ...over })
const find = (r: ReturnType<typeof analyzeWaivers>, id: string) => r.candidates.find((c) => c.id === id)!

describe('analyzeWaivers: open roster spot', () => {
  const s = setup({
    mine: ['rb1', 'wr1'],
    players: { rb1: player('rb1', 'RB'), wr1: player('wr1', 'WR'), fa1: player('fa1', 'RB', { team: 'BBB' }), fa2: player('fa2', 'RB', { team: 'BBB' }) },
    slots: ['RB', 'WR'],
    positions: ['RB', 'WR', 'BN', 'BN', 'BN'],
    horizon: same({ rb1: 8, wr1: 10, fa1: 12, fa2: 8.5 }),
  })
  const r = run(s)

  it('values an add by the change in your best lineup over the horizon', () => {
    const c = find(r, 'fa1')
    expect(c.net).toBeCloseTo(12) // +4 a week for 3 weeks
    expect(c.perWeek).toEqual([4, 4, 4])
    expect(c.gainPerWeek).toBeCloseTo(4)
    expect(c).toMatchObject({ kind: 'upgrade', tier: 'must', drop: null })
    expect(c.reasons[0]).toMatch(/Adds \+12\.0 projected points over the next 3 weeks \(\+4\.0 this week\)/)
    expect(c.reasons[1]).toMatch(/open roster spot/)
    expect(c.evidence[0].source).toBe('Sleeper projections (testco)')
  })
  it('does not call a sub-1-point-per-week gain an upgrade', () => {
    const c = find(r, 'fa2')
    expect(c.gainPerWeek).toBeCloseTo(0.5)
    expect(c.kind).toBe('none')
    expect(c.tier).toBeNull()
  })
  it('ranks upgrades first, best net gain first', () => {
    expect(r.candidates.map((c) => c.id)).toEqual(['fa1', 'fa2'])
    expect(r).toMatchObject({ rosterFull: false, rosterCount: 2, rosterLimit: 5, missingWeeks: [], activeWeeks: 3 })
  })
})

describe('analyzeWaivers: full roster, picking the drop', () => {
  const players = {
    rb1: player('rb1', 'RB'), wr1: player('wr1', 'WR'), bench: player('bench', 'RB'),
    fa1: player('fa1', 'RB', { team: 'BBB' }),
  }
  const base = { players, slots: ['RB', 'WR'], positions: ['RB', 'WR', 'BN'], horizon: same({ rb1: 8, wr1: 10, bench: 1, fa1: 12 }) }

  it('drops the player whose loss costs the lineup least (lowest hold value on ties)', () => {
    const r = run(setup({ ...base, mine: ['rb1', 'wr1', 'bench'] }))
    const c = find(r, 'fa1')
    expect(r.rosterFull).toBe(true)
    // dropping bench or rb1 both leave +4/wk; bench holds less value over the horizon
    expect(c.drop).toMatchObject({ id: 'bench', pos: 'RB' })
    expect(c.net).toBeCloseTo(12)
    expect(c.reasons[1]).toMatch(/Best drop: .*\(RB\)/)
  })
  it('never drops a designated keeper', () => {
    const r = run(setup({ ...base, mine: ['rb1', 'wr1', 'bench'], extra: { keepers: ['bench'] } }))
    expect(find(r, 'fa1').drop!.id).toBe('rb1')
  })
  it('does not count IR players against the roster limit or in the lineup', () => {
    const r = run(setup({ ...base, mine: ['rb1', 'wr1', 'bench'], positions: ['RB', 'WR', 'BN', 'IR'], extra: { reserve: ['bench'] } }))
    expect(r.rosterCount).toBe(2) // bench is on IR
    expect(r.rosterLimit).toBe(3) // IR slots are not counted
    expect(r.rosterFull).toBe(false)
    expect(find(r, 'fa1').drop).toBeNull()
  })
  it('skips candidates when the roster is full and nobody can be dropped', () => {
    const r = run(setup({ ...base, mine: ['rb1', 'wr1', 'bench'], extra: { keepers: ['rb1', 'wr1', 'bench'] } }))
    expect(r.candidates).toEqual([])
  })
})

describe('analyzeWaivers: locks, injuries and schedule', () => {
  const mk = (extraPlayers = {}, schedule: ScheduleLike | null = null, mine = ['rb1', 'bench']) => {
    const s = setup({
      mine,
      players: { rb1: player('rb1', 'RB'), bench: player('bench', 'RB'), fa1: player('fa1', 'RB', { team: 'BBB' }), ...extraPlayers },
      slots: ['RB'],
      positions: ['RB', 'BN'],
      horizon: same({ rb1: 8, bench: 2, fa1: 12 }),
    })
    return run(s, { schedule })
  }
  type ScheduleLike = Parameters<typeof analyzeWaivers>[0]['schedule']
  const games = (...g: [number, string, string, string][]) => g.map(([week, home, away, status], i) => ({ game_id: String(i), week, status, date: '', home, away }))

  it('excludes this week from the gain when the added player\'s game has already started', () => {
    const r = mk({}, games([5, 'BBB', 'CCC', 'complete'], [6, 'BBB', 'CCC', 'pre_game'], [7, 'BBB', 'CCC', 'pre_game'], [5, 'AAA', 'DDD', 'pre_game'], [6, 'AAA', 'DDD', 'pre_game'], [7, 'AAA', 'DDD', 'pre_game']))
    expect(find(r, 'fa1').perWeek).toEqual([0, 4, 4])
  })
  it('never drops a player whose game has started', () => {
    // roster full (limit 2): rb1 and bench both on AAA; AAA game started, so neither can be dropped
    const r = mk({}, games([5, 'AAA', 'DDD', 'complete'], [6, 'AAA', 'DDD', 'pre_game'], [5, 'BBB', 'CCC', 'pre_game']))
    expect(r.candidates).toEqual([])
  })
  it('counts no points in a bye week, even if a projection says otherwise (the schedule is authoritative)', () => {
    // fa1 (BBB) has no game in week 6; rb1/bench (AAA) play every week
    const r = mk({}, games([5, 'BBB', 'CCC', 'pre_game'], [6, 'EEE', 'DDD', 'pre_game'], [7, 'BBB', 'CCC', 'pre_game'], [5, 'AAA', 'ZZZ', 'pre_game'], [6, 'AAA', 'ZZZ', 'pre_game'], [7, 'AAA', 'ZZZ', 'pre_game']))
    expect(find(r, 'fa1').perWeek).toEqual([4, 0, 4])
  })
  it('also zeroes your own players on a bye, which makes an add worth more that week', () => {
    // rb1 (AAA) is on a bye in week 6; bench (also AAA) too: only fa1 can play, so adding him is worth 12 - 0
    const r = mk({ bench: player('bench', 'RB', { team: 'DDD' }) }, games([5, 'AAA', 'ZZZ', 'pre_game'], [5, 'BBB', 'CCC', 'pre_game'], [5, 'DDD', 'YYY', 'pre_game'], [6, 'BBB', 'CCC', 'pre_game'], [6, 'DDD', 'YYY', 'pre_game'], [6, 'EEE', 'FFF', 'pre_game'], [7, 'AAA', 'ZZZ', 'pre_game'], [7, 'BBB', 'CCC', 'pre_game'], [7, 'DDD', 'YYY', 'pre_game']))
    // week 6: rb1 on bye (0), bench plays (2): base 2, with fa1 12 -> +10
    expect(find(r, 'fa1').perWeek).toEqual([4, 10, 4])
  })
  it('counts an Out player for future weeks but not this week', () => {
    const r = mk({ fa1: player('fa1', 'RB', { team: 'BBB', injury_status: 'Out' }) })
    expect(find(r, 'fa1').perWeek).toEqual([0, 4, 4])
    expect(find(r, 'fa1').signals).toContain('Out')
  })
  it('counts an IR player for no week', () => {
    const r = mk({ fa1: player('fa1', 'RB', { team: 'BBB', injury_status: 'IR' }) })
    expect(find(r, 'fa1')).toMatchObject({ net: 0, kind: 'none' })
  })
  it('flags a bye inside the horizon and lists upcoming opponents', () => {
    const r = mk({}, games([5, 'BBB', 'CCC', 'pre_game'], [6, 'EEE', 'DDD', 'pre_game'], [7, 'BBB', 'CCC', 'pre_game'], [5, 'AAA', 'ZZZ', 'pre_game']))
    const c = find(r, 'fa1')
    expect(c.opponents.map((o) => [o.week, o.opponent, o.bye])).toEqual([[5, 'CCC', false], [6, null, true], [7, 'CCC', false]])
    expect(c.signals).toContain('Bye wk 6')
    expect(c.reasons.join(' ')).toMatch(/bye in week 6/)
  })
})

describe('analyzeWaivers: speculative stashes and signals', () => {
  const s = setup({
    mine: ['rb1', 'bench'],
    players: {
      rb1: player('rb1', 'RB'),
      bench: player('bench', 'RB'),
      // backup RB on team BBB whose starter is Out: next man up, and trending, but he barely projects
      starterOut: player('starterOut', 'RB', { team: 'BBB', injury_status: 'Out', depth_chart_position: 'RB', depth_chart_order: 1, first_name: 'Hurt', last_name: 'Starter' }),
      handcuff: player('handcuff', 'RB', { team: 'BBB', depth_chart_position: 'RB', depth_chart_order: 2 }),
      plain: player('plain', 'RB', { team: 'CCC' }),
    },
    slots: ['RB'],
    positions: ['RB', 'BN'],
    horizon: same({ rb1: 8, bench: 2, handcuff: 5, plain: 4, starterOut: 0 }),
  })
  const r = run(s, { trending: [{ player_id: 'handcuff', count: 5000 }] })

  it('shows a low-projection player with 2+ positive signals as a speculative stash', () => {
    const c = find(r, 'handcuff')
    expect(c.kind).toBe('speculative')
    expect(c.positives).toBe(2)
    expect(c.signals).toEqual(expect.arrayContaining(['Next man up', 'Trending #1']))
    expect(c.reasons.join(' ')).toMatch(/Next in line at RB: .*\(Out\) is ahead of him/)
    expect(c.reasons.join(' ')).toMatch(/Popularity is not value/)
    expect(c.evidence.map((e) => e.label)).toEqual(expect.arrayContaining(['Depth chart', 'Sleeper-wide adds (24h)']))
  })
  it('does not stash a player with fewer signals', () => {
    expect(find(r, 'plain').kind).toBe('none')
  })
  it('lists speculative stashes after upgrades', () => {
    const kinds = r.candidates.map((c) => c.kind)
    expect(kinds.indexOf('speculative')).toBeGreaterThanOrEqual(kinds.lastIndexOf('upgrade'))
  })
})

describe('analyzeWaivers: needs and data gaps', () => {
  it('reports unfillable slots and upcoming byes of starters', () => {
    const s = setup({
      mine: ['rb1'],
      players: { rb1: player('rb1', 'RB') },
      slots: ['RB', 'WR'],
      positions: ['RB', 'WR', 'BN'],
      horizon: same({ rb1: 8 }),
    })
    const schedule = [
      { game_id: '1', week: 5, status: 'pre_game', date: '', home: 'AAA', away: 'CCC' },
      { game_id: '2', week: 6, status: 'pre_game', date: '', home: 'DDD', away: 'CCC' }, // AAA on bye in week 6
      { game_id: '3', week: 7, status: 'pre_game', date: '', home: 'AAA', away: 'CCC' },
    ]
    const r = run(s, { schedule })
    expect(r.needs).toEqual([
      { kind: 'empty', text: 'No healthy WR available for week 5.' },
      { kind: 'bye-soon', text: 'r. Player (RB) is on a bye in week 6.' },
    ])
  })
  it('reports weeks without published projections and averages over the rest', () => {
    const s = setup({
      mine: ['rb1'],
      players: { rb1: player('rb1', 'RB'), fa1: player('fa1', 'RB', { team: 'BBB' }) },
      slots: ['RB'],
      positions: ['RB', 'BN', 'BN'],
      horizon: [hz(5, { rb1: 8, fa1: 12 }), hz(6, { rb1: 8, fa1: 12 }), hz(7, {})],
    })
    const r = run(s)
    expect(r.missingWeeks).toEqual([7])
    expect(r.activeWeeks).toBe(2)
    expect(find(r, 'fa1')).toMatchObject({ net: 8, gainPerWeek: 4 }) // 8 over 2 weeks, not 3
  })
  it('works with no history or schedule, with unknown ranges', () => {
    const s = setup({
      mine: ['rb1'],
      players: { rb1: player('rb1', 'RB'), fa1: player('fa1', 'RB', { team: 'BBB' }) },
      slots: ['RB'],
      positions: ['RB', 'BN'],
      horizon: same({ rb1: 8, fa1: 12 }),
    })
    const c = find(run(s), 'fa1')
    expect(c).toMatchObject({ sd: null, floor: null, ceiling: null, usage: null, form: null })
    expect(c.confidence.level).toBe('low') // no game sample: the rubric says so
  })
})

describe('analyzeWaivers: invariants (seeded property test)', () => {
  it('an add with an open roster spot never lowers your lineup, and a drop never beats the best option', () => {
    let seed = 4242
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const poss = ['QB', 'RB', 'WR', 'TE']
    for (let trial = 0; trial < 30; trial++) {
      const ids = Array.from({ length: 8 }, (_, i) => `p${i}`)
      const players = Object.fromEntries(ids.map((id, i) => [id, player(id, poss[i % 4], { team: 'BBB' })]))
      const proj = Object.fromEntries(ids.map((id) => [id, Math.round(rnd() * 200) / 10]))
      const mine = ids.slice(0, 5)
      const s = setup({ mine, players, slots: ['QB', 'RB', 'WR', 'FLEX'], positions: ['QB', 'RB', 'WR', 'FLEX', 'BN', 'BN', 'BN'], horizon: same(proj) })
      for (const c of run(s).candidates) {
        expect(c.drop).toBeNull() // 5 of 7 spots used: open spot
        expect(c.net).toBeGreaterThanOrEqual(-1e-9)
      }
    }
  })
})
