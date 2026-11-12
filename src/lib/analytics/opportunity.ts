import type { PlayerMap, StatLine, StatRow } from '../sleeper'

/*
 * Opportunity analytics from Sleeper's weekly stat rows: injury availability and team context,
 * the injury domino effect (teammates' usage with vs without a player), and the breakout radar
 * (rising usage). Everything is measured; nothing is assumed to transfer.
 */

export const OUT_STATUSES = new Set(['Out', 'IR', 'PUP', 'Sus', 'NA', 'DNR', 'COV'])
export const OL_POSITIONS = new Set(['T', 'G', 'C', 'OT', 'OG', 'OL'])

export type Availability = 'out' | 'doubtful' | 'questionable' | 'active'
export function availabilityOf(status: string | null | undefined): Availability {
  if (!status) return 'active'
  if (OUT_STATUSES.has(status)) return 'out'
  if (status === 'Doubtful') return 'doubtful'
  return 'questionable'
}
export const AVAILABILITY_TEXT: Record<Availability, string> = {
  out: 'Officially ruled out or on a reserve list.',
  doubtful: 'Doubtful: unlikely to play, but not ruled out.',
  questionable: 'Questionable: a game-time decision. Not assumed inactive until confirmed.',
  active: 'No injury designation.',
}

/* ---------------- weekly usage ---------------- */

export interface Usage {
  week: number
  team: string | null
  snapShare: number | null
  targets: number
  carries: number
  touches: number
  rzOpps: number
  pts: number
  /** expected points from usage, when the model's weights are known */
  xfp: number | null
}

export interface WeekData {
  week: number
  rows: StatRow[]
}

const played = (s: StatLine) => (s.gp || s.gms_active || 0) > 0

export function usageOf(
  week: number,
  team: string | null,
  s: StatLine,
  pts: number,
  xfp: number | null,
): Usage {
  const targets = s.rec_tgt ?? 0
  const carries = s.rush_att ?? 0
  return {
    week,
    team,
    snapShare: s.off_snp > 0 && s.tm_off_snp > 0 ? s.off_snp / s.tm_off_snp : null,
    targets,
    carries,
    touches: carries + (s.rec ?? 0),
    rzOpps: (s.rec_rz_tgt ?? 0) + (s.rush_rz_att ?? 0),
    pts,
    xfp,
  }
}

export interface UsageBook {
  /** player -> games played, ascending */
  games: Map<string, Usage[]>
  /** team -> weeks the team played (any player recorded a game) */
  teamWeeks: Map<string, Set<number>>
}

