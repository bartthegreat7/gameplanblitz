import { getJson } from './sleeper'

/** Base URL of the Cloudflare Worker (baked at build time; public, not a secret). */
export const NEWS_API: string = (import.meta.env.VITE_NEWS_API ?? '').replace(/\/+$/, '')
export const newsConfigured = NEWS_API !== ''

export interface Article {
  id: string
  title: string
  url: string
  publisher?: string
  source_id?: string
  author?: string
  ts?: number | string
  published?: string
  excerpt?: string
  image?: string | null
  category?: string
  tags?: string[]
  also?: unknown[]
}

export interface NewsResponse {
  updated?: string | number
  total?: number
  count?: number
  sources?: unknown[]
  categories?: string[]
  publishers?: string[]
  articles: Article[]
}

export interface NewsQuery {
  q?: string
  publisher?: string
  category?: string
  limit?: number
  offset?: number
}

export async function getNews(query: NewsQuery = {}): Promise<NewsResponse> {
  if (!newsConfigured) throw new Error('VITE_NEWS_API is not set')
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const data = await getJson<Partial<NewsResponse>>(`${NEWS_API}/api/news?${qs}`)
  return { ...data, articles: Array.isArray(data.articles) ? data.articles : [] }
}

export interface NameKey {
  playerId: string
  key: string
}

/** Match key list for roster players: full names, plus last names of 5+ letters. */
export function buildNameIndex(
  playerIds: string[],
  players: Record<string, { position?: string | null; full_name?: string; first_name?: string; last_name?: string }>,
): NameKey[] {
  const idx: NameKey[] = []
  for (const pid of playerIds) {
    const p = players[pid]
    if (!p || p.position === 'DEF') continue
    const full = (p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()).toLowerCase()
    if (full.length > 4) idx.push({ playerId: pid, key: full })
    const ln = (p.last_name ?? '').toLowerCase()
    if (ln.length >= 5) idx.push({ playerId: pid, key: ln })
  }
  return idx
}

/** Roster players mentioned in an article's title/excerpt. */
export function matchPlayers(article: Pick<Article, 'title' | 'excerpt'>, index: NameKey[]): string[] {
  const text = `${article.title ?? ''} ${article.excerpt ?? ''}`.toLowerCase()
  return [...new Set(index.filter((i) => text.includes(i.key)).map((i) => i.playerId))]
}
