import { Bookmark, BookmarkCheck, Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { isHttpUrl, relTime } from '../../lib/format'
import { categoriesOf, type Article } from '../../lib/news'
import { tsOf } from '../../lib/newsFeed'
import { useAppStore } from '../../store/app'
import { Pill } from '../ui/Pill'

/**
 * Publisher-supplied thumbnail (16:9). Without one, a slim publisher banner instead of an empty
 * box, so cards stay consistent without pretending to have artwork.
 */
function Thumb({ a, variant }: { a: Article; variant: 'featured' | 'grid' }) {
  const [failed, setFailed] = useState(false)
  const src = isHttpUrl(a.image) && !failed ? a.image : null
  const shape = variant === 'featured' ? 'rounded-t-2xl md:w-1/2 md:rounded-l-2xl md:rounded-tr-none' : 'rounded-t-2xl'
  if (!src)
    return (
      <div aria-hidden className={`from-accent/18 border-line flex items-end border-b bg-gradient-to-br to-transparent px-4 py-2.5 ${variant === 'featured' ? 'h-24 md:h-auto ' + shape : 'h-12 ' + shape}`}>
        <span className="text-ink-2 text-sm font-extrabold tracking-tight">{a.publisher ?? ''}</span>
      </div>
    )
  return (
    <div aria-hidden className={`bg-panel relative overflow-hidden ${variant === 'featured' ? 'aspect-video md:aspect-auto ' : 'aspect-video '}${shape}`}>
      <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
    </div>
  )
}

export interface ArticleCardProps {
  a: Article
  variant?: 'featured' | 'grid' | 'compact'
  /** player ids to emphasize (e.g. yours) */
  highlight?: Set<string>
  /** player ids to label as free agents in your league */
  freeAgents?: Set<string>
}

export function ArticleCard({ a, variant = 'grid', highlight, freeAgents }: ArticleCardProps) {
  const read = useAppStore((s) => s.read.includes(a.id))
  const saved = useAppStore((s) => s.bookmarks.includes(a.id))
  const markRead = useAppStore((s) => s.markRead)
  const toggleBookmark = useAppStore((s) => s.toggleBookmark)
  const toggleRead = useAppStore((s) => s.toggleRead)
  const url = isHttpUrl(a.url) ? a.url : undefined
  const t = tsOf(a)
  const cats = categoriesOf(a)
  const players = a.players ?? []
  const compact = variant === 'compact'

  return (
    <article
      className={
        compact
          ? 'flex w-full flex-row gap-3'
          : `border-line bg-card flex w-full rounded-2xl border transition-colors hover:border-[var(--accent)]/40 ${variant === 'featured' ? 'flex-col md:flex-row' : 'flex-col'}`
      }
    >
      {!compact && <Thumb a={a} variant={variant === 'featured' ? 'featured' : 'grid'} />}
      <div className={`flex min-w-0 flex-1 flex-col ${compact ? '' : 'p-4'}`}>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="bg-accent/12 text-accent rounded-full px-2 py-0.5 text-[11px] font-extrabold">{a.publisher ?? 'Unknown'}</span>
          {a.kind === 'news' && <span className="text-ink-3 text-[11px] font-bold uppercase">News</span>}
          {!compact && cats.filter((c) => c !== 'Breaking News').slice(0, 2).map((c) => <Pill key={c}>{c}</Pill>)}
        </div>
        <h3 className={`leading-snug font-extrabold ${variant === 'featured' ? 'text-xl md:text-2xl' : compact ? 'text-sm' : 'text-base'} ${read ? 'text-ink-3' : ''}`}>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => markRead(a.id)} className="hover:text-accent">
            {a.title}
          </a>
        </h3>
        <div className="text-ink-3 mt-1 text-xs">
          {a.author && <span>{a.author} · </span>}
          {t > 0 && (
            <time dateTime={new Date(t).toISOString()} title={new Date(t).toLocaleString()}>
              {relTime(t)}
            </time>
          )}
        </div>
        {a.excerpt && !compact && <p className={`text-ink-2 mt-2 text-sm ${variant === 'featured' ? '' : 'line-clamp-3'}`}>{a.excerpt}</p>}
        {players.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Players mentioned">
            {players.slice(0, compact ? 3 : 5).map((p) => (
              <li key={p.id}>
                <Link
                  to={`/players/${p.id}`}
                  aria-label={freeAgents?.has(p.id) ? `${p.name}, free agent in your league` : p.name}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                    highlight?.has(p.id) ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line text-ink-2 hover:text-ink'
                  }`}
                >
                  {p.name}
                  {freeAgents?.has(p.id) && <span className="text-good" aria-hidden> · FA</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!compact && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => markRead(a.id)}
                aria-label={`Read on ${a.publisher ?? 'the publisher'} (opens in a new tab)`}
                className="bg-accent text-accent-ink inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-extrabold whitespace-nowrap"
              >
                Read article <ExternalLink size={14} aria-hidden />
              </a>
            )}
            <button
              type="button"
              onClick={() => toggleBookmark(a.id)}
              aria-pressed={saved}
              aria-label={saved ? `Remove bookmark: ${a.title}` : `Save: ${a.title}`}
              className="text-ink-3 hover:text-accent grid size-8 place-items-center rounded-lg"
            >
              {saved ? <BookmarkCheck size={18} className="text-accent" aria-hidden /> : <Bookmark size={18} aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => toggleRead(a.id)}
              aria-pressed={read}
              aria-label={read ? `Mark unread: ${a.title}` : `Mark read: ${a.title}`}
              className={`grid size-8 place-items-center rounded-lg ${read ? 'text-good' : 'text-ink-3 hover:text-accent'}`}
            >
              <Check size={18} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
