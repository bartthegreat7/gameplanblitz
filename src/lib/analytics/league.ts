import type { SleeperMatchup } from '../sleeper'

/*
 * League-wide results: every matchup paired, records rebuilt week by week from Sleeper's scores,
 * GamePlanBlitz power rankings, weekly awards and storylines. Everything here is computed from
 * Sleeper's matchup data (facts); power rankings and upsets that use projections say so.
 */

export interface GameSide {
  rosterId: number
  points: number
  starters: string[]
  playersPoints: Record<string, number>
}

export interface LeagueGame {
  matchupId: number
  a: GameSide
  /** null when the team has no opponent this week */
  b: GameSide | null
}

export interface WeekGames {
  week: number
  games: LeagueGame[]
}

const side = (m: SleeperMatchup): GameSide => ({
  rosterId: m.roster_id,
  points: m.points ?? 0,
  starters: (m.starters ?? []).filter((id) => id && id !== '0'),
  playersPoints: m.players_points ?? {},
})

/** Pairs a week's matchup rows into games (one per matchup id; unmatched teams get a solo game). */
export function pairGames(matchups: SleeperMatchup[]): LeagueGame[] {
  const byId = new Map<number, SleeperMatchup[]>()
  const solo: SleeperMatchup[] = []
  const seen = new Set<number>()
  for (const m of matchups) {
    if (seen.has(m.roster_id)) continue // duplicate rows never become duplicate games
    seen.add(m.roster_id)
    if (m.matchup_id === null || m.matchup_id === undefined) solo.push(m)
    else byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m])
  }
  const games: LeagueGame[] = [...byId].map(([matchupId, rows]) => {
    const [x, y] = [...rows].sort((p, q) => p.roster_id - q.roster_id)
    return { matchupId, a: side(x), b: y ? side(y) : null }
  })
  games.sort((g, h) => g.matchupId - h.matchupId)
  return [...games, ...solo.map((m, i) => ({ matchupId: -1 - i, a: side(m), b: null }))]
}

/** A finished game's winner and loser (null on a tie or a solo game). */
export function outcome(g: LeagueGame): { winner: GameSide; loser: GameSide; margin: number } | null {
  if (!g.b || g.a.points === g.b.points) return null
  const [winner, loser] = g.a.points > g.b.points ? [g.a, g.b] : [g.b, g.a]
  return { winner, loser, margin: winner.points - loser.points }
}

export interface TeamRecord {
  w: number
  l: number
  t: number
  pf: number
  pa: number
}

/** Head-to-head records through a week, rebuilt from each completed week's scores. */
export function recordsThrough(weeks: WeekGames[], through: number): Map<number, TeamRecord> {
  const r = new Map<number, TeamRecord>()
  const get = (id: number) => r.get(id) ?? (r.set(id, { w: 0, l: 0, t: 0, pf: 0, pa: 0 }), r.get(id)!)
  for (const wk of weeks) {
    if (wk.week > through) continue
    for (const g of wk.games) {
      const a = get(g.a.rosterId)
      a.pf += g.a.points
      if (!g.b) continue
      const b = get(g.b.rosterId)
      b.pf += g.b.points
      a.pa += g.b.points
      b.pa += g.a.points
      if (g.a.points > g.b.points) {
      a.w++
      b.l++
    }
      else if (g.a.points < g.b.points) {
      a.l++
      b.w++
    }
      else {
      a.t++
      b.t++
    }
    }
  }
  return r
}

/** Standings order from records: wins (ties half), then points for. */
export function standingsOrder(records: Map<number, TeamRecord>): number[] {
  return [...records]
    .sort(([, x], [, y]) => y.w + y.t / 2 - (x.w + x.t / 2) || y.pf - x.pf)
    .map(([id]) => id)
}

/** All-play record: each week, every team against every other team's score that week. */
export function allPlay(weeks: WeekGames[], through: number): Map<number, { w: number; l: number; t: number }> {
  const r = new Map<number, { w: number; l: number; t: number }>()
  for (const wk of weeks) {
    if (wk.week > through) continue
    const scores = wk.games.flatMap((g) => (g.b ? [g.a, g.b] : [g.a]))
    for (const s of scores) {
      const e = r.get(s.rosterId) ?? { w: 0, l: 0, t: 0 }
      for (const o of scores) {
        if (o.rosterId === s.rosterId) continue
        if (s.points > o.points) e.w++
        else if (s.points < o.points) e.l++
        else e.t++
      }
      r.set(s.rosterId, e)
    }
  }
  return r
}

export interface PowerRow {
  rosterId: number
  rank: number
  /** 0-100 composite (model) */
  score: number
  allPlayPct: number
  pointsPerGame: number
  /** projected best-lineup points this week, when known */
  strength: number | null
}

/** Rank of each value as a 0-1 percentile within the list (higher value, higher percentile). */
const pctRank = (values: number[]) => (v: number) =>
  values.length <= 1 ? 1 : values.filter((x) => x < v).length / (values.length - 1)

