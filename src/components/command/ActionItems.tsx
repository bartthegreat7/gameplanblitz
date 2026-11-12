import { AlertCircle, CheckCircle2, ChevronRight, CircleDashed, ListTodo } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { ActionItem, ItemState } from '../../lib/analytics/command'
import { CardLink, DashboardCard } from '../dashboard/DashboardCard'

const STATE: Record<ItemState, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  done: { icon: CheckCircle2, cls: 'text-good', label: 'Done' },
  attention: { icon: AlertCircle, cls: 'text-amber', label: 'Needs attention' },
  pending: { icon: CircleDashed, cls: 'text-ink-3', label: 'Pending' },
}

/**
 * The week's checklist. Green = the data shows it resolved, amber = needs you, grey = still
 * loading or optional. Every row opens the tool that resolves it.
 */
export function ActionItems({ items, className = '' }: { items: ActionItem[]; className?: string }) {
  const open = items.filter((i) => i.state === 'attention').length
  return (
    <DashboardCard
      title="Top Action Items"
      subtitle={open ? `${open} need${open === 1 ? 's' : ''} your attention` : 'Everything checks out'}
      icon={ListTodo}
      tone="amber"
      className={className}
      aside={<CardLink to="/edge">The Edge</CardLink>}
    >
      <ul className="grid gap-1.5">
        {items.map((i) => {
          const s = STATE[i.state]
          return (
            <li key={i.id}>
              <Link
                to={i.to}
                aria-label={`${i.title} (${s.label}): ${i.detail}`}
                className="group hover:border-line/70 hover:bg-card-2/60 flex items-start gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-colors"
              >
                <s.icon size={20} aria-hidden className={`mt-0.5 shrink-0 ${s.cls}`} />
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug font-bold">
                    {i.title}
                  </span>
                  <span className="text-ink-3 line-clamp-2 block text-sm">{i.detail}</span>
                </span>
                <ChevronRight
                  size={18}
                  aria-hidden
                  className="text-ink-3 group-hover:text-ink mt-0.5 shrink-0"
                />
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="text-ink-3 mt-3 text-xs">
        Green items are verified against your Sleeper data, not ticked off by hand.
      </p>
    </DashboardCard>
  )
}
