import { Headphones, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { clock, total } from '../../lib/ai/episode'
import type { Episode } from '../../lib/ai/storage'
import { relTime } from '../../lib/format'
import { CARD, PAD } from '../dashboard/styles'

/** Episode history and saved episodes for this league, newest first, with delete. */
export function Library({
  episodes,
  current,
  onOpen,
  onToggleSaved,
  onDelete,
}: {
  episodes: Episode[]
  current: string | null
  onOpen: (e: Episode) => void
  onToggleSaved: (e: Episode) => void
  onDelete: (e: Episode) => void
}) {
  const [tab, setTab] = useState<'all' | 'saved'>('all')
  const [confirm, setConfirm] = useState<string | null>(null)
  const list = tab === 'saved' ? episodes.filter((e) => e.saved) : episodes
  return (
    <section aria-label="Episode library" className={`${CARD} ${PAD}`}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        <Headphones size={18} aria-hidden className="text-accent" /> Your episodes
      </h2>
      <div role="group" aria-label="Show" className="border-line bg-panel mb-3 inline-flex rounded-xl border p-0.5 text-xs font-bold">
        {(['all', 'saved'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-8 rounded-lg px-3 ${tab === t ? 'bg-ink text-bg' : 'text-ink-2'}`}>
            {t === 'all' ? `History (${episodes.length})` : `Saved (${episodes.filter((e) => e.saved).length})`}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-ink-3 text-sm">{tab === 'saved' ? 'Star an episode to keep it here.' : 'No episodes yet. Your episodes are stored only in this browser.'}</p>
      ) : (
        <ul className="grid gap-2">
          {list.map((e) => (
            <li key={e.id} className={`rounded-xl border p-3 ${e.id === current ? 'border-accent bg-accent/5' : 'border-line/60 bg-bg/40'}`}>
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => onOpen(e)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-extrabold">{e.title}</span>
                  <span className="text-ink-3 block text-xs">
                    {relTime(e.createdAt)} · {e.format === 'debate' ? 'Two hosts' : 'One host'} · {e.audio ? `${clock(total(e.audio.durations))}${e.audio.engine === 'cloud' ? ' AI voices' : ' device voices'}` : 'transcript only'}
                  </span>
                </button>
                <button type="button" onClick={() => onToggleSaved(e)} aria-pressed={e.saved} aria-label={e.saved ? `Unsave ${e.title}` : `Save ${e.title}`} className={`grid size-9 shrink-0 place-items-center rounded-lg ${e.saved ? 'text-amber' : 'text-ink-3'}`}>
                  <Star size={16} aria-hidden className={e.saved ? 'fill-current' : ''} />
                </button>
                <button type="button" onClick={() => setConfirm(e.id)} aria-label={`Delete ${e.title}`} className="text-ink-3 hover:text-bad grid size-9 shrink-0 place-items-center rounded-lg">
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              {confirm === e.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                  Delete the episode, transcript and audio?
                  <button type="button" onClick={() => { setConfirm(null); onDelete(e) }} className="bg-bad text-bad-ink min-h-8 rounded-lg px-2.5">
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="border-line min-h-8 rounded-lg border px-2.5">
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
