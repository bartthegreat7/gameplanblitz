import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

export function Skeleton({ className = 'h-14' }: { className?: string }) {
  return <div aria-hidden className={`border-line bg-panel animate-pulse rounded-xl border ${className}`} />
}

/** Stacked skeleton rows sized like a list card, for loading states. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} />
      ))}
    </div>
  )
}

export function EmptyState({ children, icon = true }: { children: ReactNode; icon?: boolean }) {
  return (
    <div className="text-ink-3 flex flex-col items-center gap-2 px-2 py-5 text-center text-sm">
      {icon && <Inbox size={22} aria-hidden />}
      <div>{children}</div>
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border-bad/30 bg-bad/8 flex flex-col items-center gap-2 rounded-2xl border p-5 text-center">
      <AlertTriangle size={24} className="text-bad" aria-hidden />
      <div className="font-bold">{title}</div>
      {message && <div className="text-ink-2 text-sm break-words">{message}</div>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="border-line bg-card mt-1 inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-bold"
        >
          <RefreshCw size={16} aria-hidden /> Retry
        </button>
      )}
    </div>
  )
}

/** Inline warning banner (degraded data, missing feeds). */
export function Notice({ children, tone = 'caution' }: { children: ReactNode; tone?: 'caution' | 'ok' }) {
  return (
    <div
      role={tone === 'caution' ? 'note' : undefined}
      className={`mb-3 rounded-xl border px-3.5 py-3 text-sm ${
        tone === 'caution' ? 'border-amber/35 bg-amber/8 text-amber' : 'border-good/30 bg-good/8 text-ink-2'
      }`}
    >
      {children}
    </div>
  )
}
