import { useRef, type KeyboardEvent } from 'react'

import { useSession } from '../../hooks/useSession'
import { useAppStore } from '../../store/app'
import { WeekSelect } from '../layout/Menus'
import { TABS, type TabId } from './tabs'

/** Page title, the league / week pickers and the view tabs (an ARIA tablist: arrow keys, Home, End). */
export function CommandHeader({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  const { leagues, leagueId } = useSession()
  const setLeagueId = useAppStore((s) => s.setLeagueId)
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
    <header className="grid gap-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h1 className="text-2xl leading-tight sm:text-[1.75rem] font-extrabold tracking-tight md:text-[2.125rem]">
            Fantasy Football Command Center
          </h1>
          <p className="text-ink-2 mt-1 text-sm sm:text-base md:text-lg">
            Your AI-powered war room for a championship season.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leagues.length > 1 && (
            <label className="border-line bg-card/80 flex h-11 items-center gap-2 rounded-xl border pl-3 backdrop-blur-md">
              <span className="text-ink-3 text-sm font-semibold">League</span>
              <select
                id="league-select"
                value={leagueId ?? ''}
                onChange={(e) => setLeagueId(e.target.value)}
                className="h-full max-w-56 rounded-xl bg-transparent pr-2 font-bold outline-none"
              >
                {leagues.map((l) => (
                  <option key={l.league_id} value={l.league_id} className="bg-card">
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <WeekSelect className="bg-card/80 backdrop-blur-md" />
        </div>
      </div>
      <div className="border-line/60 overflow-x-auto overflow-y-hidden border-b">
        <div
          role="tablist"
          aria-label="Command Center views"
          onKeyDown={onKey}
          className="flex min-w-max gap-1"
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
                className={`relative min-h-11 rounded-t-lg px-4 text-[15px] font-bold transition-colors focus-visible:-outline-offset-2 ${
                  on
                    ? 'text-ink after:bg-accent-deep after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:rounded-full'
                    : 'text-ink-2 hover:bg-raised/60 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
