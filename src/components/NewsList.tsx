import { Bookmark, BookmarkCheck } from 'lucide-react'

import { isHttpUrl, relTime, toMillis } from '../lib/format'
import type { Model } from '../lib/model'
import type { Article } from '../lib/news'
import { useAppStore } from '../store/app'
import { Pill } from './ui/Pill'

export interface NewsItem {
  article: Article
  /** roster player ids mentioned in the article */
  hits: string[]
}

/** Article list shared by the dashboard card and the News route. Every item links out to the publisher. */
export function NewsList({ items, model, bookmarks = false }: { items: NewsItem[]; model: Model; bookmarks?: boolean }) {
  const read = useAppStore((s) => s.read)
  const saved = useAppStore((s) => s.bookmarks)
  const markRead = useAppStore((s) => s.markRead)
  const toggleBookmark = useAppStore((s) => s.toggleBookmark)

  return (
    <ul>
      {items.map(({ article: a, hits }) => {
        const url = isHttpUrl(a.url) ? a.url : null
        const img = isHttpUrl(a.image) ? a.image : null
        const t = toMillis(a.ts, a.published)
        const isRead = read.includes(a.id)
        const isSaved = saved.includes(a.id)
        return (
          <li key={a.id} className="border-line/60 flex gap-2 border-t py-3.5 first:border-t-0">
            <a
              href={url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markRead(a.id)}
              className="group flex min-w-0 flex-1 gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className={`group-hover:text-accent text-base leading-snug font-bold ${isRead ? 'text-ink-3' : ''}`}>
                  {a.title || 'Untitled'}
                </div>
                <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {a.publisher && <Pill tone="info">{a.publisher}</Pill>}
                  {Number.isFinite(t) && <span>{relTime(t)}</span>}
                  {hits.slice(0, 2).map((pid) => (
                    <Pill key={pid} tone="prio">
                      {model.shortName(pid)}
                    </Pill>
                  ))}
                </div>
                {a.excerpt && <p className="text-ink-2 mt-1 text-sm">{a.excerpt.length > 160 ? a.excerpt.slice(0, 159) + '…' : a.excerpt}</p>}
              </div>
              {img && (
                <img
                  src={img}
                  alt=""
                  loading="lazy"
                  className="bg-panel size-[72px] shrink-0 rounded-xl object-cover"
                  onError={(e) => e.currentTarget.remove()}
                />
              )}
            </a>
            {bookmarks && (
              <button
                type="button"
                onClick={() => toggleBookmark(a.id)}
                aria-pressed={isSaved}
                aria-label={isSaved ? 'Remove bookmark' : 'Save article'}
                className="text-ink-3 hover:text-accent grid size-9 shrink-0 place-items-center"
              >
                {isSaved ? <BookmarkCheck size={20} className="text-accent" aria-hidden /> : <Bookmark size={20} aria-hidden />}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
