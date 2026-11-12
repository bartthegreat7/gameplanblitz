import { Flame, Zap } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { LeagueGate } from '../components/LeagueGate'
import { ArticleCard } from '../components/news/ArticleCard'
import { FilterPanel, PublisherStatus, Rail } from '../components/news/parts'
import { FreshnessBadge } from '../components/ui/badges'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useNews } from '../hooks/useNews'
import { findOpponent } from '../lib/insights'
import { categoriesOf, NewsNotPublished, playerIdsOf, type Article } from '../lib/news'
import {
  breakingNews,
  EMPTY_FILTERS,
  featured,
  filterArticles,
  longTerm,
  mentioning,
  trendingPlayers,
  type Filters,
} from '../lib/newsFeed'
import { useAppStore } from '../store/app'

const PAGE = 24

function NewsSkeleton() {
  return (
    <div role="status" aria-label="Loading news" className="grid gap-4">
      <Skeleton className="h-64 !rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-60 !rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function NewsHub({ data }: { data: Ready }) {
  const { model, matchups } = data
  const news = useNews()
  const saved = useAppStore((s) => s.bookmarks)
  const read = useAppStore((s) => s.read)
  const [f, setF] = useState<Filters>(EMPTY_FILTERS)
  const [shown, setShown] = useState(PAGE)
  const allRef = useRef<HTMLElement>(null)
  const [openedAt] = useState(() => Date.now())
  const now = news.dataUpdatedAt || openedAt

  const articles = useMemo(() => news.data?.articles ?? [], [news.data])
  const myIds = useMemo(() => new Set(model.myRoster()?.players ?? []), [model])
  const oppIds = useMemo(() => {
    const opp = findOpponent(matchups, model.myRosterId)
    return new Set(opp ? (model.rosterById(opp.roster_id)?.players ?? []) : [])
  }, [matchups, model])
  const rostered = useMemo(() => model.allRostered(), [model])
  const candidates = useMemo(() => [...myIds, ...oppIds], [myIds, oppIds])
  const idsById = useMemo(
    () => new Map(articles.map((a) => [a.id, playerIdsOf(a, candidates, model.players)] as const)),
    [articles, candidates, model.players],
  )
  const idsOf = useCallback((a: Article) => idsById.get(a.id) ?? [], [idsById])
  const freeAgents = useMemo(() => {
    const s = new Set<string>()
    for (const a of articles) for (const id of idsOf(a)) if (!rostered.has(id) && model.players[id]) s.add(id)
    return s
  }, [articles, idsOf, rostered, model.players])

  const sections = useMemo(() => {
    const has = (cat: string) => articles.filter((a) => categoriesOf(a).includes(cat))
    return {
      featured: featured(articles, now),
      breaking: breakingNews(articles, now),
      mine: mentioning(articles, myIds, idsOf),
      opponent: mentioning(articles, oppIds, idsOf),
      waiver: mentioning(articles, freeAgents, idsOf),
      longTerm: longTerm(articles, (id) => model.players[id]?.years_exp === 0, idsOf),
      trending: trendingPlayers(articles, now),
      waiverAdvice: has('Waiver Wire'),
      startSit: has('Start / Sit'),
      trade: has('Trade Targets'),
      injuries: has('Injury Updates'),
    }
  }, [articles, now, myIds, oppIds, freeAgents, idsOf, model.players])

  const filtered = useMemo(
    () =>
      filterArticles(articles, f, {
        now,
        saved,
        read,
        idsOf,
        playerInfo: (id) => (model.players[id] ? { team: model.team(id), pos: model.pos(id) } : null),
      }),
    [articles, f, now, saved, read, idsOf, model],
  )

  const setFilters = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch }))
    setShown(PAGE)
  }
  const seeAll = (patch: Partial<Filters>) => {
    setFilters({ ...EMPTY_FILTERS, ...patch })
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    allRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  const cardProps = { highlight: myIds, freeAgents }

  if (news.isPending) return <NewsSkeleton />
  if (news.isError)
    return news.error instanceof NewsNotPublished ? (
      <EmptyState>The news feed hasn't been published yet. It's collected from publisher feeds every 2 hours when the site deploys; check back after the next refresh.</EmptyState>
    ) : (
      <ErrorState title="Couldn't load news" message="The news file could not be fetched." onRetry={() => void news.refetch()} />
    )
  if (articles.length === 0)
    return (
      <>
        <EmptyState>No articles right now. Every publisher feed may have failed on the last refresh.</EmptyState>
        <PublisherStatus data={news.data} />
      </>
    )

  const [lead, ...more] = sections.featured
  return (
    <>
      {/* featured + breaking */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Featured articles">
          {lead && <ArticleCard a={lead} variant="featured" {...cardProps} />}
          {more.length > 0 && (
            <ul className="mt-4 grid gap-4 sm:grid-cols-3">
              {more.map((a) => (
                <li key={a.id} className="flex">
                  <ArticleCard a={a} {...cardProps} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="breaking-h" className="border-line bg-card rounded-2xl border p-4">
          <h2 id="breaking-h" className="mb-2 flex items-center gap-2 text-lg font-extrabold">
            <Zap size={18} className="text-amber" aria-hidden /> Breaking player news
          </h2>
          {sections.breaking.length === 0 ? (
            <p className="text-ink-3 text-sm">No player news in the last 24 hours.</p>
          ) : (
            <ul className="divide-line divide-y">
              {sections.breaking.slice(0, 8).map((a) => (
                <li key={a.id} className="py-2">
                  <ArticleCard a={a} variant="compact" {...cardProps} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {sections.trending.length > 0 && (
        <section aria-labelledby="trend-h" className="mt-8">
          <h2 id="trend-h" className="mb-1 flex items-center gap-2 text-lg font-extrabold">
            <Flame size={18} className="text-coral" aria-hidden /> Trending players
          </h2>
          <p className="text-ink-3 mb-3 text-sm">Covered by at least two publishers in the last 3 days. Coverage is not a recommendation.</p>
          <ul className="flex flex-wrap gap-2">
            {sections.trending.slice(0, 16).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => seeAll({ player: t.name })}
                  className={`rounded-full border px-3 py-1.5 text-sm font-bold ${myIds.has(t.id) ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line bg-card'}`}
                >
                  {t.name} <span className="text-ink-3 font-semibold">· {t.publishers} publishers</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Rail title="My roster news" subtitle="Articles that name players on your team. A mention is coverage, not advice." articles={sections.mine} empty="No recent articles mention your players." cardProps={cardProps} />
      <Rail title="My opponent's players" subtitle="This week's opponent, from your Sleeper matchup." articles={sections.opponent} empty={oppIds.size ? 'No recent articles mention your opponent\'s players.' : 'No opponent is set for this week.'} cardProps={cardProps} />
      <Rail title="Waiver wire watch" subtitle="Articles naming players who are free agents in your league (marked FA)." articles={sections.waiver} empty="No recent articles mention free agents in your league." cardProps={cardProps} />
      <Rail title="Keeper & dynasty intelligence" subtitle="Dynasty, keeper, NFL Draft and rest-of-season pieces, plus coverage of rookies." articles={sections.longTerm} empty="No recent long-term articles." cardProps={cardProps} onSeeAll={() => seeAll({ category: 'Dynasty Football' })} />
      <Rail title="Waiver recommendations" articles={sections.waiverAdvice} empty="No waiver articles right now." cardProps={cardProps} onSeeAll={() => seeAll({ category: 'Waiver Wire' })} />
      <Rail title="Start / sit analysis" articles={sections.startSit} empty="No start/sit articles right now." cardProps={cardProps} onSeeAll={() => seeAll({ category: 'Start / Sit' })} />
      <Rail title="Trade advice" articles={sections.trade} empty="No trade articles right now." cardProps={cardProps} onSeeAll={() => seeAll({ category: 'Trade Targets' })} />
      <Rail title="Injury reports" articles={sections.injuries} empty="No injury coverage right now." cardProps={cardProps} variant="compact" limit={6} onSeeAll={() => seeAll({ category: 'Injury Updates' })} />

      <section ref={allRef} aria-labelledby="all-h" className="mt-10 scroll-mt-4">
        <h2 id="all-h" className="mb-3 text-lg font-extrabold">
          All articles <span className="text-ink-3 text-sm font-semibold">({filtered.length})</span>
        </h2>
        <FilterPanel f={f} set={setFilters} publishers={news.data.publishers ?? []} savedCount={saved.length} onReset={() => setFilters(EMPTY_FILTERS)} />
        {filtered.length === 0 ? (
          <EmptyState>{f.scope === 'saved' ? 'No saved articles match. Use the bookmark on any article to save it.' : 'No articles match these filters.'}</EmptyState>
        ) : (
          <>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.slice(0, shown).map((a) => (
                <li key={a.id} className="flex">
                  <ArticleCard a={a} {...cardProps} />
                </li>
              ))}
            </ul>
            {filtered.length > shown && (
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="border-line bg-card mt-4 w-full rounded-xl border py-3 font-bold">
                Show more ({filtered.length - shown} left)
              </button>
            )}
          </>
        )}
      </section>

      <PublisherStatus data={news.data} />
    </>
  )
}

function NewsPage({ data }: { data: Ready }) {
  const news = useNews()
  const updated = news.data?.updated ? Date.parse(String(news.data.updated)) : null
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">News &amp; Articles</h1>
        {updated && Number.isFinite(updated) && <FreshnessBadge updatedAt={updated} label="Feeds refreshed" staleAfterMin={180} />}
      </div>
      <p className="text-ink-3 mb-5 text-sm">
        Headlines and short excerpts from fantasy publishers, matched to your league. Every article opens on the publisher's site.
      </p>
      <NewsHub data={data} />
    </div>
  )
}

export default function News() {
  return <LeagueGate>{(data) => <NewsPage data={data} />}</LeagueGate>
}
