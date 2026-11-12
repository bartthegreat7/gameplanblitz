/* News aggregation, run server-side by the deploy workflow (Node 24 runs TypeScript directly):
     node scripts/news/aggregate.ts --out public/news.json
   Fetches each enabled publisher feed once, normalizes and categorizes items, matches players,
   merges with the previously published file (a rolling history, since feeds carry only their
   latest items), and writes one static JSON file the app reads. It never fails the deploy:
   a broken feed is recorded in `sources` and the others still publish. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import { NEWS_CATEGORIES } from '../../src/lib/newsTaxonomy.ts'
import { dedupe, mergeArticles, normalizeItem, parseFeed, type NewsArticle } from './feed.ts'
import { buildPlayerIndex, matchPlayers, type PlayerLite } from './players.ts'
import { SOURCES, UNAVAILABLE, USER_AGENT, type Source } from './sources.ts'

export interface SourceStatus {
  id: string
  name: string
  homepage: string
  kind: 'news' | 'article'
  ok: boolean
  /** items accepted this run */
  count: number
  error: string | null
  fetchedAt: string
  /** last run this source succeeded (carried over from the previous file when it fails now) */
  lastSuccess: string | null
  note: string
}

export interface NewsFile {
  version: 1
  updated: string
  sources: SourceStatus[]
  unavailable: { name: string; reason: string }[]
  categories: string[]
  publishers: string[]
  articles: NewsArticle[]
  /** whether article player tags came from a fresh Sleeper player list this run */
  playersMatched: boolean
}

export interface Deps {
  fetchText: (url: string) => Promise<string>
  fetchJson: (url: string) => Promise<unknown>
  now: () => number
  log: (msg: string) => void
}

export interface Options {
  sources?: Source[]
  previousUrl?: string | null
  playersUrl?: string
  maxAgeDays?: number
  maxItems?: number
  perSourceMax?: number
}

const isNewsFile = (x: unknown): x is NewsFile =>
  !!x && typeof x === 'object' && Array.isArray((x as NewsFile).articles) && Array.isArray((x as NewsFile).sources)

export async function aggregate(deps: Deps, opts: Options = {}): Promise<NewsFile> {
  const sources = (opts.sources ?? SOURCES).filter((s) => s.enabled)
  const now = deps.now()
  const maxAgeDays = opts.maxAgeDays ?? 14
  const maxItems = opts.maxItems ?? 400
  const perSourceMax = opts.perSourceMax ?? 60

  // previous published file: rolling history + last-success times
  let previous: NewsFile | null = null
  if (opts.previousUrl) {
    try {
      const p = await deps.fetchJson(opts.previousUrl)
      if (isNewsFile(p)) previous = p
      deps.log(`previous file: ${previous ? `${previous.articles.length} articles` : 'not a news file, ignored'}`)
    } catch (e) {
      deps.log(`previous file unavailable: ${String(e)}`)
    }
  }

  // Sleeper player list, for tagging which players an article is about
  let index: ReturnType<typeof buildPlayerIndex> | null = null
  try {
    const players = (await deps.fetchJson(opts.playersUrl ?? 'https://api.sleeper.app/v1/players/nfl')) as Record<string, PlayerLite>
    index = buildPlayerIndex(players)
    deps.log(`player index: ${index.size} names`)
  } catch (e) {
    deps.log(`player list unavailable, articles will keep earlier tags only: ${String(e)}`)
  }

  const fresh: NewsArticle[] = []
  const statuses: SourceStatus[] = []
  for (const s of sources) {
    const prevStatus = previous?.sources.find((p) => p.id === s.id)
    const base = { id: s.id, name: s.name, homepage: s.homepage, kind: s.kind, fetchedAt: new Date(now).toISOString(), note: s.note }
    try {
      const xml = await deps.fetchText(s.url)
      const items = parseFeed(xml)
      const accepted = items
        .map((raw) => normalizeItem(raw, s, now))
        .filter((a): a is NewsArticle => !!a)
        .slice(0, perSourceMax)
      if (items.length > 0 && accepted.length === 0) throw new Error(`${items.length} items, none usable`)
      if (index) for (const a of accepted) a.players = matchPlayers(`${a.title} ${a.excerpt} ${a.tags.join(' . ')}`, index)
      fresh.push(...accepted)
      statuses.push({ ...base, ok: true, count: accepted.length, error: null, lastSuccess: base.fetchedAt })
      deps.log(`ok    ${s.id}: ${accepted.length} articles`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      statuses.push({ ...base, ok: false, count: 0, error, lastSuccess: prevStatus?.lastSuccess ?? null })
      deps.log(`FAIL  ${s.id}: ${error}`)
    }
  }

  // re-tag carried-over articles with the fresh index so tags stay consistent
  const carried = (previous?.articles ?? []).map((a) => (index ? { ...a, players: matchPlayers(`${a.title} ${a.excerpt} ${(a.tags ?? []).join(' . ')}`, index) } : a))
  const articles = mergeArticles(carried, dedupe(fresh), { now, maxAgeDays, maxItems })

  return {
    version: 1,
    updated: new Date(now).toISOString(),
    sources: statuses,
    unavailable: UNAVAILABLE,
    categories: [...NEWS_CATEGORIES],
    publishers: [...new Set(sources.map((s) => s.name))],
    articles,
    playersMatched: !!index,
  }
}

/* ---------- CLI ---------- */

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const r = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r
}

function previousUrlFromEnv(): string | null {
  if (process.env.NEWS_PREVIOUS_URL) return process.env.NEWS_PREVIOUS_URL
  const repo = process.env.GITHUB_REPOSITORY // owner/name, set in GitHub Actions
  if (!repo) return null
  const [owner, name] = repo.split('/')
  return `https://${owner.toLowerCase()}.github.io/${name}/news.json`
}

async function main() {
  const outIdx = process.argv.indexOf('--out')
  const out = outIdx > 0 ? process.argv[outIdx + 1] : 'public/news.json'
  const file = await aggregate(
    {
      fetchText: async (u) => (await fetchWithTimeout(u, 'application/rss+xml, application/atom+xml, application/xml, text/xml')).text(),
      fetchJson: async (u) => (await fetchWithTimeout(u, 'application/json')).json(),
      now: () => Date.now(),
      log: (m) => console.log(`[news] ${m}`),
    },
    {
      previousUrl: previousUrlFromEnv(),
      maxAgeDays: Number(process.env.NEWS_MAX_AGE_DAYS) || undefined,
      maxItems: Number(process.env.NEWS_MAX_ITEMS) || undefined,
    },
  )
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(file))
  const failed = file.sources.filter((s) => !s.ok)
  console.log(`[news] wrote ${out}: ${file.articles.length} articles, ${file.sources.length - failed.length}/${file.sources.length} sources ok${failed.length ? ` (failed: ${failed.map((f) => f.id).join(', ')})` : ''}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    // never fail the deploy over news: log and exit cleanly (the app shows a "news unavailable" state)
    console.error('[news] aggregation crashed:', e)
    process.exit(0)
  })
}
