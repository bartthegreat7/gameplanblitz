import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CARD, ICON_TONE, type IconTone } from './styles'

export function IconTile({
  icon: Icon,
  tone = 'accent',
  size = 'size-9',
}: {
  icon: LucideIcon
  tone?: IconTone
  size?: string
}) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-lg ${ICON_TONE[tone]}`}>
      <Icon size={18} aria-hidden />
    </span>
  )
}

/** Dashboard card: icon + title header, optional aside (context, toggle or link), body. */
export function DashboardCard({
  title,
  icon,
  tone = 'accent',
  aside,
  footer,
  className = '',
  children,
}: {
  title: string
  icon: LucideIcon
  tone?: IconTone
  aside?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className={`${CARD} flex min-w-0 flex-col p-4 ${className}`}>
      <div className="mb-3 flex min-h-9 items-center gap-2.5">
        <IconTile icon={icon} tone={tone} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight">{title}</h2>
        {aside}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer && <div className="mt-auto pt-3">{footer}</div>}
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
      className={`text-accent inline-flex items-center gap-1 text-sm font-bold hover:underline ${className}`}
    >
      {children} <ArrowRight size={15} aria-hidden />
    </Link>
  )
}

/** Small "model" marker for numbers the app estimates (vs. Sleeper facts). */
export const ModelTag = () => (
  <span className="text-amber text-[10px] font-extrabold tracking-wider uppercase">Model</span>
)

/** A compact horizontal meter (0-100). */
export function Meter({
  value,
  label,
  tone = 'good',
}: {
  value: number
  label: string
  tone?: 'good' | 'accent'
}) {
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
        className={`h-full rounded-full ${tone === 'good' ? 'bg-good' : 'bg-accent'}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/** Headline number card (Projected Score, Win Probability, Playoff Odds). */
export function StatCard({
  title,
  icon,
  tone,
  value,
  meter,
  sub,
  model = false,
  to,
}: {
  title: string
  icon: LucideIcon
  tone: IconTone
  value: ReactNode
  meter?: number | null
  sub?: ReactNode
  model?: boolean
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <IconTile icon={icon} tone={tone} />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold">{title}</h2>
        {model && <ModelTag />}
      </div>
      <div className="my-auto py-3 text-4xl font-extrabold tracking-tight tabular-nums xl:text-5xl">
        {value}
      </div>
      <div>
        {meter !== undefined && meter !== null && <Meter value={meter} label={title} />}
        {sub && <div className="text-ink-2 mt-2.5 text-sm">{sub}</div>}
      </div>
    </>
  )
  const inner = 'flex h-full min-h-40 flex-col'
  return (
    <section aria-label={title} className={`${CARD} min-w-0 p-4`}>
      {to ? (
        <Link to={to} className={inner}>
          {body}
        </Link>
      ) : (
        <div className={inner}>{body}</div>
      )}
    </section>
  )
}
