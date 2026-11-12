import { Outlet } from 'react-router-dom'

import { BottomNav } from './BottomNav'
import { LeagueBar } from './LeagueBar'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'

export function AppShell() {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="bg-mint text-mint-ink sr-only z-50 rounded-lg px-3 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top,0px),0.75rem)] pb-1 md:hidden">
          <span className="text-2xl font-extrabold tracking-tight">GameplanBlitz</span>
          <ThemeToggle />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 outline-none md:px-8 md:pb-10">
          <LeagueBar />
          <Outlet />
          <footer className="text-ink-3 mt-8 text-center text-xs leading-relaxed">
            Live rosters, lineups, injuries, standings &amp; projections from the Sleeper API · trade values from FantasyCalc.
            <br />
            Read-only — GameplanBlitz never posts to your league. Username &amp; layout saved in this browser only.
          </footer>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
