import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'

import { PageSkeleton } from './components/LeagueGate'
import { AppShell } from './components/layout/AppShell'
import { createQueryClient } from './lib/queryClient'
import Connect from './routes/Connect'
import Dashboard from './routes/Dashboard'
import NotFound from './routes/NotFound'
import { applyTheme, useAppStore } from './store/app'

// The dashboard and connect screen load up front; the analysis pages are split into their own
// chunks so the first load stays small.
const GM = lazy(() => import('./routes/GM'))
const Lineup = lazy(() => import('./routes/Lineup'))
const Waivers = lazy(() => import('./routes/Waivers'))
const Trades = lazy(() => import('./routes/Trades'))
const Scouting = lazy(() => import('./routes/Scouting'))
const Playoffs = lazy(() => import('./routes/Playoffs'))
const Keepers = lazy(() => import('./routes/Keepers'))
const GameDay = lazy(() => import('./routes/GameDay'))
const News = lazy(() => import('./routes/News'))
const Standings = lazy(() => import('./routes/Standings'))
const Players = lazy(() => import('./routes/Players'))
const PlayerDetail = lazy(() => import('./routes/PlayerDetail'))
const Settings = lazy(() => import('./routes/Settings'))

const defaultClient = createQueryClient()

export default function App({ client = defaultClient }: { client?: QueryClient }) {
  const theme = useAppStore((s) => s.theme)
  useEffect(() => applyTheme(theme), [theme])

  return (
    <QueryClientProvider client={client}>
      <HashRouter>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="connect" element={<Connect />} />
              <Route path="gm" element={<GM />} />
              <Route path="lineup" element={<Lineup />} />
              <Route path="waivers" element={<Waivers />} />
              <Route path="trades" element={<Trades />} />
              <Route path="scouting" element={<Scouting />} />
              <Route path="playoffs" element={<Playoffs />} />
              <Route path="keepers" element={<Keepers />} />
              <Route path="gameday" element={<GameDay />} />
              <Route path="news" element={<News />} />
              <Route path="standings" element={<Standings />} />
              <Route path="players" element={<Players />} />
              <Route path="players/:id" element={<PlayerDetail />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </QueryClientProvider>
  )
}
