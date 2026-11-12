import { buildModel, player, roster } from '../../test/fixtures'
import type { SleeperMatchup } from '../sleeper'
import { gameState, IDLE_POLL_MS, isLive, KICKOFF_SPREAD, lineupAlerts, LIVE_POLL_MS, liveSide, liveWinProbability, pollInterval, remainingFor, type LiveSide } from './gameday'
import { weekContext } from './schedule'

const games = (statuses: Record<string, string>) =>
  Object.entries(statuses).map(([team, status], i) => ({ game_id: String(i), week: 5, status, date: '', home: team, away: `X${i}` }))
const ctxOf = (statuses: Record<string, string>, extra: { week: number; home: string; away: string }[] = []) =>
  weekContext([...games(statuses), ...extra.map((e, i) => ({ game_id: `e${i}`, status: 'pre_game', date: '', ...e }))], 5)

describe('gameState', () => {
  const ctx = ctxOf({ AAA: 'pre_game', BBB: 'complete', CCC: 'in_progress' }, [{ week: 6, home: 'BYE', away: 'ZZZ' }])
  it('reads the schedule, trusting scored points over a lagging pre_game status', () => {
    expect(gameState(ctx, 'AAA', 0)).toBe('not-started')
    expect(gameState(ctx, 'AAA', 4.5)).toBe('in-progress')
    expect(gameState(ctx, 'BBB', 10)).toBe('final')
    expect(gameState(ctx, 'CCC', 0)).toBe('in-progress')
    expect(gameState(ctx, 'BYE', 0)).toBe('bye')
  })
  it('falls back to points when the schedule is unknown', () => {
    expect(gameState(null, 'AAA', 0)).toBe('unknown')
    expect(gameState(null, 'AAA', 3)).toBe('in-progress')
  })
})

describe('remainingFor', () => {
  it('counts the full projection before kickoff, the rest during the game, nothing after', () => {
    expect(remainingFor('not-started', 12, 0, '')).toBe(12)
    expect(remainingFor('in-progress', 12, 5, '')).toBe(7)
    expect(remainingFor('in-progress', 12, 15, '')).toBe(0) // already beat his projection
    expect(remainingFor('final', 12, 3, '')).toBe(0)
    expect(remainingFor('bye', 12, 0, '')).toBe(0)
    expect(remainingFor('not-started', 12, 0, 'Out')).toBe(0)
  })
})

/* Me: RB a (AAA, in progress: 5 of 12), WR b (BBB, final: 9). Bench: RB c (DDD, not started, 15). */
const m = buildModel({
  players: { a: player('a', 'RB'), b: player('b', 'WR', { team: 'BBB' }), c: player('c', 'RB', { team: 'DDD' }), x: player('x', 'RB', { team: 'EEE' }), y: player('y', 'WR', { team: 'EEE' }) },
  rosters: [roster(1, 'u1', ['a', 'b', 'c']), roster(2, 'u2', ['x', 'y'])],
  startSlots: ['RB', 'WR'],
  proj: { a: 12, b: 10, c: 15, x: 11, y: 9 },
})
const ctx = ctxOf({ AAA: 'in_progress', BBB: 'complete', DDD: 'pre_game', EEE: 'pre_game' })
const mine: SleeperMatchup = { roster_id: 1, matchup_id: 1, points: 14, starters: ['a', 'b'], players: ['a', 'b', 'c'], players_points: { a: 5, b: 9 } }
const theirs: SleeperMatchup = { roster_id: 2, matchup_id: 1, points: 0, starters: ['x', 'y'], players: ['x', 'y'], players_points: {} }

describe('liveSide', () => {
  const s = liveSide(m, mine, ctx)
  it('combines live points (fact) with projected remaining points (model)', () => {
    expect(s.points).toBe(14)
    expect(s.players.map((p) => [p.id, p.state, p.points, p.remaining])).toEqual([['a', 'in-progress', 5, 7], ['b', 'final', 9, 0]])
    expect(s.remaining).toBe(7)
    expect(s.projectedFinal).toBe(21)
    expect(s.totalProj).toBe(22)
  })
  it('shows an empty slot as empty', () => {
    const e = liveSide(m, { ...mine, starters: ['a', '0'] }, ctx)
    expect(e.players[1]).toMatchObject({ name: 'Empty', id: '' })
  })
})

