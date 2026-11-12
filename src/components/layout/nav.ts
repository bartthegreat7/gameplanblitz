import { ArrowLeftRight, Binoculars, Crosshair, LayoutDashboard, ListChecks, Newspaper, Settings, Trophy, Users } from 'lucide-react'

/** `primary` items get a tab on phones (using `short` when the label is long); the rest live in the "More" sheet. */
export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { to: '/lineup', label: 'Lineup', icon: ListChecks, primary: true },
  { to: '/waivers', label: 'Waivers', icon: Crosshair, primary: true },
  { to: '/trades', label: 'Trades', icon: ArrowLeftRight, primary: false },
  { to: '/scouting', label: 'Scouting', icon: Binoculars, primary: false },
  { to: '/news', label: 'News & Articles', short: 'News', icon: Newspaper, primary: true },
  { to: '/standings', label: 'Standings', icon: Trophy, primary: false },
  { to: '/players', label: 'Players', icon: Users, primary: false },
  { to: '/settings', label: 'Settings', icon: Settings, primary: false },
] as const
