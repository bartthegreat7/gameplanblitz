import { HttpError, getJson } from './sleeper'

/* The app reads news from one place:
   - by default, the static news.json that the aggregator (scripts/news) publishes with the site;
   - optionally, a Worker at VITE_NEWS_API (public URL, not a secret) with the same response shape.
   The browser never contacts publishers directly. */

export const NEWS_API: string = (import.meta.env.VITE_NEWS_API ?? '').replace(/\/+$/, '')
export const newsSource: 'worker' | 'static' = NEWS_API ? 'worker' : 'static'
export const newsUrl = () => (NEWS_API ? `${NEWS_API}/api/news?limit=400` : `${import.meta.env.BASE_URL}news.json`)

export interface ArticlePlayer {
  id: string
  name: string
}

export interface Article {
  id: string
  title: string
  url: string
  publisher?: string
  publisherId?: string
  /** "news" = short player-news blurb, "article" = analysis */
  kind?: 'news' | 'article'
  author?: string | null
  ts?: number | string
  published?: string
  excerpt?: string
  image?: string | null
  categories?: string[]
  /** legacy single category (Worker shape) */
  category?: string
  /** players the aggregator matched by full name (absent in legacy responses) */
  players?: ArticlePlayer[]
  tags?: string[]
}

export interface SourceStatus {
  id: string
  name: string
  homepage: string
  kind: 'news' | 'article'
  ok: boolean
  count: number
  error: string | null
  fetchedAt: string
  lastSuccess: string | null
  note: string
}

export interface NewsResponse {
  updated?: string | number
  sources?: SourceStatus[]
  unavailable?: { name: string; reason: string }[]
  categories?: string[]
  publishers?: string[]
  articles: Article[]
  playersMatched?: boolean
}

/** The news file hasn't been published yet (e.g. local development before the first CI run). */
export class NewsNotPublished extends Error {
  constructor() {
    super('The news feed has not been published yet')
  }
}

export async function getNews(): Promise<NewsResponse> {
  try {
    const data = await getJson<Partial<NewsResponse>>(newsUrl())
    return { ...data, articles: Array.isArray(data.articles) ? data.articles.filter((a) => a && a.id && a.title && a.url) : [] }
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new NewsNotPublished()
    throw e
  }
}

/** Article categories, whichever shape the source used. */
export const categoriesOf = (a: Article): string[] => a.categories ?? (a.category ? [a.category] : [])

/* ---- legacy matching, used only when a response has no `players` (Worker shape) ---- */

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

/** Roster players mentioned in an article's title/excerpt (legacy, looser matching). */
export function matchPlayers(article: Pick<Article, 'title' | 'excerpt'>, index: NameKey[]): string[] {
  const text = `${article.title ?? ''} ${article.excerpt ?? ''}`.toLowerCase()
  return [...new Set(index.filter((i) => text.includes(i.key)).map((i) => i.playerId))]
}

/**
 * Player ids an article is about. Uses the aggregator's full-name matches when present; otherwise
 * falls back to the legacy matcher restricted to `candidates`.
 */
export function playerIdsOf(a: Article, candidates: string[], players: Parameters<typeof buildNameIndex>[1]): string[] {
  if (a.players) return a.players.map((p) => p.id)
  return matchPlayers(a, buildNameIndex(candidates, players))
}
