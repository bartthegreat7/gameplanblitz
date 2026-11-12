import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { LeagueGate } from '../components/LeagueGate'
import { NewsList, type NewsItem } from '../components/NewsList'
import { Segmented } from '../components/ui/Segmented'
import { EmptyState, ErrorState, ListSkeleton } from '../components/ui/states'
import { useNews } from '../hooks/useNews'
import type { Ready } from '../hooks/useLeagueData'
import { buildNameIndex, matchPlayers, newsConfigured } from '../lib/news'
import { useAppStore } from '../store/app'

type Scope = 'all' | 'mine' | 'saved'

function NewsHub({ data }: { data: Ready }) {
  const { model } = data
  const news = useNews({ limit: 100 })
  const saved = useAppStore((s) => s.bookmarks)
  const [scope, setScope] = useState<Scope>('all')
  const [category, setCategory] = useState('')
  const [publisher, setPublisher] = useState('')
  const [q, setQ] = useState('')

  const all = useMemo<NewsItem[]>(() => {
    const idx = buildNameIndex(model.myRoster()?.players ?? [], model.players)
    return (news.data?.articles ?? []).map((article) => ({ article, hits: matchPlayers(article, idx) }))
  }, [news.data, model])

  const categories = news.data?.categories?.length ? news.data.categories : [...new Set(all.map((i) => i.article.category).filter((c): c is string => !!c))]
  const publishers = news.data?.publishers?.length ? news.data.publishers : [...new Set(all.map((i) => i.article.publisher).filter((c): c is string => !!c))]

  const needle = q.trim().toLowerCase()
  const items = all.filter(
    ({ article: a, hits }) =>
      (scope === 'all' || (scope === 'mine' && hits.length > 0) || (scope === 'saved' && saved.includes(a.id))) &&
      (!category || a.category === category) &&
      (!publisher || a.publisher === publisher) &&
      (!needle || `${a.title} ${a.excerpt ?? ''}`.toLowerCase().includes(needle)),
  )

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">News &amp; Analysis</h1>
      <p className="text-ink-3 mb-4 text-sm">Headlines, excerpts and links from our partner publishers. Every card opens the original article.</p>

      {!newsConfigured ? (
        <div className="border-line bg-card rounded-3xl border p-5">
          <EmptyState>
            The news feed isn't connected yet. Once the news Worker is deployed, set <b>VITE_NEWS_API</b> at build time and articles will appear here.
          </EmptyState>
        </div>
      ) : (
        <>
          <Segmented
            label="News scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'My roster' },
              { value: 'saved', label: `Saved (${saved.length})` },
            ]}
          />
          <div className="mb-4 flex flex-wrap gap-2.5">
            <div className="border-line bg-card flex min-w-48 flex-1 items-center gap-2 rounded-2xl border px-3.5">
              <Search size={18} className="text-ink-3" aria-hidden />
              <label htmlFor="news-search" className="sr-only">
                Search news
              </label>
              <input id="news-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines" className="min-w-0 flex-1 bg-transparent py-3 outline-none" />
            </div>
            <label htmlFor="news-cat" className="sr-only">
              Category
            </label>
            <select id="news-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="border-line bg-card rounded-2xl border px-3 py-3 font-bold">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label htmlFor="news-pub" className="sr-only">
              Publisher
            </label>
            <select id="news-pub" value={publisher} onChange={(e) => setPublisher(e.target.value)} className="border-line bg-card rounded-2xl border px-3 py-3 font-bold">
              <option value="">All publishers</option>
              {publishers.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="border-line bg-card rounded-3xl border px-4 py-1">
            {news.isPending ? (
              <div className="py-3">
                <ListSkeleton rows={6} />
              </div>
            ) : news.isError ? (
              <div className="py-4">
                <ErrorState title="Couldn't load the news feed" message="The news service may be briefly down." onRetry={() => void news.refetch()} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState>{scope === 'saved' ? 'No saved articles yet. Tap the bookmark on any article.' : 'No articles match these filters.'}</EmptyState>
            ) : (
              <NewsList items={items} model={model} bookmarks />
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function News() {
  return <LeagueGate>{(data) => <NewsHub data={data} />}</LeagueGate>
}
