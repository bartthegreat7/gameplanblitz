import type { GameSide, WeekGames } from './league'

/*
 * Expected Wins & Luck Index, from completed regular-season scores only.
 *
 *   all-play       each week, a team's score against every other team's score that week
 *   expected wins  sum over weeks of that week's all-play share: (wins + ties / 2) / (teams - 1),
 *                  i.e. the wins a team would expect against a random opponent each week
 *   luck           actual wins (ties = half) minus expected wins
 *   median game    leagues that also play the league median (Sleeper's league_average_match) get one
 *                  extra result a week: above the median = win, below = loss, equal = tie. It is the same
 *                  in "actual" and "expected" (it depends only on the score), so it never changes luck.
 *   schedule luck  each team's record had it played every other team's schedule (a game against
 *                  itself becomes a game against that schedule's owner)
 *   SOS            average opponent score minus the league's average weekly score (positive = tougher)
 */

export interface LuckOptions {
  /** the league also plays the weekly median */
  medianGame: boolean
}

export interface WeekLuck {
  week: number
  points: number
  oppPoints: number | null
  result: 'W' | 'L' | 'T' | null
  /** this week's all-play wins (ties half) and how many teams it was against */
  allPlayWins: number
  allPlayOf: number
  median: 'W' | 'L' | 'T' | null
  /** won with a below-half all-play score, or lost with an above-half one */
  tag: 'lucky-win' | 'unlucky-loss' | null
}

export interface TeamLuck {
  rosterId: number
  games: number
  /** head-to-head record (plus median games when the league plays them) */
  w: number
  l: number
  t: number
  allPlay: { w: number; l: number; t: number }
  allPlayPct: number
  expectedWins: number
  /** actual wins (ties half) minus expected wins */
  luck: number
  pf: number
  pa: number
  /** average opponent score minus the league average score, per game */
  sos: number
  /** standard deviation of weekly scores */
  sd: number
  /** the best and worst head-to-head win totals across every team's schedule (ties half) */
  scheduleBest: { wins: number; with: number }
  scheduleWorst: { wins: number; with: number }
  weeks: WeekLuck[]
}

export interface LuckReport {
  weeks: number
  leagueAvg: number
  teams: TeamLuck[]
  /** swap[a][b] = team a's head-to-head wins (ties half) with team b's schedule */
  swap: Map<number, Map<number, number>>
}

const sides = (wk: WeekGames): GameSide[] => wk.games.flatMap((g) => (g.b ? [g.a, g.b] : [g.a]))

/** Each team's opponent that week (absent when it had none). */
function opponents(wk: WeekGames): Map<number, number> {
  const out = new Map<number, number>()
  for (const g of wk.games)
    if (g.b) {
      out.set(g.a.rosterId, g.b.rosterId)
      out.set(g.b.rosterId, g.a.rosterId)
    }
  return out
}

