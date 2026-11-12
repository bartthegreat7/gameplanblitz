import {
  ArrowLeftRight,
  BellRing,
  Binoculars,
  Bot,
  Briefcase,
  CloudSun,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  ListChecks,
  ListOrdered,
  Lock,
  Medal,
  Newspaper,
  Podcast,
  Radio,
  Scale,
  Settings,
  Shirt,
  Target,
  Trophy,
  TrendingUp,
  UserPlus,
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
  id: 'leagues' | 'lab'
  label: string
  icon: LucideIcon
  children: NavLeaf[]
}

export type NavEntry = NavLeaf | NavGroup
export const isGroup = (e: NavEntry): e is NavGroup => 'children' in e

export const GAME_DAY: NavLeaf = { to: '/gameday', label: 'Game Day Live', icon: Radio }
export const SETTINGS: NavLeaf = { to: '/settings', label: 'Settings', icon: Settings }

export interface NavSection {
  id: string
  /** short heading shown above the section in the sidebar (none for the top entry) */
  label: string | null
  entries: NavEntry[]
}

/** Sidebar order, grouped under headings. "My Leagues" also lists the user's Sleeper leagues (rendered by the sidebar). */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'home',
    label: null,
    entries: [{ to: '/', label: 'Command Center', short: 'Home', icon: LayoutDashboard, primary: true }],
  },
  {
    id: 'fantasy',
    label: 'My Fantasy',
    entries: [
      {
        id: 'leagues',
        label: 'My Leagues',
        icon: Trophy,
        children: [{ to: '/standings', label: 'Standings', icon: ListOrdered }],
      },
      { to: '/team', label: 'My Team', icon: Shirt },
      { to: '/lineup', label: 'Lineup Optimizer', short: 'Lineup', icon: ListChecks, primary: true },
    ],
  },
  {
    id: 'tools',
    label: 'Player Tools',
    entries: [
      { to: '/players', label: 'Players & Projections', icon: Users },
      { to: '/waivers', label: 'Waivers & Pickups', short: 'Waivers', icon: UserPlus, primary: true },
      { to: '/trades', label: 'Trades', icon: ArrowLeftRight },
      { to: '/keepers', label: 'Keepers & Dynasty', icon: Lock },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    entries: [
      { to: '/ask', label: 'AI Fantasy GM', short: 'Ask GM', icon: Bot },
      { to: '/edge', label: 'The Edge (Insights)', icon: Zap },
      {
        id: 'lab',
        label: 'Strategy Lab',
        icon: FlaskConical,
        children: [
          { to: '/gm', label: 'Weekly GM Brief', icon: Briefcase },
          { to: '/startsit', label: 'Start/Sit', icon: Scale },
          { to: '/scouting', label: 'Opponent Scouting', icon: Binoculars },
          { to: '/breakouts', label: 'Breakout Radar', icon: TrendingUp },
          { to: '/market', label: 'Player Market', icon: LineChart },
          { to: '/injuries', label: 'Injury Center', icon: HeartPulse },
          { to: '/weather', label: 'Weather Watch', icon: CloudSun },
          { to: '/alerts', label: 'Alert Center', icon: BellRing },
          { to: '/accuracy', label: 'Projection Accuracy', icon: Target },
        ],
      },
      { to: '/playoffs', label: 'Playoff Simulator', icon: Medal },
    ],
  },
  {
    id: 'media',
    label: 'Media & Live',
    entries: [
      { to: '/studio', label: 'AI Podcast', icon: Podcast },
      { to: '/news', label: 'News & Analysis', short: 'News', icon: Newspaper, primary: true },
      GAME_DAY,
    ],
  },
]

/** Every sidebar entry in order (without section headings). */
export const NAV_TREE: NavEntry[] = NAV_SECTIONS.flatMap((s) => s.entries)

/** Every destination, flat (search, phone tabs). */
export const NAV_LINKS: NavLeaf[] = [
  ...NAV_TREE.flatMap((e) => (isGroup(e) ? e.children : [e])),
  SETTINGS,
]
