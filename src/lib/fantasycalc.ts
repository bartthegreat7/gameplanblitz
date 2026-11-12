import { getJson } from './sleeper'

const FC = 'https://api.fantasycalc.com/values/current'

export interface FcValue {
  value: number
  rank: number
}

interface FcRow {
  player?: { sleeperId?: string | null }
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

/** sleeperId → {value, rank}. Callers should degrade gracefully if this throws. */
export async function getFantasyCalc(p: FcParams): Promise<Map<string, FcValue>> {
  const rows = await getJson<FcRow[]>(`${FC}?isDynasty=false&numQbs=${p.qbs}&numTeams=${p.teams}&ppr=${p.ppr}`)
  const map = new Map<string, FcValue>()
  for (const row of rows) {
    const sid = row.player?.sleeperId
    if (sid) map.set(sid, { value: row.value, rank: row.overallRank })
  }
  return map
}
