import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { KeeperRules } from '../lib/analytics/keepers'

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
  /** desktop sidebar shows icons only */
  sidebarCollapsed: boolean
  /** saved / read news article ids */
  bookmarks: string[]
  read: string[]
  /** keeper rules per league id (Sleeper does not store keeper costs) */
  keeperRules: Record<string, KeeperRules>
  /** week being viewed (null = the current NFL week); this session only, not saved */
  viewWeek: number | null
  /** AI service: the user agreed to send league facts to it (off by default) */
  aiConsent: boolean
  /** optional access token for the AI Worker, entered by the user (never built into the site) */
  aiToken: string
  /** read AI Fantasy GM answers aloud with a device voice */
  readAloud: boolean
  /** preferred device voices for the two podcast hosts */
  deviceVoices: [string | null, string | null]
  /** Aura voices for the two hosts (AI voices) */
  cloudVoices: [string, string]
  /** The Fantasy War Room: automatic weekly episodes (off until the user opts in) and their style */
  podcast: PodcastPrefs

  toggleTheme: () => void
  setTheme: (t: Theme) => void
  setViewWeek: (week: number | null) => void
  toggleSidebar: () => void
  setUsername: (u: string) => void
  setLeagueId: (id: string) => void
  /** forget the user and league (theme and local reading state are kept) */
  signOut: () => void
  toggleCollapsed: (id: string) => void
  toggleBookmark: (id: string) => void
  markRead: (id: string) => void
  toggleRead: (id: string) => void
  setKeeperRules: (leagueId: string, rules: KeeperRules | null) => void
  setAi: (p: Partial<Pick<AppState, 'aiConsent' | 'aiToken' | 'readAloud' | 'deviceVoices' | 'cloudVoices'>>) => void
  setPodcast: (p: Partial<PodcastPrefs>) => void
}

export interface PodcastPrefs {
  /** prepare this week's shows automatically (explicit opt-in) */
  auto: boolean
  shows: ('recap' | 'preview' | 'kickoff')[]
  length: 'short' | 'standard'
  format: 'solo' | 'debate'
  /** humor adds good-natured, number-free league ribbing */
  tone: 'straight' | 'humor'
  /** show "Your Weekly Fantasy Briefing Is Ready" on the dashboard */
  banner: boolean
}

export const DEFAULT_PODCAST: PodcastPrefs = { auto: false, shows: ['recap', 'preview'], length: 'standard', format: 'debate', tone: 'straight', banner: true }

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: systemTheme(),
      username: null,
      leagueId: null,
      collapsed: [],
      sidebarCollapsed: false,
      bookmarks: [],
      read: [],
      keeperRules: {},
      viewWeek: null,
      aiConsent: false,
      aiToken: '',
      readAloud: false,
      deviceVoices: [null, null],
      cloudVoices: ['orion', 'asteria'],

      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      setTheme: (t) => set({ theme: t }),
      setViewWeek: (week) => set({ viewWeek: week }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setUsername: (u) => set({ username: u.trim().replace(/^@/, ''), leagueId: null }),
      setLeagueId: (id) => set({ leagueId: id, viewWeek: null }),
      signOut: () => set({ username: null, leagueId: null, viewWeek: null }),
      toggleCollapsed: (id) => set({ collapsed: toggleIn(get().collapsed, id) }),
      toggleBookmark: (id) => set({ bookmarks: toggleIn(get().bookmarks, id) }),
      markRead: (id) => {
        if (!get().read.includes(id)) set({ read: [...get().read, id].slice(-500) })
      },
      toggleRead: (id) => set({ read: toggleIn(get().read, id).slice(-500) }),
      setKeeperRules: (leagueId, rules) => {
        const next = { ...get().keeperRules }
        if (rules) next[leagueId] = rules
        else delete next[leagueId]
        set({ keeperRules: next })
      },
      setAi: (p) => set(p),
      podcast: DEFAULT_PODCAST,
      setPodcast: (p) => set({ podcast: { ...get().podcast, ...p } }),
    }),
    {
      name: 'gb-app',
      partialize: (s) => ({
        theme: s.theme,
        username: s.username,
        leagueId: s.leagueId,
        collapsed: s.collapsed,
        sidebarCollapsed: s.sidebarCollapsed,
        bookmarks: s.bookmarks,
        read: s.read,
        keeperRules: s.keeperRules,
        aiConsent: s.aiConsent,
        aiToken: s.aiToken,
        readAloud: s.readAloud,
        deviceVoices: s.deviceVoices,
        cloudVoices: s.cloudVoices,
        podcast: s.podcast,
      }),
    },
  ),
)

/** Keep <html data-theme> in sync with the store. */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}
