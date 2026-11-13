/* Command Center views. The tab lives in the URL (#/?tab=team) so every view can be linked to. */
export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team' },
  { id: 'matchup', label: 'Matchup' },
  { id: 'league', label: 'League' },
  { id: 'leaders', label: 'Leaders' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'reports', label: 'Reports' },
] as const

export type TabId = (typeof TABS)[number]['id']

export const isTab = (v: string | null): v is TabId => TABS.some((t) => t.id === v)
export const tabHref = (id: TabId) => (id === 'overview' ? '/' : `/?tab=${id}`)

/** Starter questions for the dashboard's AI Fantasy GM panel. */
export const DASHBOARD_SEEDS = [
  'Who should I start this week?',
  'Evaluate a trade for me',
  'Best waiver pickups?',
  'What are my playoff chances?',
]
