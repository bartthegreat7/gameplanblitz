import { ChevronRight, Circle, CircleAlert, CircleCheck, ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { ActionItem, ItemState } from '../../lib/analytics/command'
import { CARD } from '../dashboard/styles'

const STATE: Record<ItemState, { icon: typeof Circle; cls: string; label: string }> = {
  done: { icon: CircleCheck, cls: 'text-good fill-good/20', label: 'Done' },
  attention: { icon: CircleAlert, cls: 'text-amber fill-amber/20', label: 'Needs attention' },
  pending: { icon: Circle, cls: 'text-ink-3', label: 'Pending' },
}
const SHOWN = 3

/**
 * The week's checklist. Green = the data shows it resolved, amber = needs you, grey = still
 * loading or optional. Every row opens the tool that resolves it.
 */
export function ActionItems({ items, className = '' }: { items: ActionItem[]; className?: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, SHOWN)
  return (
    <section aria-label="Top Action Items" className={`${CARD} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <h2 className="mb-2 flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
        <ClipboardList size={22} aria-hidden className="text-accent" /> Top Action Items
      </h2>
      <ul className="divide-line/60 grid divide-y">
        {shown.map((i) => {
          const s = STATE[i.state]
          return (
            <li key={i.id}>
              <Link
                to={i.to}
                aria-label={`${i.title} (${s.label}): ${i.detail}`}
                title={i.detail}
                className="group hover:bg-raised/60 -mx-2 flex min-h-10 items-center gap-3 rounded-lg px-2 transition-colors"
              >
                <s.icon size={22} aria-hidden className={`shrink-0 ${s.cls}`} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {i.title}
                  {i.tag && <span className="text-ink-2 font-medium"> ({i.tag})</span>}
                </span>
                <ChevronRight size={18} aria-hidden className="text-ink-3 group-hover:text-ink shrink-0" />
              </Link>
            </li>
          )
        })}
      </ul>
      {items.length > SHOWN && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className="text-accent mt-1.5 self-start text-sm font-bold hover:underline"
        >
          {all ? 'Show fewer' : `Show all ${items.length} checks`}
        </button>
      )}
    </section>
  )
}
