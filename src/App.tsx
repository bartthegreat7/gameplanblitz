import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import Dashboard from './routes/Dashboard'
import News from './routes/News'
import Players from './routes/Players'
import Settings from './routes/Settings'
import Standings from './routes/Standings'
import { applyTheme, useAppStore } from './store/app'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
})

export default function App() {
  const theme = useAppStore((s) => s.theme)
  useEffect(() => applyTheme(theme), [theme])

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="news" element={<News />} />
            <Route path="standings" element={<Standings />} />
            <Route path="players" element={<Players />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
