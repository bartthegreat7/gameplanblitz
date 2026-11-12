import { getJson } from './sleeper'

const FC = 'https://api.fantasycalc.com/values/current'

export interface FcValue {
  value: number
  rank: number
}

export interface FcRow {
  player?: { sleeperId?: string | null; name?: string; position?: string }
  value: number
  overallRank: number
}

export interface FcParams {
  teams: number
  /** league scoring `rec` (points per reception), default 1 */
  ppr: number
  /** count of QB + SUPER_FLEX starting slots (min 1) */
  qbs: number
}

export function fcParamsFor(opts: {
  numTeams?: number
  rosterCount: number
  scoring: Record<string, number>
  startSlots: string[]
}): FcParams {
  return {
    teams: opts.numTeams || opts.rosterCount || 12,
    ppr: typeof opts.scoring.rec === 'number' ? opts.scoring.rec : 1,
    qbs: Math.max(1, opts.startSlots.filter((p) => p === 'QB' || p === 'SUPER_FLEX').length),
  }
}

/** Key for a future draft pick of a given season and round. */
export const pickKey = (season: string | number, round: number) => `${season}-${round}`

/** Generic pick rows only, e.g. "2027 1st". The Early/Mid/Late variants need a projected draft slot we don't have. */
const PICK_NAME = /^(\d{4}) (\d)(?:st|nd|rd|th)$/

export interface FcData {
  /** sleeperId → value and overall rank */
  players: Map<string, FcValue>
  /** pickKey(season, round) → value; empty on the redraft scale, which has no picks */
  picks: Map<string, number>
}

export function parseFcData(rows: FcRow[]): FcData {
  const players = new Map<string, FcValue>()
  const picks = new Map<string, number>()
  for (const row of rows) {
    if (row.player?.position === 'PICK') {
      const m = PICK_NAME.exec(row.player.name ?? '')
      if (m) picks.set(pickKey(m[1], Number(m[2])), row.value)
      continue
    }
    const sid = row.player?.sleeperId
    if (sid) players.set(sid, { value: row.value, rank: row.overallRank })
  }
  return { players, picks }
}

/**
 * Trade values. `dynasty` selects FantasyCalc's dynasty scale, the only one that prices picks:
 * players and picks must come from the same scale to be comparable. Callers should degrade
 * gracefully if this throws.
 */
export async function getFantasyCalcData(p: FcParams, dynasty: boolean): Promise<FcData> {
  return parseFcData(await getJson<FcRow[]>(`${FC}?isDynasty=${dynasty}&numQbs=${p.qbs}&numTeams=${p.teams}&ppr=${p.ppr}`))
}

/** sleeperId → {value, rank} on the redraft scale. */
export async function getFantasyCalc(p: FcParams): Promise<Map<string, FcValue>> {
  return (await getFantasyCalcData(p, false)).players
}
