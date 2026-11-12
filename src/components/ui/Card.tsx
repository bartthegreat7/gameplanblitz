import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { useAppStore } from '../../store/app'

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
  return (
    <section
      aria-label={title}
      className="border-line from-card-2 to-card mb-5 break-inside-avoid overflow-hidden rounded-3xl border bg-gradient-to-b shadow-[0_20px_40px_-32px_rgba(0,0,0,0.5)]"
    >
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={!closed}
          aria-controls={bodyId}
          onClick={() => toggle(id)}
          className="flex w-full cursor-pointer items-center gap-3.5 px-5 pt-5 pb-1 text-left"
        >
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl border ${TONE[tone]}`}>
            <Icon size={24} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-2xl font-extrabold tracking-tight">{title}</span>
            {context && <span className="text-ink-3 truncate text-sm font-medium">{context}</span>}
          </span>
          <span className="border-line bg-card text-ink-3 grid size-8 shrink-0 place-items-center rounded-full border">
            <ChevronDown size={18} aria-hidden className={`transition-transform ${closed ? '-rotate-90' : ''}`} />
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={closed} className="px-5 pt-4 pb-5">
        {children}
      </div>
    </section>
  )
}
