import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CARD, ICON_TONE, PAD, type IconTone } from './styles'

export function IconTile({
  icon: Icon,
  tone = 'accent',
  className = 'size-10',
}: {
  icon: LucideIcon
  tone?: IconTone
  className?: string
}) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${ICON_TONE[tone]} ${className}`}>
      <Icon size={20} aria-hidden />
    </span>
  )
}

/**
 * Dashboard card: icon + title (+ optional subtitle and aside), body, footer pinned to the bottom.
 * `plain` drops the card surface so two panels can share one card.
 */
export function DashboardCard({
  title,
  subtitle,
  icon,
  tone = 'accent',
  aside,
  footer,
  className = '',
  plain = false,
  children,
}: {
  title: string
  subtitle?: ReactNode
  icon: LucideIcon
  tone?: IconTone
  aside?: ReactNode
  footer?: ReactNode
  className?: string
  plain?: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col ${plain ? '' : `${CARD} ${PAD}`} ${className}`}
    >
      <div className="mb-5 flex items-center gap-3">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="text-ink-3 truncate text-sm">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer && (
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-5">{footer}</div>
      )}
    </section>
  )
}

export function CardLink({
  to,
  children,
  className = '',
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={`text-accent inline-flex items-center gap-1.5 text-sm font-bold hover:underline ${className}`}
    >
      {children} <ArrowRight size={15} aria-hidden />
    </Link>
  )
}

/** Small "model" marker for numbers the app estimates (vs. Sleeper facts). */
export const ModelTag = () => (
  <span className="text-amber text-[11px] font-extrabold tracking-wider uppercase">Model</span>
)

/** A compact horizontal meter (0-100). */
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="bg-panel h-2 overflow-hidden rounded-full"
    >
      <div
        className="bg-good h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
