import type { Model } from '../model'
import type { SleeperMatchup } from '../sleeper'
import { projectedLineup, scoreHistory } from './scouting'

/* Playoff simulator: seeded, reproducible Monte Carlo over the schedule Sleeper publishes.
   Every assumption is explicit and configurable; the same inputs and seed always give the same odds. */

/* ---------- randomness ---------- */

/** Small, fast, seedable PRNG (Mulberry32). Same seed → same sequence, on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal sample (Box–Muller). */
export function normal(rng: () => number): number {
  let u = 0
  while (u === 0) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

/* ---------- team model (assumptions) ---------- */

export type StrengthBasis = 'season' | 'projection' | 'blend'

export interface TeamModel {
  rosterId: number
  /** expected weekly score */
  mean: number
  /** week-to-week standard deviation */
  sd: number
}

/** Volatility used when a team has too few games to estimate its own, and the floor for any team. */
export const MIN_SD = 10
export const MIN_GAMES_FOR_SD = 3

const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sdOf = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = meanOf(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

/**
 * Expected score and volatility per team.
 * - season: average points per game so far;  projection: this week's best projected lineup;
 *   blend: the two averaged (default). A team with no games uses its projection.
 * - sd: the team's own week-to-week sd with 3+ games, else the league's pooled sd; never below MIN_SD.
 */
export function teamModels(opts: {
  rosterIds: number[]
  /** completed weekly scores per roster */
  scores: Map<number, number[]>
  /** this week's best projected lineup per roster */
  projected: Map<number, number>
  basis: StrengthBasis
}): TeamModel[] {
  const all = [...opts.scores.values()].flat()
  const pooled = Math.max(MIN_SD, sdOf(all))
  return opts.rosterIds.map((id) => {
    const s = opts.scores.get(id) ?? []
    const proj = opts.projected.get(id) ?? 0
    const season = s.length ? meanOf(s) : proj
    const mean = opts.basis === 'season' ? season : opts.basis === 'projection' ? proj : (season + proj) / 2
    const sd = Math.max(MIN_SD, s.length >= MIN_GAMES_FOR_SD ? sdOf(s) : pooled)
    return { rosterId: id, mean, sd }
  })
}

/* ---------- bracket ---------- */

/** Seed order of a standard bracket of size 2^k, e.g. 4 → [1,4,2,3], 8 → [1,8,4,5,2,7,3,6]. */
export function bracketOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const n = order.length * 2 + 1
    order = order.flatMap((s) => [s, n - s])
  }
  return order
}

/* ---------- simulation ---------- */

export interface StandingRow {
  rosterId: number
  wins: number
  losses: number
  ties: number
  pf: number
}

export interface Game {
  week: number
  home: number
  away: number
}

export interface Forced {
  week: number
  rosterId: number
  result: 'W' | 'L'
}

export interface SimInput {
  teams: TeamModel[]
  standings: StandingRow[]
  /** regular-season games still to play */
  remaining: Game[]
  playoffTeams: number
  sims: number
  seed: number
  /** fix some results (scenarios such as "if you win this week") */
  forced?: Forced[]
}

export interface TeamOdds {
  rosterId: number
  /** 0-100 */
  playoffPct: number
  byePct: number
  firstSeedPct: number
  championPct: number
  avgWins: number
  avgSeed: number
  /** share of simulations finishing at each seed 1..N (0-100) */
  seedPct: number[]
}

/**
 * Standings order: wins (ties count half), then total points for, then a random draw. Points for
 * is Sleeper's default tiebreaker; custom tiebreak settings are not modeled.
 */
export function rankTeams(rows: StandingRow[], rng: () => number): StandingRow[] {
  const tieBreak = new Map(rows.map((r) => [r.rosterId, rng()]))
  return [...rows].sort(
    (a, b) =>
      b.wins + b.ties / 2 - (a.wins + a.ties / 2) ||
      b.pf - a.pf ||
      tieBreak.get(b.rosterId)! - tieBreak.get(a.rosterId)!,
  )
}