export function usageBook(
  weeks: WeekData[],
  ptsOf: (s: StatLine) => number,
  xfpOf: (id: string, s: StatLine) => number | null,
): UsageBook {
  const games = new Map<string, Usage[]>()
  const teamWeeks = new Map<string, Set<number>>()
  for (const { week, rows } of [...weeks].sort((a, b) => a.week - b.week))
    for (const r of rows) {
      if (!played(r.stats)) continue
      const team = r.team ?? null
      if (team) (teamWeeks.get(team) ?? teamWeeks.set(team, new Set()).get(team)!).add(week)
      const u = usageOf(week, team, r.stats, ptsOf(r.stats), xfpOf(r.player_id, r.stats))
      const list = games.get(r.player_id)
      if (list) list.push(u)
      else games.set(r.player_id, [u])
    }
  return { games, teamWeeks }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const avgOf = (u: Usage[], k: 'targets' | 'carries' | 'touches' | 'rzOpps' | 'pts') =>
  avg(u.map((x) => x[k]))
const avgSnap = (u: Usage[]) =>
  avg(u.map((x) => x.snapShare).filter((v): v is number => v !== null))

/* ---------------- team context ---------------- */

export interface TeamContext {
  qb: { id: string; status: string } | null
  olInjuries: { id: string; pos: string; status: string }[]
}

/** The team's depth-chart QB1 and its offensive-line injuries, from Sleeper's player book. */
export function teamContext(players: PlayerMap, team: string): TeamContext {
  const roster = Object.values(players).filter((p) => p.team === team)
  const qbs = roster
    .filter((p) => p.position === 'QB' && p.depth_chart_order != null)
    .sort((a, b) => (a.depth_chart_order ?? 99) - (b.depth_chart_order ?? 99))
  const qb = qbs[0] ? { id: qbs[0].player_id, status: qbs[0].injury_status ?? '' } : null
  const olInjuries = roster
    .filter((p) => OL_POSITIONS.has(p.position ?? '') && p.injury_status)
    .map((p) => ({ id: p.player_id, pos: p.position ?? '', status: p.injury_status! }))
    .sort(
      (a, b) =>
        Number(availabilityOf(b.status) === 'out') - Number(availabilityOf(a.status) === 'out'),
    )
  return { qb, olInjuries }
}

/* ---------------- injury domino ---------------- */

/** Positions whose usage an injury at `pos` plausibly redistributes to. */
export const AFFECTED: Record<string, string[]> = {
  QB: ['QB', 'RB', 'WR', 'TE'],
  RB: ['RB', 'WR', 'TE'],
  WR: ['WR', 'TE', 'RB'],
  TE: ['TE', 'WR'],
}

export interface Ripple {
  id: string
  pos: string
  /** games the injured player missed / played (team games this season) */
  without: number
  with: number
  /** per-game change when he was out (null when there are no games without him) */
  delta: {
    targets: number
    touches: number
    rzOpps: number
    snapShare: number | null
    pts: number
  } | null
  /** depth-chart rank at his position (1 = starter), when Sleeper has one */
  depth: number | null
}

export const MIN_GAMES_WITHOUT = 1

/**
 * Teammates' usage in team games the player missed vs games he played. Measured only: no
 * workload is assumed to move. Teammates without games on both sides get no number.
 */
export function domino(book: UsageBook, players: PlayerMap, injuredId: string): Ripple[] {
  const p = players[injuredId]
  const team = p?.team
  const pos = p?.position ?? ''
  if (!team || !AFFECTED[pos]) return []
  const teamWeeks = book.teamWeeks.get(team) ?? new Set<number>()
  const playedWeeks = new Set(
    (book.games.get(injuredId) ?? []).filter((u) => u.team === team).map((u) => u.week),
  )
  const missed = [...teamWeeks].filter((w) => !playedWeeks.has(w))
  const out: Ripple[] = []
  for (const mate of Object.values(players)) {
    if (
      mate.player_id === injuredId ||
      mate.team !== team ||
      !AFFECTED[pos].includes(mate.position ?? '')
    )
      continue
    const g = (book.games.get(mate.player_id) ?? []).filter((u) => u.team === team)
    const without = g.filter((u) => missed.includes(u.week))
    const withHim = g.filter((u) => playedWeeks.has(u.week))
    if (g.length === 0 && mate.depth_chart_order == null) continue
    const d = (k: 'targets' | 'touches' | 'rzOpps' | 'pts') =>
      (avgOf(without, k) ?? 0) - (avgOf(withHim, k) ?? 0)
    const sw = avgSnap(without)
    const sh = avgSnap(withHim)
    out.push({
      id: mate.player_id,
      pos: mate.position ?? '',
      without: without.length,
      with: withHim.length,
      delta:
        without.length >= MIN_GAMES_WITHOUT && withHim.length > 0
          ? {
              targets: d('targets'),
              touches: d('touches'),
              rzOpps: d('rzOpps'),
              snapShare: sw !== null && sh !== null ? sw - sh : null,
              pts: d('pts'),
            }
          : null,
      depth: mate.position === pos ? (mate.depth_chart_order ?? null) : null,
    })
  }
  // measured gains first (by added opportunities), then same-position depth chart order
  return out.sort(
    (a, b) =>
      (b.delta ? b.delta.targets + b.delta.touches : -99) -
        (a.delta ? a.delta.targets + a.delta.touches : -99) || (a.depth ?? 99) - (b.depth ?? 99),
  )
}

/* ---------------- breakout radar ---------------- */

/** A signal counts when the recent average beats the earlier average by at least this much. */
export const BREAKOUT = {
  snap: 0.1,
  targets: 2,
  touches: 3,
  rzOpps: 1,
  xfpOverPts: 3,
  recentGames: 2,
  minEarlier: 2,
  minSignals: 2,
} as const

export interface Breakout {
  id: string
  pos: string
  signals: string[]
  /** recent averages (last 2 games) */
  recent: {
    snapShare: number | null
    targets: number
    touches: number
    rzOpps: number
    pts: number
    xfp: number | null
  }
  earlier: {
    snapShare: number | null
    targets: number
    touches: number
    rzOpps: number
    pts: number
  }
  games: number
}

/**
 * Players whose last two games show more opportunity than their earlier games (snap share,
 * targets, touches, red-zone chances), or whose usage is worth more than they've scored.
 * Needs 2+ positive signals. Evidence, not a prediction.
 */
export function breakouts(
  book: UsageBook,
  posOf: (id: string) => string,
  positions = ['RB', 'WR', 'TE'],
): Breakout[] {
  const out: Breakout[] = []
  for (const [id, g] of book.games) {
    const pos = posOf(id)
    if (!positions.includes(pos)) continue
    if (g.length < BREAKOUT.recentGames + BREAKOUT.minEarlier) continue
    const recent = g.slice(-BREAKOUT.recentGames)
    const earlier = g.slice(0, -BREAKOUT.recentGames)
    const r = {
      snapShare: avgSnap(recent),
      targets: avgOf(recent, 'targets')!,
      touches: avgOf(recent, 'touches')!,
      rzOpps: avgOf(recent, 'rzOpps')!,
      pts: avgOf(recent, 'pts')!,
    }
    const e = {
      snapShare: avgSnap(earlier),
      targets: avgOf(earlier, 'targets')!,
      touches: avgOf(earlier, 'touches')!,
      rzOpps: avgOf(earlier, 'rzOpps')!,
      pts: avgOf(earlier, 'pts')!,
    }
    const xs = recent.map((u) => u.xfp).filter((v): v is number => v !== null)
    const xfp = xs.length === recent.length ? avg(xs) : null
    const signals: string[] = []
    if (r.snapShare !== null && e.snapShare !== null && r.snapShare - e.snapShare >= BREAKOUT.snap)
      signals.push(
        `Snap share up ${Math.round((r.snapShare - e.snapShare) * 100)} pts (${Math.round(e.snapShare * 100)}% → ${Math.round(r.snapShare * 100)}%)`,
      )
    if (r.targets - e.targets >= BREAKOUT.targets)
      signals.push(
        `Targets up ${(r.targets - e.targets).toFixed(1)} per game (${e.targets.toFixed(1)} → ${r.targets.toFixed(1)})`,
      )
    if (r.touches - e.touches >= BREAKOUT.touches)
      signals.push(
        `Touches up ${(r.touches - e.touches).toFixed(1)} per game (${e.touches.toFixed(1)} → ${r.touches.toFixed(1)})`,
      )
    if (r.rzOpps - e.rzOpps >= BREAKOUT.rzOpps)
      signals.push(`Red-zone chances up ${(r.rzOpps - e.rzOpps).toFixed(1)} per game`)
    if (xfp !== null && xfp - r.pts >= BREAKOUT.xfpOverPts)
      signals.push(
        `Usage worth ${xfp.toFixed(1)} pts per game, ${(xfp - r.pts).toFixed(1)} more than he has scored`,
      )
    if (signals.length >= BREAKOUT.minSignals)
      out.push({ id, pos, signals, recent: { ...r, xfp }, earlier: e, games: g.length })
  }
  // most opportunity first: expected points from recent usage, else touches + targets
  return out.sort(
    (a, b) =>
      (b.recent.xfp ?? b.recent.touches + b.recent.targets) -
      (a.recent.xfp ?? a.recent.touches + a.recent.targets),
  )
}
