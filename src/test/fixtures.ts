import { createModel } from '../lib/model'
import type { PlayerMap, SleeperRoster, SleeperUser, StatLine } from '../lib/sleeper'

/** Scoring `{ pts: 1 }` lets a fixture projection `{ pts: X }` equal exactly X points. */
export const SCORING = { pts: 1 }

export function player(id: string, position: string, extra: Partial<PlayerMap[string]> = {}) {
  return { player_id: id, position, team: 'AAA', first_name: id, last_name: 'Player', ...extra }
}

export function roster(id: number, owner: string, players: string[], settings: SleeperRoster['settings'] = {}): SleeperRoster {
  return { roster_id: id, owner_id: owner, players, starters: [], settings }
}

export function users(): SleeperUser[] {
  return [
    { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'My Team' } },
    { user_id: 'u2', display_name: 'Rival', avatar: null },
  ]
}

export function projMap(entries: Record<string, number>): Map<string, StatLine> {
  return new Map(Object.entries(entries).map(([id, pts]) => [id, { pts }]))
}

export function buildModel(opts: {
  players: PlayerMap
  rosters: SleeperRoster[]
  startSlots: string[]
  proj: Record<string, number>
  seasonStats?: Record<string, StatLine> | null
  fc?: Record<string, number> | null
  myRosterId?: number
}) {
  return createModel({
    players: opts.players,
    rosters: opts.rosters,
    users: users(),
    scoring: SCORING,
    startSlots: opts.startSlots,
    proj: projMap(opts.proj),
    seasonStats: opts.seasonStats ?? null,
    fc: opts.fc ? new Map(Object.entries(opts.fc).map(([id, value]) => [id, { value, rank: 1 }])) : null,
    myRosterId: opts.myRosterId ?? 1,
  })
}
