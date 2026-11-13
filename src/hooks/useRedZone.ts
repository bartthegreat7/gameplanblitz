import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { currentLeaders, diffSnaps, mergeEvents, snapOf, starterAlerts, type RzEvent, type Snap } from '../lib/analytics/redzone'
import { useLeagueBoard } from './useLeagueBoard'
import type { Ready } from './useLeagueData'

interface Log {
  snap: Snap | null
  events: RzEvent[]
}

/* The event log lives in sessionStorage (this tab only), behind a tiny external store so the
   effect that records a new Sleeper update never sets React state directly. */
const EMPTY: Log = { snap: null, events: [] }
const cache = new Map<string, Log>()
const listeners = new Set<() => void>()

function read(key: string): Log {
  const hit = cache.get(key)
  if (hit) return hit
  let v = EMPTY
  try {
    const raw = sessionStorage.getItem(key)
    if (raw) v = JSON.parse(raw) as Log
  } catch {
    /* unavailable storage: start empty */
  }
  cache.set(key, v)
  return v
}

function write(key: string, v: Log) {
  cache.set(key, v)
  try {
    sessionStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Test hook: forget every log. */
export const resetRedZone = () => cache.clear()

/** The live league board plus what changed between Sleeper updates while this tab was open. */
export function useRedZone(data: Ready) {
  const { model: m, league, week } = data
  const board = useLeagueBoard(data)
  const key = `gb-redzone-${league.league_id}-${week}`
  const log = useSyncExternalStore(subscribe, () => read(key))

  useEffect(() => {
    if (!board.updatedAt || board.games.length === 0) return
    const prev = read(key)
    if (prev.snap?.at === board.updatedAt) return
    const next = snapOf(board.games, board.updatedAt, week)
    const fresh = diffSnaps(prev.snap, next, board.games, { team: m.teamName, player: m.name })
    write(key, { snap: next, events: mergeEvents(prev.events, fresh) })
  }, [key, board.updatedAt, board.games, week, m])

  const leaders = useMemo(() => currentLeaders(board.games), [board.games])
  const alerts = useMemo(() => starterAlerts(board.games), [board.games])
  return { ...board, events: log.events, leaders, alerts }
}
