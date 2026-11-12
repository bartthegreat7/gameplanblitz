/* Client-side daily allowance for paid AI calls, a first line of cost control (the Worker enforces
   its own quotas and rate limits). Stored per browser; resets at local midnight. */

export type QuotaKind = 'chat'

export const LOCAL_LIMITS: Record<QuotaKind, number> = { chat: 30 }

const KEY = 'gb-ai-usage'
const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

type Usage = { day: string } & Record<QuotaKind, number>

function read(now?: Date): Usage {
  const empty: Usage = { day: today(now), chat: 0 }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Usage | null
    return raw && raw.day === empty.day ? { ...empty, ...raw } : empty
  } catch {
    return empty
  }
}

export const usedToday = (kind: QuotaKind, now?: Date) => read(now)[kind]
export const remainingToday = (kind: QuotaKind, now?: Date) => Math.max(0, LOCAL_LIMITS[kind] - read(now)[kind])
export const canSpend = (kind: QuotaKind, amount = 1, now?: Date) => read(now)[kind] + amount <= LOCAL_LIMITS[kind]

export function record(kind: QuotaKind, amount = 1, now?: Date) {
  const u = read(now)
  u[kind] += amount
  try {
    localStorage.setItem(KEY, JSON.stringify(u))
  } catch {
    /* storage blocked: the Worker's quota still applies */
  }
}
