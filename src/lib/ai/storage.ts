import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval'

import type { Answer } from './assistant'
import type { Fact } from './facts'
import type { Chapter, EpisodeType, Format, Host, Line, Tone } from './podcast'

/* Private, on-device storage for the AI Fantasy GM conversation and Podcast Studio episodes
   (IndexedDB). Nothing here is uploaded. When IndexedDB is unavailable (private windows, tests),
   data lives in memory for the session. */

interface Kv {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  keys(): Promise<string[]>
}

const memory = new Map<string, Map<string, unknown>>()

function kvStore(db: string): Kv {
  let store: UseStore | null = null
  try {
    if (typeof indexedDB !== 'undefined') store = createStore(db, 'kv')
  } catch {
    store = null
  }
  const mem = memory.get(db) ?? new Map<string, unknown>()
  memory.set(db, mem)
  const run = async <T,>(idb: (s: UseStore) => Promise<T>, fallback: () => T): Promise<T> => {
    if (store)
      try {
        return await idb(store)
      } catch {
        /* blocked or quota: fall back to memory */
      }
    return fallback()
  }
  return {
    get: <T,>(k: string) => run(async (s) => (await get<T>(k, s)) ?? (mem.get(k) as T | undefined), () => mem.get(k) as T | undefined),
    set: (k, v) => run((s) => set(k, v, s), () => void mem.set(k, v)),
    del: (k) =>
      run(
        async (s) => {
          mem.delete(k)
          await del(k, s)
        },
        () => void mem.delete(k),
      ),
    keys: () =>
      run(
        async (s) => [...new Set([...(await keys(s)).map(String), ...mem.keys()])],
        () => [...mem.keys()],
      ),
  }
}

let chatKv: Kv | null = null
let studioKv: Kv | null = null
const chat = () => (chatKv ??= kvStore('gb-gm-chat'))
const studio = () => (studioKv ??= kvStore('gb-studio'))

/** Test hook: forget in-memory data. */
export function resetAiStorage() {
  memory.clear()
  chatKv = null
  studioKv = null
}

/* ---------------- conversation ---------------- */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  at: number
  /** the question, or the raw AI text */
  text: string
  engine?: 'built-in' | 'ai'
  answer?: Answer
  /** snapshot of the facts the answer cites, so sources survive a data refresh */
  cited?: Fact[]
  status?: 'streaming' | 'done' | 'error' | 'cancelled'
  error?: string
}

export const MAX_SAVED_MESSAGES = 60

export const loadChat = async (leagueId: string) => (await chat().get<ChatMessage[]>(leagueId)) ?? []
export const saveChat = (leagueId: string, msgs: ChatMessage[]) =>
  chat().set(
    leagueId,
    msgs.filter((m) => m.status !== 'streaming').slice(-MAX_SAVED_MESSAGES),
  )
export const clearChat = (leagueId: string) => chat().del(leagueId)

/* ---------------- episodes ---------------- */

export interface EpisodeAudio {
  engine: 'device' | 'cloud'
  /** device: voice names; cloud: Aura voice ids, per host */
  voices: string[]
  /** seconds per line (estimates for device voices) */
  durations: number[]
}

export interface Episode {
  id: string
  leagueId: string
  leagueName: string
  week: number
  createdAt: number
  type: EpisodeType
  format: Format
  tone: Tone
  title: string
  hosts: Host[]
  outline: Chapter[]
  lines: Line[]
  writer: 'built-in' | 'ai'
  /** the facts the script cites, as they were when it was written */
  facts: Fact[]
  factsAsOf: number
  audio: EpisodeAudio | null
  /** pinned to Saved episodes */
  saved: boolean
  /** NFL season (episodes before this field existed have none) */
  season?: string
  /** prepared automatically (an opted-in weekly show), not made by hand */
  auto?: boolean
}

const EP = 'ep:'
const clipKey = (id: string, i: number) => `audio:${id}:${i}`

export async function listEpisodes(leagueId?: string): Promise<Episode[]> {
  const ks = (await studio().keys()).filter((k) => k.startsWith(EP))
  const eps = (await Promise.all(ks.map((k) => studio().get<Episode>(k)))).filter(
    (e): e is Episode => !!e && (!leagueId || e.leagueId === leagueId),
  )
  return eps.sort((a, b) => b.createdAt - a.createdAt)
}
export const getEpisode = (id: string) => studio().get<Episode>(EP + id)
export const saveEpisode = (e: Episode) => studio().set(EP + e.id, e)
export const saveClip = (id: string, i: number, blob: Blob) => studio().set(clipKey(id, i), blob)
export const getClip = (id: string, i: number) => studio().get<Blob>(clipKey(id, i))

/** Deletes the episode, its transcript and every stored audio clip. */
export async function deleteEpisode(id: string) {
  const prefix = `audio:${id}:`
  const ks = (await studio().keys()).filter((k) => k.startsWith(prefix))
  await Promise.all([...ks.map((k) => studio().del(k)), studio().del(EP + id)])
}

export async function deleteClips(id: string) {
  const prefix = `audio:${id}:`
  const ks = (await studio().keys()).filter((k) => k.startsWith(prefix))
  await Promise.all(ks.map((k) => studio().del(k)))
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
