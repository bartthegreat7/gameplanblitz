import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { NavDrawer } from '../ui/Overlay'
import { BottomNav } from './BottomNav'
import { ConnectionBox, NavContent, Sidebar, ThemeSwitch } from './Sidebar'
import { TopNav } from './TopNav'

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const close = () => setNavOpen(false)
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="bg-accent text-accent-ink sr-only z-50 rounded-lg px-3 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav onOpenNav={() => setNavOpen(true)} />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1760px] flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 md:pb-12 lg:px-8 2xl:px-12"
        >
          <Outlet />
          <footer className="text-ink-3 mt-8 text-center text-xs leading-relaxed">
            Live rosters, lineups, injuries, standings &amp; projections from the Sleeper API ·
            trade values from FantasyCalc.
            <br />
            Read-only — GameplanBlitz never posts to your league. Username &amp; layout saved in
            this browser only.
          </footer>
        </main>
      </div>
      <BottomNav onMore={() => setNavOpen(true)} moreOpen={navOpen} />
      <NavDrawer open={navOpen} onClose={close} title="Menu">
        <div className="grid gap-4">
          <NavContent inDrawer onNavigate={close} />
          <ConnectionBox onNavigate={close} />
          <ThemeSwitch />
        </div>
      </NavDrawer>
    </div>
  )
}
