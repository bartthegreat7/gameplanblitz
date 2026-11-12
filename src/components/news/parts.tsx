import { CircleAlert, CircleCheck, CircleSlash } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { relTime } from '../../lib/format'
import type { Article, NewsResponse } from '../../lib/news'
import { NEWS_CATEGORIES, TEAM_NAMES } from '../../lib/newsTaxonomy'
import type { DateRange, Filters, Scope, SortOrder } from '../../lib/newsFeed'
import { Segmented } from '../ui/Segmented'
import { EmptyState } from '../ui/states'
import { ArticleCard, type ArticleCardProps } from './ArticleCard'

/** A titled section of article cards, with an optional "see all" action. */
export function Rail({
  title,
  subtitle,
  articles,
  empty,
  onSeeAll,
  cardProps,
  limit = 4,
  variant = 'grid',
}: {
  title: string
  subtitle?: string
  articles: Article[]
  empty: ReactNode
  onSeeAll?: () => void
  cardProps?: Omit<ArticleCardProps, 'a'>
  limit?: number
  variant?: 'grid' | 'compact'
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-lg font-extrabold">
          {title}
        </h2>
        {onSeeAll && articles.length > limit && (
          <button type="button" onClick={onSeeAll} className="text-accent text-sm font-bold">
            See all {articles.length} →
          </button>
        )}
      </div>
      {subtitle && <p className="text-ink-3 mb-3 text-sm">{subtitle}</p>}
      {articles.length === 0 ? (
        <div className="border-line bg-card rounded-2xl border">
          <EmptyState icon={false}>{empty}</EmptyState>
        </div>
      ) : (
        <ul className={variant === 'compact' ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'}>
          {articles.slice(0, limit).map((a) => (
            <li key={a.id} className="flex">
              <div className="flex w-full">
                <ArticleCard a={a} variant={variant} {...cardProps} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const RANGES: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
]

export function FilterPanel({
  f,
  set,
  publishers,
  savedCount,
  onReset,
}: {
  f: Filters
  set: (patch: Partial<Filters>) => void
  publishers: string[]
  savedCount: number
  onReset: () => void
}) {
  const id = useId()
  const input = 'border-line bg-card min-w-0 rounded-xl border px-3 py-2.5 text-sm'
  const field = (label: string, el: ReactNode, key: string) => (
    <label htmlFor={`${id}-${key}`} className="flex min-w-0 flex-col gap-1 text-xs font-bold">
      {label}
      {el}
    </label>
  )
  return (
    <div className="border-line bg-card rounded-2xl border p-3">
      <Segmented
        label="Show"
        value={f.scope}
        onChange={(scope: Scope) => set({ scope })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
          { value: 'saved', label: `Saved (${savedCount})` },
        ]}
      />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {field('Search titles', <input id={`${id}-q`} type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="e.g. waiver" className={input} />, 'q')}
        {field('Player', <input id={`${id}-player`} type="search" value={f.player} onChange={(e) => set({ player: e.target.value })} placeholder="e.g. Puka Nacua" className={input} />, 'player')}
        {field(
          'NFL team',
          <select id={`${id}-team`} value={f.team} onChange={(e) => set({ team: e.target.value })} className={input}>
            <option value="">All teams</option>
            {Object.keys(TEAM_NAMES).sort().map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>,
          'team',
        )}
        {field(
          'Position',
          <select id={`${id}-pos`} value={f.position} onChange={(e) => set({ position: e.target.value })} className={input}>
            <option value="">All positions</option>
            {POSITIONS.map((p) => <option key={p}>{p}</option>)}
          </select>,
          'pos',
        )}
        {field(
          'Publisher',
          <select id={`${id}-pub`} value={f.publisher} onChange={(e) => set({ publisher: e.target.value })} className={input}>
            <option value="">All publishers</option>
            {publishers.map((p) => <option key={p}>{p}</option>)}
          </select>,
          'pub',
        )}
        {field(
          'Category',
          <select id={`${id}-cat`} value={f.category} onChange={(e) => set({ category: e.target.value })} className={input}>
            <option value="">All categories</option>
            {NEWS_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>,
          'cat',
        )}
        {field(
          'Published',
          <select id={`${id}-range`} value={f.range} onChange={(e) => set({ range: e.target.value as DateRange })} className={input}>
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>,
          'range',
        )}
        {field(
          'Sort',
          <select id={`${id}-sort`} value={f.sort} onChange={(e) => set({ sort: e.target.value as SortOrder })} className={input}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>,
          'sort',
        )}
      </div>
      <button type="button" onClick={onReset} className="text-accent mt-3 text-sm font-bold">
        Clear filters
      </button>
    </div>
  )
}

/** Which publishers are connected, how each feed did on the last run, and which are unavailable. */
export function PublisherStatus({ data }: { data: NewsResponse }) {
  const sources = data.sources ?? []
  return (
    <details className="border-line bg-card mt-8 rounded-2xl border p-4 text-sm">
      <summary className="cursor-pointer font-bold">
        Publishers: {sources.filter((s) => s.ok).length} of {sources.length} feeds working
        {data.unavailable?.length ? `, ${data.unavailable.length} unavailable` : ''}
      </summary>
      <ul className="mt-3 grid gap-2">
        {sources.map((s) => (
          <li key={s.id} className="flex items-start gap-2">
            {s.ok ? <CircleCheck size={16} className="text-good mt-0.5 shrink-0" aria-hidden /> : <CircleAlert size={16} className="text-amber mt-0.5 shrink-0" aria-hidden />}
            <span>
              <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">
                {s.name}
              </a>{' '}
              <span className="text-ink-3">({s.kind === 'news' ? 'player news' : 'articles'})</span>:{' '}
              {s.ok ? `${s.count} items on the last refresh` : `last refresh failed (${s.error})${s.lastSuccess ? `; last worked ${relTime(Date.parse(s.lastSuccess))}` : ''}`}
              <span className="text-ink-3 block text-xs">{s.note}</span>
            </span>
          </li>
        ))}
        {(data.unavailable ?? []).map((u) => (
          <li key={u.name} className="flex items-start gap-2">
            <CircleSlash size={16} className="text-ink-3 mt-0.5 shrink-0" aria-hidden />
            <span>
              <b>{u.name}</b>: not connected. <span className="text-ink-3">{u.reason}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-ink-3 mt-3 text-xs">
        Feeds are collected server-side every 2 hours. Only headlines, short excerpts, publisher thumbnails and links are kept; full articles stay on the publishers' sites.
      </p>
    </details>
  )
}
