import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import { createQueryClient } from './lib/queryClient'
import Connect from './routes/Connect'
import Dashboard from './routes/Dashboard'
import News from './routes/News'
import NotFound from './routes/NotFound'
import PlayerDetail from './routes/PlayerDetail'
import Players from './routes/Players'
import Settings from './routes/Settings'
import Standings from './routes/Standings'
import { applyTheme, useAppStore } from './store/app'

const defaultClient = createQueryClient()

export default function App({ client = defaultClient }: { client?: QueryClient }) {
  const theme = useAppStore((s) => s.theme)
  useEffect(() => applyTheme(theme), [theme])

  return (
    <QueryClientProvider client={client}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="connect" element={<Connect />} />
            <Route path="news" element={<News />} />
            <Route path="standings" element={<Standings />} />
            <Route path="players" element={<Players />} />
            <Route path="players/:id" element={<PlayerDetail />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
