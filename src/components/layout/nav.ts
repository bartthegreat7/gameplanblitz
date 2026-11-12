import {
  ArrowLeftRight,
  BarChart3,
  BellRing,
  Binoculars,
  Briefcase,
  HeartPulse,
  LineChart,
  Home,
  ListChecks,
  Lock,
  Medal,
  MessageSquareText,
  Newspaper,
  Plus,
  Radio,
  Scale,
  Settings,
  Target,
  Trophy,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export interface NavLeaf {
  to: string
  label: string
  /** short label for the phone tab bar */
  short?: string
  icon: LucideIcon
  /** gets a tab on phones; the rest live in the navigation drawer */
  primary?: boolean
}

export interface NavGroup {
  id: 'leagues' | 'analytics'
  label: string
  icon: LucideIcon
  children: NavLeaf[]
}

export type NavEntry = NavLeaf | NavGroup
export const isGroup = (e: NavEntry): e is NavGroup => 'children' in e

/** Sidebar order. "My Leagues" also lists the user's Sleeper leagues (rendered by the sidebar). */
export const NAV_TREE: NavEntry[] = [
  { to: '/', label: 'Dashboard', icon: Home, primary: true },
  { to: '/ask', label: 'AI Fantasy GM', short: 'Ask GM', icon: MessageSquareText },
  {
    id: 'leagues',
    label: 'My Leagues',
    icon: Trophy,
    children: [{ to: '/standings', label: 'Standings', icon: Trophy }],
  },
  { to: '/lineup', label: 'Lineup Optimizer', short: 'Lineup', icon: ListChecks, primary: true },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/waivers', label: 'Waiver Wire', short: 'Waivers', icon: Plus, primary: true },
  { to: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { to: '/keepers', label: 'Keeper Tools', icon: Lock },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    children: [
      { to: '/edge', label: 'The Edge', icon: Zap },
      { to: '/gm', label: 'Fantasy GM', icon: Briefcase },
      { to: '/startsit', label: 'Start/Sit', icon: Scale },
      { to: '/alerts', label: 'Alert Center', icon: BellRing },
      { to: '/breakouts', label: 'Breakout Radar', icon: TrendingUp },
      { to: '/market', label: 'Player Market', icon: LineChart },
      { to: '/injuries', label: 'Injury Center', icon: HeartPulse },
      { to: '/scouting', label: 'Opponent Scouting', icon: Binoculars },
      { to: '/playoffs', label: 'Playoff Simulator', icon: Medal },
      { to: '/accuracy', label: 'Projection Accuracy', icon: Target },
    ],
  },
  { to: '/news', label: 'News & Articles', short: 'News', icon: Newspaper, primary: true },
]

export const GAME_DAY: NavLeaf = { to: '/gameday', label: 'Game Day Mode', icon: Radio }
export const SETTINGS: NavLeaf = { to: '/settings', label: 'Settings', icon: Settings }

/** Every destination, flat (search, phone tabs). */
export const NAV_LINKS: NavLeaf[] = [
  ...NAV_TREE.flatMap((e) => (isGroup(e) ? e.children : [e])),
  GAME_DAY,
  SETTINGS,
]
