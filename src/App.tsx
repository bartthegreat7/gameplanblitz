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
const Ask = lazy(() => import('./routes/Ask'))
const Studio = lazy(() => import('./routes/Studio'))
const Team = lazy(() => import('./routes/Team'))
const Weather = lazy(() => import('./routes/Weather'))
const Lab = lazy(() => import('./routes/Lab'))
const Scores = lazy(() => import('./routes/Scores'))
const Autopilot = lazy(() => import('./routes/Autopilot'))
const Xray = lazy(() => import('./routes/Xray'))
const Simulator = lazy(() => import('./routes/Simulator'))
const Academy = lazy(() => import('./routes/Academy'))
const LeagueHQ = lazy(() => import('./routes/LeagueHQ'))
const Luck = lazy(() => import('./routes/Luck'))
const Managers = lazy(() => import('./routes/Managers'))
const Accuracy = lazy(() => import('./routes/Accuracy'))
const Breakouts = lazy(() => import('./routes/Breakouts'))
const Injuries = lazy(() => import('./routes/Injuries'))
const StartSit = lazy(() => import('./routes/StartSit'))
const Market = lazy(() => import('./routes/Market'))
const Edge = lazy(() => import('./routes/Edge'))
const Alerts = lazy(() => import('./routes/Alerts'))
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
              <Route path="ask" element={<Ask />} />
              <Route path="studio" element={<Studio />} />
              <Route path="team" element={<Team />} />
              <Route path="weather" element={<Weather />} />
              <Route path="lab" element={<Lab />} />
              <Route path="scores" element={<Scores />} />
              <Route path="autopilot" element={<Autopilot />} />
              <Route path="xray" element={<Xray />} />
              <Route path="simulate" element={<Simulator />} />
              <Route path="academy" element={<Academy />} />
              <Route path="hq" element={<LeagueHQ />} />
              <Route path="luck" element={<Luck />} />
              <Route path="managers" element={<Managers />} />
              <Route path="accuracy" element={<Accuracy />} />
              <Route path="breakouts" element={<Breakouts />} />
              <Route path="injuries" element={<Injuries />} />
              <Route path="startsit" element={<StartSit />} />
              <Route path="market" element={<Market />} />
              <Route path="edge" element={<Edge />} />
              <Route path="alerts" element={<Alerts />} />
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
