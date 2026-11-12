import { Outlet } from 'react-router-dom'

import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'

export function AppShell() {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top,0px),0.75rem)] pb-1 md:hidden">
          <span className="text-2xl font-extrabold tracking-tight">GameplanBlitz</span>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
