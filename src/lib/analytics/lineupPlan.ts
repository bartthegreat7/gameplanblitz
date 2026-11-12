import { MIN_GAMES, rateConfidence, type Confidence, type Evidence } from '../evidence'
import { f1, ordinal } from '../format'
import { flexLabel, SLOT_ELIG } from '../lineup'
import type { DefenseVsPos } from './matchup'
import type { UsageTrend } from './usage'
import { projectionRange } from './volatility'

/* ---------- exact assignment (Hungarian algorithm) ---------- */

/** Minimum-cost assignment of n rows to distinct columns (n ≤ m). Returns the column per row. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length
  if (n === 0) return []
  const m = cost[0].length
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(m + 1).fill(0)
  const p = new Array<number>(m + 1).fill(0)
  const way = new Array<number>(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(m + 1).fill(Infinity)
    const used = new Array<boolean>(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const ans = new Array<number>(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1
  return ans
}

export interface AssignPlayer {
  id: string
  pos: string
  value: number
}

const INELIGIBLE = -1e9
/** An empty slot is worse than any eligible player, even one worth 0. */
const EMPTY = -1e-6
/** Tie-break bonus for leaving a player in the slot he already occupies. */
export const STABILITY = 0.001
/** Smaller tie-break: between equal lineups, fill specific slots (WR) before flexible ones (FLEX). */
export const SPECIFICITY = 0.00001

/**
 * Best total value over the slots, each slot filled by an eligible, distinct player (or left
 * empty if nobody is eligible). Exact, unlike greedy fill, which can lose points when flex
 * slots overlap without nesting (e.g. WR/RB flex + WR/TE flex).
 * `keep[i]` is the player already in slot i: he gets STABILITY so ties don't shuffle lineups.
 */
export function optimalAssignment(
  slots: string[],
  players: AssignPlayer[],
  keep: (string | null)[] = [],
): (string | null)[] {
  const S = slots.length
  const rows = slots.map((slot, i) => {
    const elig = SLOT_ELIG[slot] ?? [slot]
    const row = players.map((pl) =>
      elig.includes(pl.pos) ? pl.value + (keep[i] === pl.id ? STABILITY : 0) + SPECIFICITY / elig.length : INELIGIBLE,
    )
    for (let k = 0; k < S; k++) row.push(EMPTY)
    return row.map((x) => -x)
  })
  // columns past players.length are the "empty slot" dummies
  return hungarian(rows).map((c) => (c >= 0 && c < players.length ? players[c].id : null))
}

/* ---------- lineup plan ---------- */

export type RiskMode = 'projection' | 'floor' | 'ceiling'

export interface Candidate {
  id: string
  name: string
  pos: string
  team: string
  opponent: string | null
  /** Sleeper projection in league scoring */
  proj: number
  /** week-to-week volatility (model), null when unknowable */
  sd: number | null
  floor: number | null
  ceiling: number | null
  /** games behind the volatility estimate */
  n: number
  injury: string
  /** designated Out/IR/etc.: will not play */
  out: boolean
  bye: boolean
  /** game already started: locked in Sleeper */
  started: boolean
  usage: UsageTrend | null
  matchup: DefenseVsPos | null
}

export interface Totals {
  proj: number
  sd: number | null
  floor: number | null
  ceiling: number | null
}

export interface SlotPlan {
  slot: string
  label: string
  current: Candidate | null
  recommended: Candidate | null
  locked: boolean
  changed: boolean
  /** the player already in the lineup moves here from another slot (a reshuffle, not a new starter) */
  move: boolean
  /** for a new starter: the benched player he displaces (null when filling an empty slot) */
  partner: Candidate | null
  /** new starter's projection − his displaced player's effective projection (0 for moves/unchanged) */
  delta: number
  reasons: string[]
  evidence: Evidence[]
  confidence: Confidence | null
}

export interface LineupPlan {
  mode: RiskMode
  slots: SlotPlan[]
  /** players entering the lineup / leaving it (reshuffles within the lineup are in neither) */
  start: Candidate[]
  sit: Candidate[]
  current: Totals
  recommended: Totals
}

/**
 * Pairs each new starter with the benched player he displaces: same position first, then the
 * highest-projected remaining. Reshuffles (a retained player changing slots) make a slot-by-slot
 * comparison misleading, so gains and confidence are judged on these pairs.
 */
export function pairDisplaced(start: Candidate[], sit: Candidate[]): Map<string, Candidate | null> {
  const remaining = [...sit].sort((a, b) => b.proj - a.proj)
  const out = new Map<string, Candidate | null>()
  for (const s of [...start].sort((a, b) => b.proj - a.proj)) {
    const i = remaining.findIndex((x) => x.pos === s.pos)
    const j = i >= 0 ? i : remaining.length ? 0 : -1
    out.set(s.id, j >= 0 ? remaining.splice(j, 1)[0] : null)
  }
  return out
}