const res = (a: number, b: number): 'W' | 'L' | 'T' => (a > b ? 'W' : a < b ? 'L' : 'T')
const winValue = (r: 'W' | 'L' | 'T') => (r === 'W' ? 1 : r === 'T' ? 0.5 : 0)

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function luckReport(weeks: WeekGames[], opts: LuckOptions = { medianGame: false }): LuckReport {
  const played = weeks.filter((wk) => sides(wk).some((s) => s.points > 0))
  const all = played.flatMap((wk) => sides(wk).map((s) => s.points))
  const leagueAvg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0
  const ids = [...new Set(played.flatMap((wk) => sides(wk).map((s) => s.rosterId)))].sort((a, b) => a - b)

  const teams = new Map<number, TeamLuck>(
    ids.map((id) => [
      id,
      {
        rosterId: id,
        games: 0,
        w: 0,
        l: 0,
        t: 0,
        allPlay: { w: 0, l: 0, t: 0 },
        allPlayPct: 0,
        expectedWins: 0,
        luck: 0,
        pf: 0,
        pa: 0,
        sos: 0,
        sd: 0,
        scheduleBest: { wins: 0, with: id },
        scheduleWorst: { wins: 0, with: id },
        weeks: [],
      },
    ]),
  )
  const oppTotal = new Map<number, { sum: number; n: number }>()

  for (const wk of played) {
    const ss = sides(wk)
    const score = new Map(ss.map((s) => [s.rosterId, s.points]))
    const opp = opponents(wk)
    const median = opts.medianGame && ss.length > 1 ? medianOf(ss.map((s) => s.points)) : null
    for (const s of ss) {
      const t = teams.get(s.rosterId)!
      let apW = 0
      let apT = 0
      for (const o of ss) {
        if (o.rosterId === s.rosterId) continue
        if (s.points > o.points) apW++
        else if (s.points === o.points) apT++
      }
      const of = ss.length - 1
      t.allPlay.w += apW
      t.allPlay.t += apT
      t.allPlay.l += of - apW - apT
      const share = of ? (apW + apT / 2) / of : 0
      t.expectedWins += share
      t.pf += s.points
      const oid = opp.get(s.rosterId)
      const op = oid !== undefined ? score.get(oid)! : null
      const result = op !== null ? res(s.points, op) : null
      if (result) {
        t.games++
        t[result === 'W' ? 'w' : result === 'L' ? 'l' : 't']++
        t.pa += op!
        const o = oppTotal.get(s.rosterId) ?? { sum: 0, n: 0 }
        oppTotal.set(s.rosterId, { sum: o.sum + op!, n: o.n + 1 })
      }
      const med = median !== null ? res(s.points, median) : null
      if (med) {
        t[med === 'W' ? 'w' : med === 'L' ? 'l' : 't']++
        t.expectedWins += winValue(med) // the median game is decided by the score alone
      }
      const tag = result === 'W' && share < 0.5 ? 'lucky-win' : result === 'L' && share > 0.5 ? 'unlucky-loss' : null
      t.weeks.push({ week: wk.week, points: s.points, oppPoints: op, result, allPlayWins: apW + apT / 2, allPlayOf: of, median: med, tag })
    }
  }

  // schedule swaps: team a playing team b's opponents
  const swap = new Map<number, Map<number, number>>()
  for (const a of ids) {
    const row = new Map<number, number>()
    for (const b of ids) {
      let wins = 0
      for (const wk of played) {
        const score = new Map(sides(wk).map((s) => [s.rosterId, s.points]))
        const mine = score.get(a)
        const bOpp = opponents(wk).get(b)
        if (mine === undefined || bOpp === undefined) continue
        const vs = bOpp === a ? b : bOpp
        wins += winValue(res(mine, score.get(vs)!))
      }
      row.set(b, wins)
    }
    swap.set(a, row)
  }

  for (const t of teams.values()) {
    const ws = t.weeks.map((x) => x.points)
    const mean = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : 0
    t.sd = ws.length > 1 ? Math.sqrt(ws.reduce((a, x) => a + (x - mean) ** 2, 0) / (ws.length - 1)) : 0
    const ap = t.allPlay.w + t.allPlay.l + t.allPlay.t
    t.allPlayPct = ap ? (t.allPlay.w + t.allPlay.t / 2) / ap : 0
    t.luck = t.w + t.t / 2 - t.expectedWins
    const o = oppTotal.get(t.rosterId)
    t.sos = o && o.n ? o.sum / o.n - leagueAvg : 0
    const row = [...swap.get(t.rosterId)!]
    const best = row.reduce((x, y) => (y[1] > x[1] ? y : x))
    const worst = row.reduce((x, y) => (y[1] < x[1] ? y : x))
    t.scheduleBest = { wins: best[1], with: best[0] }
    t.scheduleWorst = { wins: worst[1], with: worst[0] }
  }

  return { weeks: played.length, leagueAvg, teams: [...teams.values()].sort((a, b) => b.luck - a.luck), swap }
}
