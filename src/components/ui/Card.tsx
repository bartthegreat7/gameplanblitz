import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useContext, useId, type ReactNode } from 'react'

import { useAppStore } from '../../store/app'
import { CardBare } from './cardContext'

export type Tone = 'accent' | 'orange' | 'blue' | 'green' | 'gold'

const TONE: Record<Tone, string> = {
  accent: 'bg-accent/12 border-accent/30 text-accent',
  orange: 'bg-coral/12 border-coral/30 text-coral',
  blue: 'bg-blue/12 border-blue/30 text-blue',
  green: 'bg-good/12 border-good/30 text-good',
  gold: 'bg-amber/12 border-amber/30 text-amber',
}

interface CardProps {
  /** stable id: persists the collapsed state */
  id: string
  title: string
  context?: string
  icon: LucideIcon
  tone?: Tone
  children: ReactNode
}

/** Collapsible dashboard card. The header is a real button (keyboard + screen-reader friendly). */
export function Card({ id, title, context, icon: Icon, tone = 'accent', children }: CardProps) {
  const closed = useAppStore((s) => s.collapsed.includes(id))
  const toggle = useAppStore((s) => s.toggleCollapsed)
  const bodyId = useId()
  const bare = useContext(CardBare)
  if (bare)
    return (
      <section aria-label={title}>
        {context && <p className="text-ink-3 mb-4 text-sm font-medium">{context}</p>}
        {children}
      </section>
    )
  return (
    <section
      aria-label={title}
      className="border-line bg-card hover:border-plan-line mb-4 break-inside-avoid overflow-hidden rounded-2xl border shadow-[0_16px_36px_-28px_rgba(0,0,0,0.65)] transition-colors"
    >
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={!closed}
          aria-controls={bodyId}
          onClick={() => toggle(id)}
          className="flex w-full cursor-pointer items-center gap-3 px-4 pt-4 pb-1 text-left"
        >
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl border ${TONE[tone]}`}
          >
            <Icon size={20} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-extrabold tracking-tight">{title}</span>
            {context && <span className="text-ink-3 truncate text-sm font-medium">{context}</span>}
          </span>
          <span className="border-line bg-card text-ink-3 grid size-8 shrink-0 place-items-center rounded-full border">
            <ChevronDown
              size={18}
              aria-hidden
              className={`transition-transform ${closed ? '-rotate-90' : ''}`}
            />
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={closed} className="px-4 pt-3 pb-4">
        {children}
      </div>
    </section>
  )
}
