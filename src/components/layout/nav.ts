import {
  ArrowLeftRight,
  BarChart3,
  BellRing,
  Binoculars,
  Briefcase,
  CircleGauge,
  CloudSun,
  Crown,
  FlaskConical,
  FlaskRound,
  Gauge,
  Headphones,
  HeartPulse,
  Home,
  Layers,
  LineChart,
  ListOrdered,
  Medal,
  Newspaper,
  PlusCircle,
  ScanSearch,
  Radio,
  Scale,
  Settings,
  Sparkles,
  Target,
  Trophy,
  TrendingUp,
  Users,
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
  /** a small "New" tag in the sidebar */
  isNew?: boolean
  /** other paths that count as this entry (a hub and the pages it opens) */
  also?: string[]
  /** one line for hub pages */
  blurb?: string
}

export interface NavGroup {
  id: 'leagues'
  label: string
  icon: LucideIcon
  children: NavLeaf[]
}

export type NavEntry = NavLeaf | NavGroup
export const isGroup = (e: NavEntry): e is NavGroup => 'children' in e

export const GAME_DAY: NavLeaf = { to: '/gameday', label: 'Game Day Live', icon: Radio }
export const SETTINGS: NavLeaf = { to: '/settings', label: 'Settings', icon: Settings }

/** The analysis tools collected on the Strategy Lab page. */
export const LAB_TOOLS: NavLeaf[] = [
  { to: '/gm', label: 'Weekly GM Brief', icon: Briefcase, blurb: "This week's to-do list and report, ranked by urgency." },
  { to: '/startsit', label: 'Start/Sit', icon: Scale, blurb: 'Simulate close calls between 2-4 players.' },
  { to: '/scouting', label: 'Opponent Scouting', icon: Binoculars, blurb: 'Any team: results, set lineup, strengths by position.' },
  { to: '/breakouts', label: 'Breakout Radar', icon: TrendingUp, blurb: 'Rising usage before the points follow.' },
  { to: '/market', label: 'Player Market', icon: LineChart, blurb: 'Trade values, 30-day trends, buy-low and sell-high signals.' },
  { to: '/injuries', label: 'Injury Center', icon: HeartPulse, blurb: 'Designations, team context and the injury domino effect.' },
  { to: '/weather', label: 'Weather Watch', icon: CloudSun, blurb: "Every game's forecast and the players involved." },
  { to: '/alerts', label: 'Alert Center', icon: BellRing, blurb: 'What changed since your last visit.' },
  { to: '/accuracy', label: 'Projection Accuracy', icon: Target, blurb: 'How the projection engine scores against results.' },
]

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
    entries: [{ to: '/', label: 'Command Center', short: 'Home', icon: Home, primary: true }],
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
      { to: '/team', label: 'My Team', icon: Users },
      { to: '/lineup', label: 'Lineup Optimizer', short: 'Lineup', icon: Layers, primary: true },
    ],
  },
  {
    id: 'tools',
    label: 'Player Tools',
    entries: [
      { to: '/players', label: 'Players & Projections', icon: BarChart3 },
      { to: '/waivers', label: 'Waivers & Pickups', short: 'Waivers', icon: PlusCircle, primary: true },
      { to: '/trades', label: 'Trades', icon: ArrowLeftRight },
      { to: '/keepers', label: 'Keepers & Dynasty', icon: Crown },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    entries: [
      { to: '/autopilot', label: 'Fantasy Autopilot', icon: Gauge, isNew: true },
      { to: '/ask', label: 'AI Fantasy GM', short: 'Ask GM', icon: Sparkles, isNew: true },
      { to: '/edge', label: 'The Edge (Insights)', icon: CircleGauge },
      { to: '/xray', label: 'League X-Ray', icon: ScanSearch },
      { to: '/lab', label: 'Strategy Lab', icon: FlaskConical, also: LAB_TOOLS.map((t) => t.to) },
      { to: '/simulate', label: 'What-If Simulator', icon: FlaskRound },
      { to: '/playoffs', label: 'Playoff Simulator', icon: Medal },
    ],
  },
  {
    id: 'media',
    label: 'Media & Live',
    entries: [
      { to: '/studio', label: 'AI Podcast', icon: Headphones, isNew: true },
      { to: '/scores', label: 'Scores Around the League', icon: Trophy },
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
  ...LAB_TOOLS,
  SETTINGS,
]
