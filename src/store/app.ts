import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

function systemTheme(): Theme {
  if (typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const toggleIn = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

interface AppState {
  theme: Theme
  username: string | null
  leagueId: string | null
  /** ids of dashboard cards the user collapsed */
  collapsed: string[]
  /** saved / read news article ids */
  bookmarks: string[]
  read: string[]

  toggleTheme: () => void
  setUsername: (u: string) => void
  setLeagueId: (id: string) => void
  /** forget the user and league (theme and local reading state are kept) */
  signOut: () => void
  toggleCollapsed: (id: string) => void
  toggleBookmark: (id: string) => void
  markRead: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: systemTheme(),
      username: null,
      leagueId: null,
      collapsed: [],
      bookmarks: [],
      read: [],

      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      setUsername: (u) => set({ username: u.trim().replace(/^@/, ''), leagueId: null }),
      setLeagueId: (id) => set({ leagueId: id }),
      signOut: () => set({ username: null, leagueId: null }),
      toggleCollapsed: (id) => set({ collapsed: toggleIn(get().collapsed, id) }),
      toggleBookmark: (id) => set({ bookmarks: toggleIn(get().bookmarks, id) }),
      markRead: (id) => {
        if (!get().read.includes(id)) set({ read: [...get().read, id].slice(-500) })
      },
    }),
    {
      name: 'gb-app',
      partialize: (s) => ({
        theme: s.theme,
        username: s.username,
        leagueId: s.leagueId,
        collapsed: s.collapsed,
        bookmarks: s.bookmarks,
        read: s.read,
      }),
    },
  ),
)

/** Keep <html data-theme> in sync with the store. */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}
