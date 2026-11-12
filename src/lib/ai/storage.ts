import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval'

import type { Answer } from './assistant'
import type { Fact } from './facts'

/* Private, on-device storage for the AI Fantasy GM conversation (IndexedDB). Nothing here is uploaded. When IndexedDB is unavailable (private windows, tests),
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
const chat = () => (chatKv ??= kvStore('gb-gm-chat'))

/** Test hook: forget in-memory data. */
export function resetAiStorage() {
  memory.clear()
  chatKv = null
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

/** The retired Podcast Studio kept episodes and audio in its own database: remove it (best effort). */
try {
  if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('gb-studio')
} catch {
  /* nothing to clean up */
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
