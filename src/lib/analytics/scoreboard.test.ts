import { buildModel, player, roster } from '../../test/fixtures'
import type { SleeperMatchup } from '../sleeper'
import { recordsThrough, pairGames } from './league'
import { weekContext } from './schedule'
import { projectedRecords, scoreboard } from './scoreboard'

/* 4 teams, one starter each (RB). Teams AAA/BBB/CCC/DDD play in week 5. */
const m = buildModel({
  players: {
    a: player('a', 'RB', { team: 'AAA' }),
    b: player('b', 'RB', { team: 'BBB' }),
    c: player('c', 'RB', { team: 'CCC' }),
    d: player('d', 'RB', { team: 'DDD' }),
  },
  rosters: [roster(1, 'u1', ['a']), roster(2, 'u2', ['b']), roster(3, 'u3', ['c']), roster(4, 'u4', ['d'])],
  startSlots: ['RB'],
  proj: { a: 20, b: 10, c: 15, d: 14 },
})
const sched = (status: Record<string, string>) =>
  weekContext(
    [
      { game_id: '1', week: 5, status: status.AAA ?? 'pre_game', date: '', home: 'AAA', away: 'XXX' },
      { game_id: '2', week: 5, status: status.BBB ?? 'pre_game', date: '', home: 'BBB', away: 'YYY' },
      { game_id: '3', week: 5, status: status.CCC ?? 'pre_game', date: '', home: 'CCC', away: 'ZZZ' },
      { game_id: '4', week: 5, status: status.DDD ?? 'pre_game', date: '', home: 'DDD', away: 'WWW' },
    ],
    5,
  )
const row = (id: number, mid: number, starter: string, pts: number): SleeperMatchup => ({
  roster_id: id,
  matchup_id: mid,
  points: pts,
  starters: [starter],
  players: [starter],
  players_points: { [starter]: pts },
})

describe('league scoreboard', () => {
  it('covers every matchup once, with projected finals and win odds before kickoff', () => {
    const games = scoreboard(m, [row(1, 1, 'a', 0), row(2, 1, 'b', 0), row(3, 2, 'c', 0), row(4, 2, 'd', 0)], sched({}), false)
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({ status: 'scheduled', a: { projectedFinal: 20, playersLeft: 1 }, b: { projectedFinal: 10 }, upset: false })
    expect(games[0].aWinPct!).toBeGreaterThan(50)
    expect(games[1].close).toBe(true) // 15 vs 14 projected
  })

  it('goes live with points on the board and flags the underdog leading', () => {
    // b (projected 10) has 18 and is final; a (projected 20) is still to play
    const games = scoreboard(m, [row(1, 1, 'a', 0), row(2, 1, 'b', 18), row(3, 2, 'c', 0), row(4, 2, 'd', 0)], sched({ BBB: 'complete' }), false)
    expect(games[0].status).toBe('live')
    expect(games[0].b).toMatchObject({ points: 18, projectedFinal: 18, playersLeft: 0 })
    expect(games[0].a.projectedFinal).toBe(20)
    expect(games[0].upset).toBe(false) // the favorite still projects to win
  })

  it('is final when every starter has played, uses the score as the result and marks upsets', () => {
    const all = { AAA: 'complete', BBB: 'complete', CCC: 'complete', DDD: 'complete' }
    const games = scoreboard(m, [row(1, 1, 'a', 9), row(2, 1, 'b', 21.5), row(3, 2, 'c', 12), row(4, 2, 'd', 11)], sched(all), false)
    expect(games[0]).toMatchObject({ status: 'final', aWinPct: 0, upset: true, a: { projectedFinal: 9, playersLeft: 0 } })
    expect(games[1]).toMatchObject({ status: 'final', aWinPct: 100, upset: false })
    // a past week is final even if the schedule never marked it complete (and stat corrections just change the score)
    expect(scoreboard(m, [row(1, 1, 'a', 9.4), row(2, 1, 'b', 21.5)], sched({}), true)[0]).toMatchObject({ status: 'final', a: { points: 9.4 } })
  })

  it('projects the standings if games end as projected', () => {
    const base = recordsThrough([{ week: 4, games: pairGames([row(1, 1, 'a', 10), row(2, 1, 'b', 20)]) }], 4)
    const games = scoreboard(m, [row(1, 1, 'a', 0), row(2, 1, 'b', 0)], sched({}), false)
    const after = projectedRecords(base, games)
    expect(after.get(1)).toMatchObject({ w: 1, l: 1 })
    expect(after.get(2)).toMatchObject({ w: 1, l: 1 })
  })
})
