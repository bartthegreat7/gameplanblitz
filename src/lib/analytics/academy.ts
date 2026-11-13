import { flexLabel, SLOT_ELIG } from '../lineup'
import type { SleeperMatchup } from '../sleeper'
import { optimalAssignment } from './lineupPlan'

/*
 * Fantasy GM Academy: reviews of the lineups you actually set. A decision is judged on what was known
 * before kickoff (that week's Sleeper projection, in your scoring) separately from what happened
 * (Sleeper's points), so a good call that went badly is not called a mistake, and vice versa.
 */

export type Verdict = 'process-miss' | 'lucky' | 'unlucky'

export interface Decision {
  slot: string
  started: { id: string; proj: number; actual: number }
  benched: { id: string; proj: number; actual: number }
  /** process-miss: the projection favored the bench player, and he outscored the starter;
      lucky: the projection favored the bench player, but the starter scored more;
      unlucky: the projection favored the starter, but the bench player scored much more */
  verdict: Verdict
}

export interface WeekReview {
  week: number
  /** projected points of the lineup you set, and of the best lineup by projection (both known before kickoff) */
  setProj: number
  bestProj: number
  /** projected points left on the bench: the process gap */
  processGap: number
  /** actual points of your lineup and of the best lineup in hindsight */
  setActual: number
  bestActual: number
  hindsightGap: number
  result: 'W' | 'L' | 'T' | null
  margin: number | null
  decisions: Decision[]
}

/** Notable swaps decide nothing smaller than this (points). */
export const MIN_EDGE = 0.5
export const UNLUCKY_BY = 5

/**
 * Reviews one completed week. `projOf` is that week's projection in league scoring; `posOf` the
 * player's position. Only players on the roster that week (Sleeper's `players`) are considered.
 */
export function reviewWeek(o: {
  week: number
  mine: SleeperMatchup
  opp: SleeperMatchup | null
  startSlots: string[]
  posOf: (id: string) => string
  projOf: (id: string) => number
}): WeekReview {
  const { mine } = o
  const actualOf = (id: string) => mine.players_points?.[id] ?? 0
  const roster = (mine.players ?? []).filter((id) => id && id !== '0')
  const starters = (mine.starters ?? []).map((id) => (id && id !== '0' ? id : null))
  const startSet = new Set(starters.filter(Boolean) as string[])
  const sum = (ids: (string | null)[], f: (id: string) => number) => ids.reduce((t, id) => t + (id ? f(id) : 0), 0)
  const best = (f: (id: string) => number) =>
    sum(optimalAssignment(o.startSlots, roster.map((id) => ({ id, pos: o.posOf(id), value: f(id) }))), f)
  const setProj = sum(starters, o.projOf)
  const bestProj = best(o.projOf)
  const setActual = mine.points ?? sum(starters, actualOf)
  const bestActual = best(actualOf)
  const decisions: Decision[] = []
  const bench = roster.filter((id) => !startSet.has(id))
  // each bench player is weighed against one starter at most (no double counting)
  const used = new Set<string>()
  starters.forEach((id, i) => {
    if (!id) return
    const slot = o.startSlots[i]
    const eligible = SLOT_ELIG[slot] ?? [slot]
    const rivals = bench.filter((b) => !used.has(b) && eligible.includes(o.posOf(b)))
    if (!rivals.length) return
    const s = { id, proj: o.projOf(id), actual: actualOf(id) }
    const topProj = [...rivals].sort((a, b) => o.projOf(b) - o.projOf(a))[0]
    const topActual = [...rivals].sort((a, b) => actualOf(b) - actualOf(a))[0]
    if (o.projOf(topProj) - s.proj >= MIN_EDGE) {
      const b = { id: topProj, proj: o.projOf(topProj), actual: actualOf(topProj) }
      used.add(topProj)
      decisions.push({ slot: flexLabel(slot), started: s, benched: b, verdict: b.actual > s.actual ? 'process-miss' : 'lucky' })
    } else if (actualOf(topActual) - s.actual >= UNLUCKY_BY) {
      used.add(topActual)
      decisions.push({ slot: flexLabel(slot), started: s, benched: { id: topActual, proj: o.projOf(topActual), actual: actualOf(topActual) }, verdict: 'unlucky' })
    }
  })
  const oppPts = o.opp?.points ?? null
  return {
    week: o.week,
    setProj,
    bestProj,
    processGap: Math.max(0, bestProj - setProj),
    setActual,
    bestActual,
    hindsightGap: Math.max(0, bestActual - setActual),
    result: oppPts === null ? null : setActual > oppPts ? 'W' : setActual < oppPts ? 'L' : 'T',
    margin: oppPts === null ? null : setActual - oppPts,
    decisions,
  }
}

export interface Progress {
  weeks: number
  /** weeks in which the lineup you set was within MIN_EDGE of the best projected lineup */
  optimalWeeks: number
  avgProcessGap: number
  /** average process gap in the first and second halves of the reviewed weeks (null with < 4 weeks) */
  trend: { early: number; recent: number } | null
  counts: Record<Verdict, number>
  /** slots where process misses happen most */
  focus: { slot: string; misses: number }[]
}

export function progress(reviews: WeekReview[]): Progress {
  const n = reviews.length
  const avg = (xs: WeekReview[]) => (xs.length ? xs.reduce((a, r) => a + r.processGap, 0) / xs.length : 0)
  const sorted = [...reviews].sort((a, b) => a.week - b.week)
  const half = Math.floor(n / 2)
  const counts: Record<Verdict, number> = { 'process-miss': 0, lucky: 0, unlucky: 0 }
  const bySlot = new Map<string, number>()
  for (const r of reviews)
    for (const d of r.decisions) {
      counts[d.verdict]++
      if (d.verdict !== 'unlucky') bySlot.set(d.slot, (bySlot.get(d.slot) ?? 0) + 1)
    }
  return {
    weeks: n,
    optimalWeeks: reviews.filter((r) => r.processGap < MIN_EDGE).length,
    avgProcessGap: avg(reviews),
    trend: n >= 4 ? { early: avg(sorted.slice(0, half)), recent: avg(sorted.slice(half)) } : null,
    counts,
    focus: [...bySlot].map(([slot, misses]) => ({ slot, misses })).sort((a, b) => b.misses - a.misses),
  }
}
