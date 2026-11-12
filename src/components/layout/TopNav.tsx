import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Menu, RefreshCw, Search } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useSession } from '../../hooks/useSession'
import { useAppStore } from '../../store/app'
import { Notifications, UserMenu, WeekSelect } from './Menus'
import { useSearchShortcut } from '../../hooks/useSearchShortcut'
import { SearchPalette } from './SearchPalette'
import { Logo } from './Sidebar'

const ICON_BTN =
  'border-line bg-card text-ink-2 hover:text-ink grid size-11 shrink-0 place-items-center rounded-full border transition-colors'
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export function TopNav({ onOpenNav }: { onOpenNav: () => void }) {
  const username = useAppStore((s) => s.username)
  const { week, currentWeek } = useSession()
  // the dashboard shows the week picker in its own header (as in the design)
  const onDashboard = useLocation().pathname === '/'
  const setViewWeek = useAppStore((s) => s.setViewWeek)
  const qc = useQueryClient()
  const fetching = useIsFetching() > 0
  const [search, setSearch] = useState(false)
  const openSearch = useCallback(() => setSearch(true), [])
  useSearchShortcut(openSearch)

  return (
    <header className="border-line bg-bg/85 sticky top-0 z-30 border-b px-4 pt-[max(env(safe-area-inset-top,0px),0.75rem)] pb-3 backdrop-blur md:px-6 md:pt-3">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className={`${ICON_BTN} md:hidden`}
        >
          <Menu size={20} aria-hidden />
        </button>
        <span className="md:hidden">
          <Logo collapsed />
        </span>
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search players, articles, or your league"
          aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          className="border-line bg-card text-ink-3 hover:border-accent/50 ml-auto flex h-11 min-w-0 items-center gap-3 rounded-xl border px-3 text-left transition-colors sm:ml-0 sm:max-w-xl sm:flex-1"
        >
          <Search size={18} aria-hidden className="text-ink-2" />
          <span className="hidden flex-1 truncate sm:inline">
            Search players, articles, or your league…
          </span>
          <kbd className="border-line bg-panel text-ink-3 hidden rounded-md border px-1.5 py-0.5 text-xs font-semibold sm:inline">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
        <div className="flex items-center gap-2 sm:ml-auto">
          {username && (
            <>
              {!onDashboard && <WeekSelect className="hidden lg:flex" />}
              <button
                type="button"
                onClick={() =>
                  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'players' })
                }
                aria-label="Refresh live data"
                className={`${ICON_BTN} ${onDashboard ? 'grid' : 'hidden sm:grid'}`}
              >
                <RefreshCw size={18} aria-hidden className={fetching ? 'animate-spin' : ''} />
              </button>
              <Notifications />
              <UserMenu />
            </>
          )}
        </div>
      </div>
      {username && !onDashboard && (
        <div className="mt-2.5 flex items-center gap-2 lg:hidden">
          {!onDashboard && <WeekSelect className="flex-1 sm:flex-none" />}
          <button
            type="button"
            onClick={() =>
              void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'players' })
            }
            aria-label="Refresh live data"
            className={`${ICON_BTN} sm:hidden`}
          >
            <RefreshCw size={18} aria-hidden className={fetching ? 'animate-spin' : ''} />
          </button>
        </div>
      )}
      {username && week !== currentWeek && (
        <p
          role="status"
          className="border-amber/40 bg-amber/10 text-ink-2 mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-sm"
        >
          <span>
            Viewing <b className="text-ink">Week {week}</b>. Every page shows that week's matchups,
            projections and results.
          </span>
          <button
            type="button"
            onClick={() => setViewWeek(null)}
            className="text-accent font-bold hover:underline"
          >
            Back to Week {currentWeek}
          </button>
        </p>
      )}
      <SearchPalette open={search} onClose={() => setSearch(false)} />
    </header>
  )
}
