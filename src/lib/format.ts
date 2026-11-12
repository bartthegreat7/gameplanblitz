export const f1 = (n: number | null | undefined) => (Math.round((+(n ?? 0) || 0) * 10) / 10).toFixed(1)

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Truncate with an ellipsis. */
export const trunc = (s: string, max = 20) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

export function relTime(ms: number, now = Date.now()): string {
  const m = Math.round((now - ms) / 60000)
  if (!Number.isFinite(m)) return ''
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}d ago` : new Date(ms).toLocaleDateString()
}

/** Accepts seconds or milliseconds, or a date string. NaN if unparseable. */
export function toMillis(ts: number | string | null | undefined, published?: string): number {
  const t = ts != null ? Number(ts) : NaN
  if (Number.isFinite(t)) return t < 1e12 ? t * 1000 : t
  const p = Date.parse(published ?? '')
  return Number.isFinite(p) ? p : NaN
}

export const isHttpUrl = (u: string | null | undefined): u is string => /^https?:\/\//i.test(u ?? '')
