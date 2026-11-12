import { toMillis } from './format'
import { categoriesOf, type Article } from './news'

/* Pure helpers behind the News & Articles hub. Mentions describe coverage, never recommendations. */

export const tsOf = (a: Article) => {
  const t = toMillis(a.ts, a.published)
  return Number.isFinite(t) ? t : 0
}

export const newestFirst = (list: Article[]) => [...list].sort((a, b) => tsOf(b) - tsOf(a))

const HOUR = 3_600_000

/** Short player-news items from the last `hours`, newest first. */
export function breakingNews(articles: Article[], now: number, hours = 24): Article[] {
  return newestFirst(articles).filter(
    (a) => (a.kind === 'news' || categoriesOf(a).includes('Breaking News')) && now - tsOf(a) <= hours * HOUR,
  )
}

/** Publishers listed first when picking featured pieces (the ones you asked to prioritize). */
export const PRIORITY_PUBLISHERS = ['4for4', 'fantasypros']

/**
 * Featured analysis: recent articles (not news blurbs), preferring ones that fit a fantasy category,
 * then a publisher-supplied image, then priority publishers; at most one per publisher so no single
 * feed dominates.
 */
export function featured(articles: Article[], now: number, count = 4, hours = 72): Article[] {
  const recent = newestFirst(articles).filter((a) => a.kind !== 'news' && now - tsOf(a) <= hours * HOUR)
  const score = (a: Article) =>
    (categoriesOf(a).length ? 4 : 0) + (a.image ? 2 : 0) + (PRIORITY_PUBLISHERS.includes(a.publisherId ?? '') ? 1 : 0)
  const ranked = [...recent].sort((a, b) => score(b) - score(a) || tsOf(b) - tsOf(a))
  const out: Article[] = []
  const seen = new Set<string>()
  for (const a of ranked) {
    const pub = a.publisher ?? ''
    if (seen.has(pub)) continue
    seen.add(pub)
    out.push(a)
    if (out.length >= count) break
  }
  return out
}

export interface TrendingPlayer {
  id: string
  name: string
  /** distinct publishers covering him in the window */
  publishers: number
  articles: number
}

/** Players covered by at least `minPublishers` different publishers in the last `hours`. */
export function trendingPlayers(articles: Article[], now: number, hours = 72, minPublishers = 2): TrendingPlayer[] {
  const acc = new Map<string, { name: string; pubs: Set<string>; n: number }>()
  for (const a of articles) {
    if (now - tsOf(a) > hours * HOUR) continue
    for (const p of a.players ?? []) {
      const e = acc.get(p.id) ?? { name: p.name, pubs: new Set<string>(), n: 0 }
      e.pubs.add(a.publisher ?? '?')
      e.n++
      acc.set(p.id, e)
    }
  }
  return [...acc]
    .map(([id, e]) => ({ id, name: e.name, publishers: e.pubs.size, articles: e.n }))
    .filter((t) => t.publishers >= minPublishers)
    .sort((a, b) => b.publishers - a.publishers || b.articles - a.articles || a.name.localeCompare(b.name))
}

/** Articles mentioning any of `ids`, newest first. */
export function mentioning(articles: Article[], ids: Set<string>, idsOf: (a: Article) => string[]): Article[] {
  if (ids.size === 0) return []
  return newestFirst(articles).filter((a) => idsOf(a).some((id) => ids.has(id)))
}

export const LONG_TERM_CATEGORIES = ['Dynasty Football', 'Keeper Strategy', 'NFL Draft', 'Rest-of-Season Rankings']

/** Keeper & dynasty intelligence: long-term categories, or coverage of rookies. */
export function longTerm(articles: Article[], isRookie: (id: string) => boolean, idsOf: (a: Article) => string[]): Article[] {
  return newestFirst(articles).filter((a) => categoriesOf(a).some((c) => LONG_TERM_CATEGORIES.includes(c)) || idsOf(a).some(isRookie))
}

export type DateRange = 'all' | '24h' | '3d' | '7d'
export type SortOrder = 'newest' | 'oldest'
export type Scope = 'all' | 'saved' | 'unread'

export interface Filters {
  /** words in the title (and excerpt) */
  q: string
  /** words in a tagged player's name */
  player: string
  team: string
  position: string
  publisher: string
  category: string
  range: DateRange
  sort: SortOrder
  scope: Scope
}

export const EMPTY_FILTERS: Filters = { q: '', player: '', team: '', position: '', publisher: '', category: '', range: 'all', sort: 'newest', scope: 'all' }

const RANGE_HOURS: Record<DateRange, number> = { all: Infinity, '24h': 24, '3d': 72, '7d': 168 }

export interface FilterContext {
  now: number
  saved: string[]
  read: string[]
  /** team and position of a player id (from the Sleeper player book) */
  playerInfo: (id: string) => { team: string; pos: string } | null
  idsOf: (a: Article) => string[]
}

export function filterArticles(articles: Article[], f: Filters, ctx: FilterContext): Article[] {
  const q = f.q.trim().toLowerCase()
  const pq = f.player.trim().toLowerCase()
  const out = articles.filter((a) => {
    if (q && !`${a.title} ${a.excerpt ?? ''}`.toLowerCase().includes(q)) return false
    if (f.publisher && a.publisher !== f.publisher) return false
    if (f.category && !categoriesOf(a).includes(f.category)) return false
    if (ctx.now - tsOf(a) > RANGE_HOURS[f.range] * HOUR) return false
    if (f.scope === 'saved' && !ctx.saved.includes(a.id)) return false
    if (f.scope === 'unread' && ctx.read.includes(a.id)) return false
    if (pq && !(a.players ?? []).some((p) => p.name.toLowerCase().includes(pq))) return false
    if (f.team || f.position) {
      const infos = ctx.idsOf(a).map(ctx.playerInfo).filter((x): x is { team: string; pos: string } => !!x)
      if (!infos.some((i) => (!f.team || i.team === f.team) && (!f.position || i.pos === f.position))) return false
    }
    return true
  })
  const sorted = newestFirst(out)
  return f.sort === 'oldest' ? sorted.reverse() : sorted
}
