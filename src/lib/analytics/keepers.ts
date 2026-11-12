import type { Evidence } from '../evidence'
import { ordinal } from '../format'

/* Keeper intelligence: what each player would cost to keep under your league's rules, and how
   that compares with where the market would draft him next year. Rules are user-configured:
   Sleeper does not store keeper costs. */

export type CostMode = 'draft-round' | 'none'

export interface KeeperRules {
  maxKeepers: number
  /** draft-round: keeping costs the pick in the round he was drafted (earlier for each year kept) */
  costMode: CostMode
  /** rounds earlier per year already kept (e.g. 1: drafted in round 8 → round 7 the second year) */
  roundPenalty: number
  /** round charged for players who were not drafted (waiver and free-agent pickups) */
  undraftedRound: number
  /** a player kept this many years can't be kept again; 0 = no limit */
  maxYears: number
}

export function defaultRules(opts: { maxKeepers?: number; draftRounds?: number }): KeeperRules {
  const rounds = Math.max(1, opts.draftRounds ?? 15)
  return { maxKeepers: Math.max(1, opts.maxKeepers ?? 1), costMode: 'draft-round', roundPenalty: 1, undraftedRound: rounds, maxYears: 0 }
}

export interface CostResult {
  /** the round it costs; null when keepers are free (costMode none) */
  round: number | null
  /** the escalation pushed the cost to round 1 or beyond */
  capped: boolean
  basis: 'drafted' | 'undrafted' | 'free'
}

/** Cost = drafted round (or the undrafted round) − penalty × years already kept, never earlier than round 1. */
export function keeperCost(draftedRound: number | null, yearsKept: number, rules: KeeperRules): CostResult {
  if (rules.costMode === 'none') return { round: null, capped: false, basis: 'free' }
  const base = draftedRound ?? rules.undraftedRound
  const raw = base - rules.roundPenalty * Math.max(0, yearsKept)
  return { round: Math.max(1, raw), capped: raw < 1, basis: draftedRound === null ? 'undrafted' : 'drafted' }
}

/** Ineligible when he has already been kept the maximum number of years. */
export const keeperEligible = (yearsKept: number, rules: KeeperRules) => rules.maxYears <= 0 || yearsKept < rules.maxYears

/** Draft round a player of this overall rank would go in: rank 1-12 → round 1 in a 12-team league. */
export const impliedRound = (rank: number, teams: number) => Math.max(1, Math.ceil(rank / Math.max(1, teams)))

/* ---------- draft history ---------- */

export interface DraftPickLite {
  round: number
  player_id: string | null
  roster_id: number | null
  is_keeper?: boolean | null
}

/** Round each player was taken in a draft (first time he appears). */
export function draftRounds(picks: DraftPickLite[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of picks) if (p.player_id && !out.has(p.player_id) && Number.isFinite(p.round)) out.set(p.player_id, p.round)
  return out
}

/**
 * Consecutive seasons a player was a keeper, counting back from the most recent draft.
 * `drafts` is newest first; each is a season's picks (Sleeper marks keepers with is_keeper).
 */
export function yearsKept(drafts: DraftPickLite[][], playerId: string): number {
  let n = 0
  for (const picks of drafts) {
    if (picks.some((p) => p.player_id === playerId && p.is_keeper)) n++
    else break
  }
  return n
}

/* ---------- evaluation ---------- */

export interface KeeperInput {
  id: string
  name: string
  pos: string
  /** round drafted in this season's draft, null if he was not drafted */
  draftedRound: number | null
  yearsKept: number
  /** rank among players on FantasyCalc's dynasty board (1 = most valuable), null if unranked */
  dynastyRank: number | null
  dynastyValue: number | null
  /** this season's points per game in league scoring, context only */
  ppg: number | null
}

export interface KeeperCandidate extends KeeperInput {
  cost: CostResult
  eligible: boolean
  /** round the market would draft him in, from his dynasty rank */
  marketRound: number | null
  /** cost round − market round: positive = keeping him is cheaper than drafting him (rounds of value) */
  surplus: number | null
  recommended: boolean
  reasons: string[]
  evidence: Evidence[]
}

export function evaluateKeepers(players: KeeperInput[], rules: KeeperRules, teams: number): KeeperCandidate[] {
  const cands = players.map<KeeperCandidate>((p) => {
    const cost = keeperCost(p.draftedRound, p.yearsKept, rules)
    const eligible = keeperEligible(p.yearsKept, rules)
    const marketRound = p.dynastyRank !== null ? impliedRound(p.dynastyRank, teams) : null
    const surplus = cost.round !== null && marketRound !== null ? cost.round - marketRound : null
    const reasons: string[] = []
    if (!eligible) reasons.push(`Kept ${p.yearsKept} year${p.yearsKept === 1 ? '' : 's'} already: your rules allow ${rules.maxYears}.`)
    if (cost.basis === 'free') reasons.push('Keepers cost nothing under your rules, so value alone decides.')
    else {
      reasons.push(
        `Costs a ${ordinal(cost.round!)}-round pick (${cost.basis === 'undrafted' ? `undrafted players cost round ${rules.undraftedRound}` : `drafted in round ${p.draftedRound}`}${p.yearsKept ? `, ${p.yearsKept} year${p.yearsKept === 1 ? '' : 's'} kept` : ''}).`,
      )
      if (cost.capped) reasons.push('The yearly escalation already reaches round 1.')
    }
    if (marketRound !== null && p.dynastyRank !== null)
      reasons.push(`FantasyCalc's dynasty board ranks him #${p.dynastyRank}, roughly a ${ordinal(marketRound)}-round pick in a ${teams}-team league.`)
    else reasons.push('Not on FantasyCalc\'s dynasty board, so his market value is unknown.')
    if (surplus !== null)
      reasons.push(surplus > 0 ? `Keeping him saves about ${surplus} round${surplus === 1 ? '' : 's'} of draft value.` : surplus === 0 ? 'His cost matches his market value: no saving.' : `He costs ${-surplus} round${surplus === -1 ? '' : 's'} more than the market would draft him.`)
    const evidence: Evidence[] = [
      { label: 'Keeper cost', value: cost.round !== null ? `Round ${cost.round}` : 'Free', source: `Your keeper rules${p.draftedRound !== null ? `; draft round from your league's Sleeper draft` : ''}` },
      { label: 'Market value', value: p.dynastyRank !== null ? `#${p.dynastyRank} (${Math.round(p.dynastyValue ?? 0).toLocaleString()})` : 'unranked', source: 'FantasyCalc dynasty values' },
    ]
    if (p.ppg !== null) evidence.push({ label: 'This season', value: `${p.ppg.toFixed(1)} pts/game`, source: 'Sleeper season stats, your scoring' })
    return { ...p, cost, eligible, marketRound, surplus, recommended: false, reasons, evidence }
  })

  // recommend the best eligible players by surplus (or, when keepers are free, by market value)
  const score = (c: KeeperCandidate) => (rules.costMode === 'none' ? -(c.dynastyRank ?? Infinity) : (c.surplus ?? -Infinity))
  const pool = cands.filter((c) => c.eligible && (rules.costMode === 'none' ? c.dynastyRank !== null : (c.surplus ?? -1) > 0))
  pool.sort((a, b) => score(b) - score(a) || (a.dynastyRank ?? Infinity) - (b.dynastyRank ?? Infinity))
  for (const c of pool.slice(0, rules.maxKeepers)) c.recommended = true

  return cands.sort((a, b) => Number(b.recommended) - Number(a.recommended) || score(b) - score(a) || (a.dynastyRank ?? Infinity) - (b.dynastyRank ?? Infinity))
}
