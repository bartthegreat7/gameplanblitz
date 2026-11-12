import { flexLabel, OUT_INJ } from '../lineup'
import type { Model } from '../model'
import { winProbability } from '../scoring'
import type { SleeperMatchup } from '../sleeper'
import { optimalAssignment } from './lineupPlan'

/* Opponent scouting. Facts (Sleeper scores, set lineups, injury designations) are kept apart from
   model output (projected lineups and strengths). Nothing here predicts what a manager will do. */

/* ---------- results so far ---------- */

export interface WeeklyScore {
  week: number
  points: number
  opponentPoints: number
  opponentRosterId: number | null
  result: 'W' | 'L' | 'T'
}

/** Completed weeks for one roster, from Sleeper matchups. A week counts once anyone has scored. */
export function scoreHistory(weeks: { week: number; matchups: SleeperMatchup[] }[], rosterId: number): WeeklyScore[] {
  const out: WeeklyScore[] = []
  for (const { week, matchups } of [...weeks].sort((a, b) => a.week - b.week)) {
    const me = matchups.find((x) => x.roster_id === rosterId)
    if (!me || me.matchup_id === null) continue
    const opp = matchups.find((x) => x.matchup_id === me.matchup_id && x.roster_id !== rosterId)
    const points = me.points ?? 0
    const opponentPoints = opp?.points ?? 0
    if (points <= 0 && opponentPoints <= 0) continue // not played yet
    out.push({
      week,
      points,
      opponentPoints,
      opponentRosterId: opp?.roster_id ?? null,
      result: points > opponentPoints ? 'W' : points < opponentPoints ? 'L' : 'T',
    })
  }
  return out
}

/** A swing of this many points per game (last 3 vs season) is called hot or cold. */
export const TEAM_FORM_POINTS = 8

export interface TeamForm {
  games: number
  avg: number
  last3: number
  high: number
  low: number
  label: 'hot' | 'steady' | 'cold'
  /** e.g. "W3" or "L1"; empty with no games */
  streak: string
  record: string
}

export function teamForm(history: WeeklyScore[]): TeamForm | null {
  if (history.length === 0) return null
  const pts = history.map((h) => h.points)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const avg = mean(pts)
  const last3 = mean(pts.slice(-3))
  const last = history[history.length - 1].result
  let n = 0
  for (let i = history.length - 1; i >= 0 && history[i].result === last; i--) n++
  const count = (r: string) => history.filter((h) => h.result === r).length
  const t = count('T')
  return {
    games: history.length,
    avg,
    last3,
    high: Math.max(...pts),
    low: Math.min(...pts),
    label: last3 - avg >= TEAM_FORM_POINTS ? 'hot' : last3 - avg <= -TEAM_FORM_POINTS ? 'cold' : 'steady',
    streak: `${last}${n}`,
    record: `${count('W')}-${count('L')}${t ? `-${t}` : ''}`,
  }
}

/* ---------- projected lineups and positional strength (model) ---------- */

export type Group = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'K' | 'DEF' | 'OTHER'
export const groupOf = (slot: string): Group =>
  (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const).find((g) => g === slot) ?? (/FLEX|WRT/.test(slot) ? 'FLEX' : 'OTHER')

/** This week's projection a lineup can count on: 0 for players listed Out/IR/etc. */
const usable = (m: Model, id: string) => (OUT_INJ.has(m.injury(id)) ? 0 : m.projPts(id))

export interface ProjectedSlot {
  slot: string
  label: string
  group: Group
  id: string | null
  proj: number
}

/** Best projected lineup from a roster (exact optimizer, this week's Sleeper projections). Players listed
 *  Out/IR/etc. are left out entirely, so a slot nobody healthy can fill shows as empty. */
export function projectedLineup(m: Model, rosterId: number): ProjectedSlot[] {
  const r = m.rosterById(rosterId)
  const away = new Set([...(r?.reserve ?? []), ...(r?.taxi ?? [])])
  const ids = (r?.players ?? []).filter((id) => !away.has(id) && !OUT_INJ.has(m.injury(id)))
  const picks = optimalAssignment(m.startSlots, ids.map((id) => ({ id, pos: m.pos(id), value: usable(m, id) })))
  return m.startSlots.map((slot, i) => ({ slot, label: flexLabel(slot), group: groupOf(slot), id: picks[i], proj: picks[i] ? usable(m, picks[i]!) : 0 }))
}

export interface GroupStrength {
  group: Group
  /** projected points from this group's starting slots */
  proj: number
  leagueAvg: number
  /** 1 = strongest in the league */
  rank: number
  of: number
}

export function groupTotals(line: ProjectedSlot[]): Map<Group, number> {
  const t = new Map<Group, number>()
  for (const s of line) t.set(s.group, (t.get(s.group) ?? 0) + s.proj)
  return t
}

/** Each roster's projected strength at each position group, ranked across the league. */
export function positionStrengths(m: Model, rosterId: number): GroupStrength[] {
  const all = m.rosters.map((r) => ({ id: r.roster_id, totals: groupTotals(projectedLineup(m, r.roster_id)) }))
  const mine = all.find((x) => x.id === rosterId)
  if (!mine) return []
  const groups = [...new Set(m.startSlots.map(groupOf))]
  return groups.map((g) => {
    const vals = all.map((x) => x.totals.get(g) ?? 0)
    const proj = mine.totals.get(g) ?? 0
    return {
      group: g,
      proj,
      leagueAvg: vals.reduce((a, b) => a + b, 0) / vals.length,
      rank: 1 + vals.filter((v) => v > proj + 1e-9).length,
      of: vals.length,
    }
  })
}

export interface HeadToHead {
  groups: { group: Group; mine: number; theirs: number; edge: number }[]
  myProj: number
  theirProj: number
  /** 0-100, the app's standard logistic model */
  winPct: number
}

export function headToHead(m: Model, myRosterId: number, theirRosterId: number): HeadToHead {
  const mine = groupTotals(projectedLineup(m, myRosterId))
  const theirs = groupTotals(projectedLineup(m, theirRosterId))
  const groups = [...new Set(m.startSlots.map(groupOf))].map((group) => {
    const a = mine.get(group) ?? 0
    const b = theirs.get(group) ?? 0
    return { group, mine: a, theirs: b, edge: a - b }
  })
  const myProj = [...mine.values()].reduce((a, b) => a + b, 0)
  const theirProj = [...theirs.values()].reduce((a, b) => a + b, 0)
  return { groups, myProj, theirProj, winPct: Math.round(100 * winProbability(myProj, theirProj)) }
}

/* ---------- facts about a set lineup ---------- */

export interface LineupFacts {
  /** slots Sleeper shows with nobody in them */
  empty: string[]
  /** starters Sleeper lists as Out/IR/etc. */
  unavailable: { id: string; injury: string }[]
  /** starters with a Questionable/Doubtful tag */
  questionable: { id: string; injury: string }[]
}

/** What Sleeper currently shows in a team's set lineup. Facts only. */
export function lineupFacts(m: Model, matchup: SleeperMatchup | null): LineupFacts | null {
  if (!matchup) return null
  const starters = matchup.starters ?? []
  const empty = m.startSlots.filter((_, i) => !starters[i] || starters[i] === '0').map(flexLabel)
  const real = starters.filter((id) => id && id !== '0')
  return {
    empty,
    unavailable: real.filter((id) => OUT_INJ.has(m.injury(id))).map((id) => ({ id, injury: m.injury(id) })),
    questionable: real.filter((id) => ['Questionable', 'Doubtful'].includes(m.injury(id))).map((id) => ({ id, injury: m.injury(id) })),
  }
}
