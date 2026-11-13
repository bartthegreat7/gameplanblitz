import { useRef, type KeyboardEvent } from 'react'

import { TABS, type TabId } from './tabs'

/**
 * The Command Center's view tabs: a pill selector (ARIA tablist: arrow keys, Home, End).
 * The page title lives in the top bar.
 */
export function CommandHeader({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + TABS.length) % TABS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    onTab(TABS[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 py-0.5">
      <div
        role="tablist"
        aria-label="Command Center views"
        onKeyDown={onKey}
        className="border-line/70 bg-sidebar/80 inline-flex min-w-max gap-1 rounded-xl border p-1 backdrop-blur-md"
      >
        {TABS.map((t, i) => {
          const on = t.id === tab
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`cc-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`cc-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onTab(t.id)}
              className={`min-h-9 rounded-lg px-4 text-[15px] font-semibold transition-colors sm:px-5 ${
                on
                  ? 'bg-select text-select-ink ring-accent/45 shadow-[0_8px_22px_-10px_var(--accent-deep)] ring-1 ring-inset'
                  : 'text-ink-2 hover:bg-raised hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