const available = (c: Candidate) => !c.out && !c.bye
/** Projection that can actually be expected: 0 for a player who will not play. */
export const effectiveProj = (c: Candidate | null) => (c && available(c) ? c.proj : 0)

export function valueOf(c: Candidate, mode: RiskMode): number {
  if (mode === 'floor') return c.floor ?? c.proj
  if (mode === 'ceiling') return c.ceiling ?? c.proj
  return c.proj
}

export function totals(picks: (Candidate | null)[]): Totals {
  const proj = picks.reduce((t, c) => t + effectiveProj(c), 0)
  const real = picks.filter((c): c is Candidate => !!c && available(c))
  const sd = real.length && real.every((c) => c.sd !== null) ? Math.sqrt(real.reduce((t, c) => t + (c.sd as number) ** 2, 0)) : null
  const range = projectionRange(proj, sd)
  return { proj, sd, floor: range?.floor ?? null, ceiling: range?.ceiling ?? null }
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const flagged = (inj: string) => inj === 'Questionable' || inj === 'Doubtful'

export function evidenceFor(c: Candidate, provider: string | null): Evidence[] {
  const out: Evidence[] = [
    { label: 'Projection', value: `${f1(c.proj)} pts`, source: `Sleeper projections${provider ? ` (${provider})` : ''}` },
  ]
  if (c.floor !== null && c.ceiling !== null)
    out.push({
      label: 'Range (≈10th–90th pct)',
      value: `${f1(c.floor)}–${f1(c.ceiling)}`,
      source: `Model: projection ± 1.28 × week-to-week sd (${f1(c.sd)}), ${c.n} games`,
    })
  if (c.usage)
    out.push({
      label: 'Snap share',
      value: `${pct(c.usage.recent)} last 3 vs ${pct(c.usage.season)} season`,
      source: `Sleeper weekly stats (${c.usage.games} games)`,
    })
  if (c.matchup && c.opponent)
    out.push({
      label: `vs ${c.opponent}`,
      value: `${ordinal(c.matchup.rank)} most generous to ${c.pos} (${f1(c.matchup.perGame)} pts/g, league avg ${f1(c.matchup.leagueAvg)})`,
      source: 'Sleeper weekly stats, this season. Context only: not added to the projection',
    })
  return out
}

/** `cur` is the displaced player (null if none). `emptySlot` = the slot has nobody in it now. */
function explain(slot: string, cur: Candidate | null, rec: Candidate, mode: RiskMode, emptySlot: boolean): string[] {
  const label = flexLabel(slot)
  const lines: string[] = []
  if (!cur) {
    lines.push(
      emptySlot
        ? `Fill the empty ${label} slot with ${rec.name} (${f1(rec.proj)} projected).`
        : `Start ${rec.name} (${f1(rec.proj)} projected) at ${label}.`,
    )
  } else {
    const gain = rec.proj - effectiveProj(cur)
    lines.push(
      `Start ${rec.name} (${f1(rec.proj)} proj) over ${cur.name} (${f1(cur.proj)}): ${gain >= 0 ? '+' : ''}${f1(gain)} projected points.`,
    )
    if (cur.out) lines.push(`${cur.name} is listed ${cur.injury} and will not play.`)
    else if (cur.bye) lines.push(`${cur.name} is on a bye this week.`)
    if (mode === 'floor' && rec.floor !== null && cur.floor !== null)
      lines.push(`Safer: floor ${f1(rec.floor)} vs ${f1(cur.floor)}.`)
    if (mode === 'ceiling' && rec.ceiling !== null && cur.ceiling !== null)
      lines.push(`More upside: ceiling ${f1(rec.ceiling)} vs ${f1(cur.ceiling)}.`)
    if (cur.usage?.label === 'falling')
      lines.push(`${cur.name}'s snap share is falling (${pct(cur.usage.recent)} over the last 3 games vs ${pct(cur.usage.season)} season).`)
  }
  if (rec.usage?.label === 'rising')
    lines.push(`${rec.name}'s snap share is rising (${pct(rec.usage.recent)} over the last 3 games vs ${pct(rec.usage.season)} season).`)
  if (rec.matchup && rec.opponent)
    lines.push(
      `${rec.name} faces ${rec.opponent}: ${ordinal(rec.matchup.rank)} most generous defense to ${rec.pos} (${f1(rec.matchup.perGame)} pts/game vs ${f1(rec.matchup.leagueAvg)} league average). Context only.`,
    )
  if (flagged(rec.injury)) lines.push(`${rec.name} is ${rec.injury}: check status before kickoff.`)
  return lines
}

export interface PlanInput {
  startSlots: string[]
  /** current starters aligned to startSlots ("0" or missing = empty) */
  currentStarters: string[]
  candidates: Map<string, Candidate>
  mode: RiskMode
  /** projection provider named by Sleeper, for source attribution */
  provider: string | null
}

export function planLineup(input: PlanInput): LineupPlan {
  const { startSlots, candidates, mode, provider } = input
  const cur = startSlots.map((_, i) => {
    const id = input.currentStarters[i]
    return id && id !== '0' ? (candidates.get(id) ?? null) : null
  })
  const fixed = cur.map((c) => !!c?.started)
  const open = startSlots.map((_, i) => i).filter((i) => !fixed[i])

  const pool = [...candidates.values()].filter((c) => available(c) && !c.started)
  const assigned = optimalAssignment(
    open.map((i) => startSlots[i]),
    pool.map((c) => ({ id: c.id, pos: c.pos, value: valueOf(c, mode) })),
    open.map((i) => cur[i]?.id ?? null),
  )
  const rec: (Candidate | null)[] = startSlots.map((_, i) => (fixed[i] ? cur[i] : null))
  open.forEach((slotIdx, k) => {
    const id = assigned[k]
    rec[slotIdx] = id ? (candidates.get(id) ?? null) : null
  })

  // who enters / leaves the lineup, and whom each newcomer displaces
  const curIds = new Set(cur.flatMap((c) => (c ? [c.id] : [])))
  const recIds = new Set(rec.flatMap((c) => (c ? [c.id] : [])))
  const start = rec.filter((c): c is Candidate => !!c && !curIds.has(c.id))
  // a player left in place because nobody could replace him (e.g. only TE is on a bye) is not "benched"
  const unreplaced = new Set(open.flatMap((i) => (!rec[i] && cur[i] ? [cur[i]!.id] : [])))
  const sit = cur.filter((c): c is Candidate => !!c && !recIds.has(c.id) && !unreplaced.has(c.id))
  const displaced = pairDisplaced(start, sit)
  const fromSlot = new Map(cur.flatMap((c, i) => (c ? [[c.id, i] as const] : [])))

  const slots = startSlots.map<SlotPlan>((slot, i) => {
    const c = cur[i]
    const r = rec[i]
    const label = flexLabel(slot)
    const none = { move: false, partner: null, delta: 0, changed: false, confidence: null, evidence: [] as Evidence[] }
    const base = { slot, label, current: c, recommended: r, locked: fixed[i] }
    if (fixed[i]) return { ...base, ...none, reasons: [`Locked: ${c!.name}'s game has already started.`] }
    if (!r) return { ...base, ...none, reasons: [`No eligible, available player for the ${label} slot.`] }
    if (c && r.id === c.id)
      return { ...base, ...none, reasons: ['Already your best option for this slot.'], evidence: evidenceFor(r, provider) }

    // A player already in the lineup moves between slots to make room: not a new starter.
    const origin = fromSlot.get(r.id)
    if (origin !== undefined)
      return {
        ...base,
        ...none,
        changed: true,
        move: true,
        reasons: [`${r.name} moves here from ${flexLabel(startSlots[origin])} so a better player can start there.`],
        evidence: evidenceFor(r, provider),
      }

    // A new starter: judged against the player he displaces.
    const p = displaced.get(r.id) ?? null
    const gain = r.proj - effectiveProj(p)
    const unavailable = !p || !available(p)
    const sdDiff = p && r.sd !== null && p.sd !== null ? Math.sqrt(r.sd ** 2 + p.sd ** 2) : null
    // A certain fact (empty slot, Out, bye) is a full-confidence margin; otherwise gap ÷ volatility.
    const marginZ = unavailable ? 1 : sdDiff ? gain / sdDiff : 0
    const reasons = explain(slot, p, r, mode, !c)
    if (c && p && c.id !== p.id && recIds.has(c.id))
      reasons.push(`${c.name} stays in your lineup, moving to ${flexLabel(startSlots[rec.findIndex((x) => x?.id === c.id)])}.`)
    return {
      ...base,
      ...none,
      changed: true,
      partner: p,
      delta: gain,
      reasons,
      evidence: evidenceFor(r, provider),
      confidence: rateConfidence({
        marginZ,
        sampleOk: r.n >= MIN_GAMES && (!p || p.n >= MIN_GAMES),
        injuryFlag: flagged(r.injury),
      }),
    }
  })

  return { mode, slots, start, sit, current: totals(cur), recommended: totals(rec) }
}