/**
 * GamePlanBlitz power rankings (a model, not the official standings): 50% all-play win rate,
 * 30% points per game and 20% this week's projected best lineup (when projections exist;
 * otherwise 60/40). Weights are fixed and published so the ranking is explainable.
 */
export function powerRankings(
  weeks: WeekGames[],
  through: number,
  strength: Map<number, number> | null,
): PowerRow[] {
  const ap = allPlay(weeks, through)
  const rec = recordsThrough(weeks, through)
  const games = new Map<number, number>()
  for (const wk of weeks) if (wk.week <= through) for (const g of wk.games) for (const s of g.b ? [g.a, g.b] : [g.a]) games.set(s.rosterId, (games.get(s.rosterId) ?? 0) + 1)
  const ids = [...new Set([...rec.keys(), ...(strength?.keys() ?? [])])]
  const ppg = (id: number) => (rec.get(id)?.pf ?? 0) / Math.max(1, games.get(id) ?? 0)
  const apPct = (id: number) => {
    const a = ap.get(id)
    const n = a ? a.w + a.l + a.t : 0
    return n ? (a!.w + a!.t / 2) / n : 0.5
  }
  const ppgRank = pctRank(ids.map(ppg))
  const hasStrength = !!strength && strength.size > 0
  const strRank = pctRank(ids.map((id) => strength?.get(id) ?? 0))
  const rows = ids.map((id) => {
    const s = hasStrength
      ? 0.5 * apPct(id) + 0.3 * ppgRank(ppg(id)) + 0.2 * strRank(strength!.get(id) ?? 0)
      : 0.6 * apPct(id) + 0.4 * ppgRank(ppg(id))
    return { rosterId: id, rank: 0, score: Math.round(s * 1000) / 10, allPlayPct: apPct(id), pointsPerGame: ppg(id), strength: strength?.get(id) ?? null }
  })
  rows.sort((x, y) => y.score - x.score || y.pointsPerGame - x.pointsPerGame || x.rosterId - y.rosterId)
  rows.forEach((r, i) => (r.rank = i + 1))
  return rows
}

/** Change in rank between two rankings (positive = moved up). */
export function movers(prev: PowerRow[], cur: PowerRow[]): { rosterId: number; from: number; to: number; change: number }[] {
  const before = new Map(prev.map((r) => [r.rosterId, r.rank]))
  return cur
    .filter((r) => before.has(r.rosterId))
    .map((r) => ({ rosterId: r.rosterId, from: before.get(r.rosterId)!, to: r.rank, change: before.get(r.rosterId)! - r.rank }))
    .sort((a, b) => b.change - a.change || a.to - b.to)
}

/* ---------------- awards ---------------- */

export interface Award {
  id: 'high' | 'blowout' | 'closest' | 'upset' | 'bench' | 'tough'
  title: string
  rosterId: number
  /** the other team, when the award is about a game */
  otherId: number | null
  value: number
  playerId?: string
  /** true when the award relies on projections (a model), not only scores */
  model?: boolean
}

export interface AwardsResult {
  awards: Award[]
  /** awards that could not be computed, with the reason */
  unavailable: { title: string; reason: string }[]
}

/**
 * The week's awards from final scores. Biggest Upset needs each lineup's pre-game projection
 * (`projected`); without it the award is listed as unavailable. Comeback of the Week needs
 * in-game score snapshots, which Sleeper does not keep.
 */
export function weekAwards(games: LeagueGame[], projected?: (rosterId: number) => number | null): AwardsResult {
  const sides = games.flatMap((g) => (g.b ? [g.a, g.b] : [g.a]))
  const decided = games.map((g) => ({ g, o: outcome(g) })).filter((x): x is { g: LeagueGame; o: NonNullable<ReturnType<typeof outcome>> } => !!x.o)
  const awards: Award[] = []
  const unavailable: { title: string; reason: string }[] = [
    { title: 'Comeback of the Week', reason: 'needs in-game score snapshots, which Sleeper does not keep' },
  ]
  if (!sides.some((s) => s.points > 0)) return { awards, unavailable }
  const top = [...sides].sort((a, b) => b.points - a.points)[0]
  awards.push({ id: 'high', title: 'Highest Score of the Week', rosterId: top.rosterId, otherId: null, value: top.points })
  if (decided.length) {
    const blow = [...decided].sort((x, y) => y.o.margin - x.o.margin)[0]
    awards.push({ id: 'blowout', title: 'Biggest Blowout', rosterId: blow.o.winner.rosterId, otherId: blow.o.loser.rosterId, value: blow.o.margin })
    const close = [...decided].sort((x, y) => x.o.margin - y.o.margin)[0]
    awards.push({ id: 'closest', title: 'Closest Matchup', rosterId: close.o.winner.rosterId, otherId: close.o.loser.rosterId, value: close.o.margin })
    const tough = [...decided].sort((x, y) => y.o.loser.points - x.o.loser.points)[0]
    awards.push({ id: 'tough', title: 'Toughest Loss', rosterId: tough.o.loser.rosterId, otherId: tough.o.winner.rosterId, value: tough.o.loser.points })
    if (projected) {
      const upsets = decided
        .map(({ o }) => ({ o, w: projected(o.winner.rosterId), l: projected(o.loser.rosterId) }))
        .filter((u) => u.w !== null && u.l !== null && u.l > u.w)
        .sort((x, y) => y.l! - y.w! - (x.l! - x.w!))
      if (upsets[0])
        awards.push({ id: 'upset', title: 'Biggest Upset', rosterId: upsets[0].o.winner.rosterId, otherId: upsets[0].o.loser.rosterId, value: upsets[0].l! - upsets[0].w!, model: true })
      else unavailable.push({ title: 'Biggest Upset', reason: 'every projected favorite won' })
    } else unavailable.push({ title: 'Biggest Upset', reason: 'no pre-game projections for this week' })
  }
  let bench: { rosterId: number; id: string; pts: number } | null = null
  for (const s of sides) {
    const starters = new Set(s.starters)
    for (const [id, pts] of Object.entries(s.playersPoints))
      if (!starters.has(id) && (!bench || pts > bench.pts)) bench = { rosterId: s.rosterId, id, pts }
  }
  if (bench && bench.pts > 0)
    awards.push({ id: 'bench', title: 'Best Bench Performance', rosterId: bench.rosterId, otherId: null, value: bench.pts, playerId: bench.id })
  return { awards, unavailable }
}