describe('liveWinProbability', () => {
  const side = (projectedFinal: number, remaining: number, totalProj: number): LiveSide => ({ rosterId: 1, name: '', points: projectedFinal - remaining, projectedFinal, remaining, totalProj, players: [] })
  it('equals the standard kickoff model when nothing has been played', () => {
    expect(liveWinProbability(side(110, 110, 110), side(100, 100, 100))).toBe(Math.round(100 / (1 + Math.exp(-10 / KICKOFF_SPREAD))))
  })
  it('gets more certain as the game plays out with the same margin', () => {
    const early = liveWinProbability(side(110, 100, 110), side(100, 95, 100))
    const late = liveWinProbability(side(110, 10, 110), side(100, 5, 100))
    expect(late).toBeGreaterThan(early)
  })
  it('is decided once every game is final', () => {
    expect(liveWinProbability(side(120, 0, 110), side(100, 0, 100))).toBe(100)
    expect(liveWinProbability(side(90, 0, 110), side(100, 0, 100))).toBe(0)
    expect(liveWinProbability(side(100, 0, 110), side(100, 0, 100))).toBe(50)
  })
})

describe('lineupAlerts', () => {
  it('suggests a bench player who has not played and projects higher than a starter who has not played', () => {
    // a (RB) is already in progress: no swap possible. Make a not-started to allow it.
    const notStarted = ctxOf({ AAA: 'pre_game', BBB: 'complete', DDD: 'pre_game' })
    const s = liveSide(m, { ...mine, players_points: { b: 9 } }, notStarted)
    const alerts = lineupAlerts(m, s, mine, notStarted)
    expect(alerts).toEqual([{ kind: 'swap', severity: 'medium', source: 'model', text: 'Consider starting c. Player (15.0 proj) over a. Player (12.0) at RB.' }])
  })
  it('never suggests moving a starter whose game has started', () => {
    const s = liveSide(m, mine, ctx)
    expect(lineupAlerts(m, s, mine, ctx)).toEqual([])
  })
  it('reports empty slots, byes and Out starters as facts', () => {
    const withIssues = buildModel({
      players: { a: player('a', 'RB', { injury_status: 'Out' }), b: player('b', 'WR', { team: 'BYE' }) },
      rosters: [roster(1, 'u1', ['a', 'b'])],
      startSlots: ['RB', 'WR', 'TE'],
      proj: { a: 12, b: 10 },
    })
    const c2 = ctxOf({ AAA: 'pre_game' }, [{ week: 6, home: 'BYE', away: 'Q' }])
    const mu: SleeperMatchup = { roster_id: 1, matchup_id: 1, points: 0, starters: ['a', 'b', '0'], players: ['a', 'b'] }
    const alerts = lineupAlerts(withIssues, liveSide(withIssues, mu, c2), mu, c2)
    expect(alerts.map((a) => [a.kind, a.source])).toEqual([['out', 'fact'], ['bye', 'fact'], ['empty', 'fact']])
  })
})

describe('isLive', () => {
  it('is live while any game is in progress', () => {
    expect(isLive([liveSide(m, mine, ctx)])).toBe(true)
    expect(isLive([liveSide(m, theirs, ctx)])).toBe(false)
  })
})

describe('pollInterval', () => {
  const g = (week: number, status: string) => ({ game_id: `${week}${status}`, week, status, date: '', home: 'A', away: 'B' })
  const scored = [{ roster_id: 1, matchup_id: 1, points: 12, starters: [], players: [] }]
  const none = [{ roster_id: 1, matchup_id: 1, points: 0, starters: [], players: [] }]
  it('polls every minute while a game is underway, else every 5 minutes', () => {
    expect(pollInterval(none, [g(5, 'pre_game')], 5)).toBe(IDLE_POLL_MS) // nothing started
    expect(pollInterval(scored, [g(5, 'pre_game'), g(5, 'pre_game')], 5)).toBe(LIVE_POLL_MS) // points scored: started
    expect(pollInterval(none, [g(5, 'complete'), g(5, 'pre_game')], 5)).toBe(LIVE_POLL_MS) // a game finished, another to come
    expect(pollInterval(scored, [g(5, 'complete')], 5)).toBe(IDLE_POLL_MS) // all final
    expect(pollInterval(scored, undefined, 5)).toBe(LIVE_POLL_MS) // no schedule: points decide
    expect(pollInterval(none, undefined, 5)).toBe(IDLE_POLL_MS)
  })
})
