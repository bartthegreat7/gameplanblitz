import { ArrowLeftRight, Crosshair, LayoutDashboard, ListChecks, Newspaper, Settings, Trophy, Users } from 'lucide-react'

/** `primary` items get a tab on phones; the rest live in the "More" sheet. */
export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { to: '/lineup', label: 'Lineup', icon: ListChecks, primary: true },
  { to: '/waivers', label: 'Waivers', icon: Crosshair, primary: true },
  { to: '/trades', label: 'Trades', icon: ArrowLeftRight, primary: false },
  { to: '/news', label: 'News', icon: Newspaper, primary: true },
  { to: '/standings', label: 'Standings', icon: Trophy, primary: false },
  { to: '/players', label: 'Players', icon: Users, primary: false },
  { to: '/settings', label: 'Settings', icon: Settings, primary: false },
] as const
