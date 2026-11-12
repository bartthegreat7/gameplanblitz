import type { FcValue } from './fantasycalc'
import { optimalLineup, STARTABLE } from './lineup'
import { pointsFor, seasonPPG, type Scoring } from './scoring'
import type { PlayerMap, SleeperRoster, SleeperUser, StatLine } from './sleeper'

export interface ModelInput {
  players: PlayerMap
  rosters: SleeperRoster[]
  users: SleeperUser[]
  scoring: Scoring
  startSlots: string[]
  proj: Map<string, StatLine>
  seasonStats: Record<string, StatLine> | null
  fc: Map<string, FcValue> | null
  myRosterId: number
}

export interface FreeAgent {
  id: string
  pos: string
  pj: number
  inj: string
}

/** Read-only lookup helpers over a loaded league. Pure: no I/O, no React. */
export function createModel(i: ModelInput) {
  const pos = (pid: string) => {
    const p = i.players[pid]
    return p ? p.position || p.fantasy_positions?.[0] || '' : ''
  }
  const name = (pid: string) => {
    const p = i.players[pid]
    if (!p) return pid
    if (p.position === 'DEF') return `${p.first_name || p.player_id || ''} D/ST`
    return p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || pid
  }
  const shortName = (pid: string) => {
    const p = i.players[pid]
    if (!p) return pid
    if (p.position === 'DEF') return `${p.team || pid} D/ST`
    const fn = p.first_name ?? ''
    const ln = p.last_name ?? ''
    return (fn ? `${fn[0]}. ` : '') + ln || name(pid)
  }
  const team = (pid: string) => {
    const p = i.players[pid]
    return p ? p.team || p.player_id || '' : ''
  }
  const injury = (pid: string) => i.players[pid]?.injury_status || ''
  const projPts = (pid: string) => pointsFor(i.proj.get(pid), i.scoring)
  const ppg = (pid: string) => seasonPPG(i.seasonStats?.[pid], i.scoring)
  const fcValue = (pid: string) => i.fc?.get(pid)?.value ?? 0
  const rosterById = (id: number) => i.rosters.find((r) => r.roster_id === id)
  const myRoster = () => rosterById(i.myRosterId)
  const optimal = (ids: string[]) => optimalLineup(ids, i.startSlots, pos, projPts)

  const teamName = (rosterId: number) => {
    const r = rosterById(rosterId)
    if (!r) return `Team ${rosterId}`
    const u = i.users.find((x) => x.user_id === r.owner_id)
    return u ? u.metadata?.team_name || u.display_name || `Team ${rosterId}` : `Team ${rosterId}`
  }
  const ownerOf = (rosterId: number) => {
    const r = rosterById(rosterId)
    return i.users.find((x) => x.user_id === r?.owner_id) ?? null
  }

  const allRostered = () => {
    const s = new Set<string>()
    for (const r of i.rosters) for (const p of r.players ?? []) s.add(p)
    return s
  }

  let faCache: FreeAgent[] | null = null
  /** Unrostered, startable, with a real team (or DEF) and a positive projection. */
  const freeAgents = (): FreeAgent[] => {
    if (faCache) return faCache
    const rostered = allRostered()
    const out: FreeAgent[] = []
    for (const pid in i.players) {
      if (rostered.has(pid)) continue
      const p = i.players[pid]
      if (!p || !p.position || !STARTABLE.has(p.position)) continue
      if (p.position !== 'DEF' && !p.team) continue
      const pj = projPts(pid)
      if (pj > 0) out.push({ id: pid, pos: p.position, pj, inj: p.injury_status || '' })
    }
    return (faCache = out)
  }

  return {
    ...i,
    pos,
    name,
    shortName,
    team,
    injury,
    projPts,
    ppg,
    fcValue,
    rosterById,
    myRoster,
    optimal,
    teamName,
    ownerOf,
    allRostered,
    freeAgents,
  }
}

export type Model = ReturnType<typeof createModel>
