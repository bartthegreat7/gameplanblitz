import type { UseQueryResult } from '@tanstack/react-query'
import { Newspaper } from 'lucide-react'
import { useState } from 'react'

import { isHttpUrl, relTime } from '../../lib/format'
import { NewsNotPublished, type NewsResponse } from '../../lib/news'
import { newestFirst, tsOf } from '../../lib/newsFeed'
import { CardLink } from '../dashboard/DashboardCard'
import { CARD } from '../dashboard/styles'
import { EmptyState, ErrorState, ListSkeleton } from '../ui/states'

const ITEMS = 3

function Thumb({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || !isHttpUrl(src) || failed)
    return (
      <span aria-hidden className="border-line/70 bg-panel text-ink-3 grid size-14 shrink-0 place-items-center rounded-lg border">
        <Newspaper size={20} />
      </span>
    )
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-14 shrink-0 rounded-lg object-cover"
    />
  )
}

/** The newest articles from the connected publishers; every item links to the publisher. */
export function NewsCompact({ news, className = '' }: { news: UseQueryResult<NewsResponse>; className?: string }) {
  const [now] = useState(() => Date.now())
  const items = newestFirst(news.data?.articles ?? []).slice(0, ITEMS)
  const unavailable = news.data?.unavailable ?? []
  return (
    <section aria-label="Fantasy News" className={`${CARD} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="mb-2 flex items-center gap-2.5">
        <Newspaper size={22} aria-hidden className="text-accent shrink-0" />
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight">Fantasy News</h2>
        <CardLink to="/news" className="shrink-0">
          View All
        </CardLink>
      </div>
      {news.isPending ? (
        <ListSkeleton rows={3} />
      ) : news.isError ? (
        news.error instanceof NewsNotPublished ? (
          <EmptyState>The news feed hasn&apos;t been published yet. It refreshes every 2 hours once the site deploys.</EmptyState>
        ) : (
          <ErrorState title="Couldn't load news" message={news.error.message} onRetry={() => void news.refetch()} />
        )
      ) : items.length === 0 ? (
        <EmptyState>No recent articles from connected publishers.</EmptyState>
      ) : (
        <ul className="divide-line/60 grid divide-y">
          {items.map((a) => (
            <li key={a.id} className="py-2 first:pt-0 last:pb-0">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="group flex gap-3">
                <Thumb src={a.image} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-sm leading-snug font-bold group-hover:underline">{a.title}</span>
                  <span className="text-ink-2 block truncate text-xs">
                    {relTime(tsOf(a), now)} · {a.publisher ?? 'Publisher'}
                    {a.players?.[0] && <span className="text-ink-3"> · {a.players[0].name}</span>}
                    <span className="sr-only"> (opens the publisher&apos;s site)</span>
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {unavailable.length > 0 && (
        <p className="text-ink-3 mt-auto truncate pt-2 text-[11px]" title={unavailable.map((u) => `${u.name}: ${u.reason}`).join('; ')}>
          Not available (no public feed): {unavailable.map((u) => u.name).join(', ')}
        </p>
      )}
    </section>
  )
}