/* ---------------- storylines ---------------- */

export interface Story {
  id: string
  text: string
  rosterIds: number[]
}

/**
 * Storylines for a completed week, from scores and records only (nothing invented):
 * the leader upset, contenders meeting, sub-1-point finishes, the top scorer losing, streaks.
 */
export function storylines(
  weeks: WeekGames[],
  week: number,
  name: (rosterId: number) => string,
  playoffTeams: number,
): Story[] {
  const wk = weeks.find((w) => w.week === week)
  if (!wk) return []
  const out: Story[] = []
  const before = standingsOrder(recordsThrough(weeks, week - 1))
  const leader = week > 1 ? before[0] : undefined
  const contenders = new Set(week > 1 ? before.slice(0, playoffTeams) : [])
  const sides = wk.games.flatMap((g) => (g.b ? [g.a, g.b] : [g.a]))
  const top = [...sides].sort((a, b) => b.points - a.points)[0]
  for (const g of wk.games) {
    const o = outcome(g)
    if (!o || !g.b) continue
    const W = name(o.winner.rosterId)
    const L = name(o.loser.rosterId)
    if (leader !== undefined && o.loser.rosterId === leader)
      out.push({ id: `upset-leader-${g.matchupId}`, text: `First-place ${L} fell to ${W}, ${o.winner.points.toFixed(1)}-${o.loser.points.toFixed(1)}.`, rosterIds: [o.winner.rosterId, o.loser.rosterId] })
    if (contenders.has(g.a.rosterId) && contenders.has(g.b.rosterId))
      out.push({ id: `contenders-${g.matchupId}`, text: `Two teams in playoff position met: ${W} beat ${L}.`, rosterIds: [o.winner.rosterId, o.loser.rosterId] })
    if (o.margin < 1)
      out.push({ id: `photo-${g.matchupId}`, text: `${W} edged ${L} by ${o.margin.toFixed(2)} points.`, rosterIds: [o.winner.rosterId, o.loser.rosterId] })
    if (top && o.loser.rosterId === top.rosterId)
      out.push({ id: `top-lost-${g.matchupId}`, text: `${L} put up the week's highest score (${o.loser.points.toFixed(1)}) and still lost to ${W}.`, rosterIds: [o.loser.rosterId, o.winner.rosterId] })
  }
  // streaks: 3+ straight wins, or a win that snaps a 3+ game losing streak
  const ordered = [...weeks].filter((w) => w.week <= week).sort((a, b) => a.week - b.week)
  for (const s of sides) {
    const results = ordered.map((w) => {
      const g = w.games.find((x) => x.a.rosterId === s.rosterId || x.b?.rosterId === s.rosterId)
      const o = g ? outcome(g) : null
      return o ? (o.winner.rosterId === s.rosterId ? 'W' : 'L') : '-'
    })
    const last = results[results.length - 1]
    let run = 0
    for (let i = results.length - 1; i >= 0 && results[i] === last; i--) run++
    if (last === 'W' && run >= 3) out.push({ id: `streak-${s.rosterId}`, text: `${name(s.rosterId)} has won ${run} straight.`, rosterIds: [s.rosterId] })
    if (last === 'W' && run === 1) {
      let losses = 0
      for (let i = results.length - 2; i >= 0 && results[i] === 'L'; i--) losses++
      if (losses >= 3) out.push({ id: `snap-${s.rosterId}`, text: `${name(s.rosterId)} snapped a ${losses}-game losing streak.`, rosterIds: [s.rosterId] })
    }
  }
  return out
}