export function simulate(input: SimInput): TeamOdds[] {
  const rng = mulberry32(input.seed)
  const model = new Map(input.teams.map((t) => [t.rosterId, t]))
  const ids = input.standings.map((s) => s.rosterId)
  const n = ids.length
  const P = Math.max(0, Math.min(input.playoffTeams, n))
  const size = P > 1 ? 2 ** Math.ceil(Math.log2(P)) : 1
  const byes = size - P
  const order = P > 1 ? bracketOrder(size) : [1]
  const forced = new Map((input.forced ?? []).map((f) => [`${f.week}|${f.rosterId}`, f.result]))

  const acc = new Map(ids.map((id) => [id, { playoff: 0, bye: 0, first: 0, champ: 0, wins: 0, seedSum: 0, seeds: new Array<number>(n).fill(0) }]))
  const score = (id: number) => {
    const t = model.get(id)
    return t ? Math.max(0, t.mean + t.sd * normal(rng)) : 0
  }
  const play = (a: number, b: number) => (score(a) >= score(b) ? a : b)

  for (let s = 0; s < input.sims; s++) {
    const table = new Map(input.standings.map((r) => [r.rosterId, { ...r }]))
    for (const g of input.remaining) {
      let x = score(g.home)
      let y = score(g.away)
      const fh = forced.get(`${g.week}|${g.home}`)
      const fa = forced.get(`${g.week}|${g.away}`)
      // a forced result keeps both sampled scores, swapping them if needed
      if ((fh === 'W' || fa === 'L') && x < y) [x, y] = [y, x]
      if ((fh === 'L' || fa === 'W') && x > y) [x, y] = [y, x]
      const h = table.get(g.home)
      const a = table.get(g.away)
      if (!h || !a) continue
      h.pf += x
      a.pf += y
      if (x > y) {
        h.wins++
        a.losses++
      } else if (y > x) {
        a.wins++
        h.losses++
      } else {
        h.ties++
        a.ties++
      }
    }
    const ranked = rankTeams([...table.values()], rng)
    ranked.forEach((r, i) => {
      const e = acc.get(r.rosterId)!
      e.wins += r.wins
      e.seedSum += i + 1
      e.seeds[i]++
      if (i < P) e.playoff++
      if (i < byes) e.bye++
      if (i === 0) e.first++
    })
    if (P === 0) continue
    // fixed bracket (no re-seeding); seeds beyond P are byes
    let round: (number | null)[] = order.map((seed) => (seed <= P ? ranked[seed - 1].rosterId : null))
    while (round.length > 1) {
      const next: (number | null)[] = []
      for (let i = 0; i < round.length; i += 2) {
        const a = round[i]
        const b = round[i + 1]
        next.push(a === null ? b : b === null ? a : play(a, b))
      }
      round = next
    }
    if (round[0] !== null) acc.get(round[0])!.champ++
  }

  const pct = (x: number) => (100 * x) / Math.max(1, input.sims)
  return ids.map((id) => {
    const e = acc.get(id)!
    return {
      rosterId: id,
      playoffPct: pct(e.playoff),
      byePct: pct(e.bye),
      firstSeedPct: pct(e.first),
      championPct: pct(e.champ),
      avgWins: e.wins / Math.max(1, input.sims),
      avgSeed: e.seedSum / Math.max(1, input.sims),
      seedPct: e.seeds.map(pct),
    }
  })
}

/* ---------- schedule helpers ---------- */

/** Regular-season games from Sleeper matchups (grouped by matchup_id), for the given weeks. */
export function gamesFrom(weeks: { week: number; matchups: { roster_id: number; matchup_id: number | null }[] }[]): Game[] {
  const out: Game[] = []
  for (const { week, matchups } of weeks) {
    const byId = new Map<number, number[]>()
    for (const m of matchups) {
      if (m.matchup_id === null || m.matchup_id === undefined) continue
      byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m.roster_id])
    }
    for (const pair of byId.values()) if (pair.length === 2) out.push({ week, home: pair[0], away: pair[1] })
  }
  return out
}

/**
 * Remaining strength of schedule: average expected score of a team's remaining opponents, minus
 * the league average expected score. Positive = a harder road.
 */
export function remainingSOS(rosterId: number, games: Game[], teams: TeamModel[]): { games: number; vsAvg: number } {
  const mean = new Map(teams.map((t) => [t.rosterId, t.mean]))
  const leagueAvg = teams.reduce((a, t) => a + t.mean, 0) / Math.max(1, teams.length)
  const opps = games.flatMap((g) => (g.home === rosterId ? [g.away] : g.away === rosterId ? [g.home] : []))
  if (opps.length === 0) return { games: 0, vsAvg: 0 }
  return { games: opps.length, vsAvg: opps.reduce((a, o) => a + (mean.get(o) ?? leagueAvg), 0) / opps.length - leagueAvg }
}

/* ---------- season setup shared by the Playoff Simulator and the GM ---------- */

export const DEFAULT_SEED = 20261111
export const DEFAULT_SIMS = 5000

/**
 * Simulator inputs from the league: team strength models (past scores + best projected lineup),
 * current standings, the remaining regular-season games, and regular-season weeks Sleeper hasn't posted.
 */
export function prepareSeason(opts: {
  m: Model
  weeks: { week: number; matchups: SleeperMatchup[] }[]
  week: number
  lastRegular: number
  basis: StrengthBasis
}) {
  const { m, weeks, week, lastRegular, basis } = opts
  const done = weeks.filter((w) => w.week < week)
  const left = weeks.filter((w) => w.week >= week && w.week <= lastRegular)
  const ids = m.rosters.map((r) => r.roster_id)
  const scores = new Map(ids.map((id) => [id, scoreHistory(done, id).map((h) => h.points)]))
  const projected = new Map(ids.map((id) => [id, projectedLineup(m, id).reduce((a, s) => a + s.proj, 0)]))
  const teams = teamModels({ rosterIds: ids, scores, projected, basis })
  const standings: StandingRow[] = m.rosters.map((r) => ({
    rosterId: r.roster_id,
    wins: r.settings?.wins ?? 0,
    losses: r.settings?.losses ?? 0,
    ties: r.settings?.ties ?? 0,
    pf: (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
  }))
  const remaining = gamesFrom(left)
  const missingWeeks = Array.from({ length: Math.max(0, lastRegular - week + 1) }, (_, i) => week + i).filter(
    (w) => !left.some((x) => x.week === w && x.matchups.some((mm) => mm.matchup_id !== null)),
  )
  return { teams, standings, remaining, missingWeeks }
}

/** Teams that skip round one in a fixed bracket of `n` playoff teams. */
export const byeCount = (n: number) => (n <= 1 ? 0 : 2 ** Math.ceil(Math.log2(n)) - n)
