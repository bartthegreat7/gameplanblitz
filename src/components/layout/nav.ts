import { LayoutDashboard, Newspaper, Settings, Trophy, Users } from 'lucide-react'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/standings', label: 'Standings', icon: Trophy },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const
