/* Feed parsing, sanitizing and normalization. Pure functions (no I/O), unit-tested.
   A small purpose-built parser instead of an XML dependency: we only read a handful of
   well-known RSS 2.0 / Atom elements, and everything extracted is treated as untrusted text. */

import { categorize, type NewsCategory } from '../../src/lib/newsTaxonomy.ts'
import type { Source } from './sources.ts'

export interface RawItem {
  title: string
  link: string
  author: string | null
  published: string | null
  summary: string
  image: string | null
  categories: string[]
}

export interface ArticlePlayer {
  id: string
  name: string
}

/** What the app receives. Metadata, a short excerpt and a link only: never article bodies. */
export interface NewsArticle {
  id: string
  title: string
  url: string
  publisher: string
  publisherId: string
  kind: 'news' | 'article'
  author: string | null
  /** publication time, ms since epoch */
  ts: number
  published: string
  excerpt: string
  image: string | null
  categories: NewsCategory[]
  players: ArticlePlayer[]
  /** the publisher's own tags, cleaned */
  tags: string[]
}

export const EXCERPT_MAX = 240

/* ---------- text ---------- */

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

const unwrapCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')

/** Untrusted markup → plain text: drop scripts/styles, strip tags, decode entities (twice, for double-encoded feeds). */
export function cleanText(s: string): string {
  let t = decodeEntities(unwrapCdata(s))
  t = t.replace(/<(script|style|iframe)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
  t = decodeEntities(t).replace(/<[^>]*>/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/** A short excerpt cut at a word boundary. Drops WordPress "The post … appeared first on …" footers. */
export function excerptOf(s: string, max = EXCERPT_MAX): string {
  const t = s.replace(/\s*The post .{1,300}? appeared first on .{1,120}?\.?\s*$/i, '').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '')}…`
}

/** http(s) URLs only; optionally restricted to the publisher's own domain (or a subdomain). */
export function safeUrl(u: string | null | undefined, domain?: string): string | null {
  if (!u) return null
  try {
    const url = new URL(decodeEntities(u.trim()))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (domain) {
      const host = url.hostname.replace(/^www\./, '')
      const d = domain.replace(/^www\./, '')
      if (host !== d && !host.endsWith(`.${d}`)) return null
    }
    return url.toString()
  } catch {
    return null
  }
}

/** Same article, same id: drop the fragment, tracking parameters and a trailing slash. */
export function canonicalUrl(u: string): string {
  const url = new URL(u)
  url.hash = ''
  for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_|ref$)/i.test(k)) url.searchParams.delete(k)
  url.hostname = url.hostname.replace(/^www\./, '')
  let s = url.toString()
  if (url.pathname.length > 1 && s.endsWith('/') && !url.search) s = s.slice(0, -1)
  return s
}

/** Deterministic 64-bit FNV-1a hex digest (two 32-bit lanes). Not cryptographic; an id, nothing more. */
export function hashId(s: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/* ---------- parsing ---------- */

const tag = (block: string, name: string): string | null => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block)
  return m ? m[1] : null
}
const attr = (el: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(el)
  return m ? (m[2] ?? m[3] ?? null) : null
}

function imageOf(block: string): string | null {
  for (const re of [/<media:content\b[^>]*>/gi, /<media:thumbnail\b[^>]*>/gi, /<enclosure\b[^>]*>/gi]) {
    for (const el of block.match(re) ?? []) {
      const url = attr(el, 'url')
      const type = attr(el, 'type') ?? attr(el, 'medium') ?? ''
      if (url && (!type || /image/i.test(type))) return url
    }
  }
  return null
}

export function parseFeed(xml: string): RawItem[] {
  const isAtom = /<feed\b[^>]*>/i.test(xml) && /<entry\b/i.test(xml)
  const blocks = [...xml.matchAll(isAtom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1])
  return blocks.map((b) => {
    if (isAtom) {
      const links = b.match(/<link\b[^>]*>/gi) ?? []
      const alt = links.find((l) => !attr(l, 'rel') || attr(l, 'rel') === 'alternate') ?? links[0] ?? ''
      return {
        title: cleanText(tag(b, 'title') ?? ''),
        link: (attr(alt, 'href') ?? '').trim(),
        author: cleanText(tag(tag(b, 'author') ?? '', 'name') ?? '') || null,
        published: (tag(b, 'published') ?? tag(b, 'updated'))?.trim() ?? null,
        summary: cleanText(tag(b, 'summary') ?? ''),
        image: imageOf(b),
        categories: (b.match(/<category\b[^>]*>/gi) ?? []).map((c) => cleanText(attr(c, 'term') ?? attr(c, 'label') ?? '')).filter(Boolean),
      }
    }
    return {
      title: cleanText(tag(b, 'title') ?? ''),
      link: cleanText(tag(b, 'link') ?? ''),
      author: cleanText(tag(b, 'dc:creator') ?? tag(b, 'author') ?? '') || null,
      published: (tag(b, 'pubDate') ?? tag(b, 'dc:date'))?.trim() ?? null,
      // the <description> summary only; <content:encoded> (full article) is deliberately ignored
      summary: cleanText(tag(b, 'description') ?? ''),
      image: imageOf(b),
      categories: [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => cleanText(m[1])).filter(Boolean),
    }
  })
}

/* ---------- normalization ---------- */

const domainOf = (homepage: string) => new URL(homepage).hostname

/** One feed item → article, or null when it lacks a title or a link to the publisher's own site. */
export function normalizeItem(raw: RawItem, source: Source, now: number): NewsArticle | null {
  const url = safeUrl(raw.link, domainOf(source.homepage))
  if (!raw.title || !url) return null
  const parsed = raw.published ? Date.parse(raw.published) : NaN
  // never in the future (clock skew), never missing
  const ts = Number.isFinite(parsed) ? Math.min(parsed, now) : now
  const excerpt = excerptOf(raw.summary)
  const tags = raw.categories.slice(0, 12)
  return {
    id: hashId(canonicalUrl(url)),
    title: raw.title.slice(0, 300),
    url,
    publisher: source.name,
    publisherId: source.id,
    kind: source.kind,
    author: raw.author?.slice(0, 120) ?? null,
    ts,
    published: new Date(ts).toISOString(),
    excerpt,
    image: safeUrl(raw.image),
    categories: categorize(`${raw.title} ${excerpt} ${tags.join(' ')}`, source.kind),
    players: [],
    tags,
  }
}

const titleKey = (a: NewsArticle) => `${a.publisher}|${a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`

/** Drop repeats: the same URL, or the same title from the same publisher (e.g. two feeds of one site). */
export function dedupe(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>()
  const out: NewsArticle[] = []
  for (const a of [...articles].sort((x, y) => y.ts - x.ts)) {
    const k1 = `id:${a.id}`
    const k2 = `t:${titleKey(a)}`
    if (seen.has(k1) || seen.has(k2)) continue
    seen.add(k1)
    seen.add(k2)
    out.push(a)
  }
  return out
}

/**
 * Combine the previous run's articles with this run's (feeds only carry the latest few items, so
 * this builds a rolling history). Fresh copies win; old and excess items are dropped.
 */
export function mergeArticles(previous: NewsArticle[], fresh: NewsArticle[], opts: { now: number; maxAgeDays: number; maxItems: number }): NewsArticle[] {
  const cutoff = opts.now - opts.maxAgeDays * 86_400_000
  const byId = new Map<string, NewsArticle>()
  for (const a of previous) byId.set(a.id, a)
  for (const a of fresh) byId.set(a.id, a)
  return dedupe([...byId.values()].filter((a) => a.ts >= cutoff)).slice(0, opts.maxItems)
}
