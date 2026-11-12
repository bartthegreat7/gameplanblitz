import { ordinal } from '../format'
import { pickKey } from '../fantasycalc'
import type { SleeperTradedPick } from '../sleeper'

/** FantasyCalc prices rounds 1-4 only. */
export const MAX_PRICED_ROUND = 4

export interface PickAsset {
  /** unique per pick: season-round-originalRosterId */
  key: string
  season: string
  round: number
  originalRosterId: number
  ownerRosterId: number
  /** FantasyCalc dynasty value, or null when the pick is not priced */
  value: number | null
  label: string
}

/**
 * Who owns which future picks. Everyone starts with their own pick in each round; Sleeper's
 * traded-pick list then moves some to other rosters.
 */
export function ownedPicks(opts: {
  rosterIds: number[]
  seasons: string[]
  rounds: number
  traded: SleeperTradedPick[]
  /** pickKey(season, round) → value */
  values: Map<string, number>
  teamName: (rosterId: number) => string
}): Map<number, PickAsset[]> {
  const rounds = Math.max(1, Math.min(opts.rounds, MAX_PRICED_ROUND))
  const moved = new Map<string, number>() // season|round|original → current owner
  for (const t of opts.traded) moved.set(`${t.season}|${t.round}|${t.roster_id}`, t.owner_id)

  const known = new Set(opts.rosterIds)
  const out = new Map<number, PickAsset[]>(opts.rosterIds.map((id) => [id, []]))
  for (const season of opts.seasons) {
    for (let round = 1; round <= rounds; round++) {
      for (const original of opts.rosterIds) {
        const owner = moved.get(`${season}|${round}|${original}`) ?? original
        if (!known.has(owner)) continue
        out.get(owner)!.push({
          key: `${season}-${round}-${original}`,
          season,
          round,
          originalRosterId: original,
          ownerRosterId: owner,
          value: opts.values.get(pickKey(season, round)) ?? null,
          label: `${season} ${ordinal(round)}-round pick${original !== owner ? ` (from ${opts.teamName(original)})` : ''}`,
        })
      }
    }
  }
  return out
}

/** Seasons that have priced picks and have not been drafted yet, ascending. */
export function futurePickSeasons(values: Map<string, number>, leagueSeason: string): string[] {
  return [...new Set([...values.keys()].map((k) => k.split('-')[0]))]
    .filter((s) => Number(s) > Number(leagueSeason))
    .sort()
}
