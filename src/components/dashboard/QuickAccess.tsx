import {
  ArrowLeftRight,
  ChevronRight,
  Coins,
  Gauge,
  ListChecks,
  Newspaper,
  Plus,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ComponentType } from 'react'

import type { Ready } from '../../hooks/useLeagueData'
import { bids, edge, lineupCheck, topFreeAgents } from '../../lib/insights'
import { OUT_INJ } from '../../lib/lineup'
import { EdgeCard } from '../cards/EdgeCard'
import { GameDayCard } from '../cards/GameDayCard'
import { LineupCheckCard } from '../cards/LineupCheckCard'
import { NewsCard } from '../cards/NewsCard'
import { PlayerValueCard, RosterCard } from '../cards/RosterCards'
import type { CardProps } from '../cards/shared'
import { TradeMachineCard } from '../cards/TradeMachineCard'
import { WaiverBidsCard, WaiverWireCard } from '../cards/WaiverCards'
import { CardBare } from '../ui/cardContext'
import { Panel } from '../ui/Overlay'
import { IconTile } from './DashboardCard'
import { CARD } from './styles'
import type { IconTone } from './styles'

interface Tool {
  id: string
  label: string
  summary: string
  icon: LucideIcon
  tone: IconTone
  Card: ComponentType<CardProps>
}

/**
 * The original dashboard tools, each one tap away in a side panel instead of a full-size card.
 * Summaries are live one-liners from the same calculations the tools use.
 */
export function QuickAccess({ data }: { data: Ready }) {
  const { model: m, matchups, league } = data
  const [open, setOpen] = useState<Tool | null>(null)

  const tools = useMemo<Tool[]>(() => {
    const issues = lineupCheck(m, matchups)
    const e = edge(m, matchups)
    const b = bids(m, league, matchups)
    const roster = m.myRoster()?.players ?? []
    const hurt = roster.filter((id) => m.injury(id)).length
    const out = roster.filter((id) => OUT_INJ.has(m.injury(id))).length
    const fa = topFreeAgents(m, 1)[0]
    const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
    return [
      {
        id: 'battles',
        label: 'Position Battles',
        summary: 'Your starters vs theirs, slot by slot',
        icon: Shield,
        tone: 'accent',
        Card: GameDayCard,
      },
      {
        id: 'check',
        label: 'Lineup Check',
        summary:
          issues === null
            ? 'No matchup posted'
            : issues.length
              ? `${n(issues.length, 'thing')} to fix before kickoff`
              : 'Your lineup is set',
        icon: ListChecks,
        tone: issues?.length ? 'coral' : 'good',
        Card: LineupCheckCard,
      },
      {
        id: 'edge',
        label: 'Free-Agent Edge',
        summary: e
          ? e.upgrades.length
            ? `${n(e.upgrades.length, 'free-agent upgrade')} · ${n(e.busts.length, 'bust risk')}`
            : 'No free agent beats a starter'
          : 'No matchup posted',
        icon: Sparkles,
        tone: 'purple',
        Card: EdgeCard,
      },
      {
        id: 'trade',
        label: 'Trade Machine',
        summary: 'Quick FantasyCalc-fair swaps',
        icon: ArrowLeftRight,
        tone: 'amber',
        Card: TradeMachineCard,
      },
      {
        id: 'wire',
        label: 'Waiver Wire',
        summary: fa ? `Top free agent: ${m.shortName(fa.id)}` : 'Top free agents by projection',
        icon: Plus,
        tone: 'good',
        Card: WaiverWireCard,
      },
      {
        id: 'bids',
        label: 'Waiver Bids',
        summary: b.usesFAAB
          ? `$${b.left} of $${b.budget} left · bid sheet`
          : 'Rolling waivers · add list',
        icon: Coins,
        tone: 'amber',
        Card: WaiverBidsCard,
      },
      {
        id: 'injuries',
        label: 'News & Injuries',
        summary: hurt
          ? `${n(hurt, 'player')} with an injury tag${out ? ` (${out} out)` : ''}`
          : 'Roster news and injury report',
        icon: Newspaper,
        tone: 'accent',
        Card: NewsCard,
      },
      {
        id: 'roster',
        label: 'My Roster',
        summary: `${n(roster.length, 'player')} · starters and projections`,
        icon: Users,
        tone: 'accent',
        Card: RosterCard,
      },
      {
        id: 'value',
        label: 'Player Value',
        summary: 'Season PPG and this week, blended',
        icon: Gauge,
        tone: 'purple',
        Card: PlayerValueCard,
      },
    ]
  }, [m, matchups, league])

  return (
    <section aria-labelledby="quick-access" className="pt-2">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="quick-access" className="text-xl font-extrabold tracking-tight">
          Quick access
        </h2>
        <p className="text-ink-3 text-sm">
          Every tool from the original dashboard, opened in a side panel.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpen(t)}
              aria-haspopup="dialog"
              aria-label={t.label}
              aria-describedby={`qa-${t.id}`}
              className={`${CARD} group hover:border-plan-line flex h-full w-full items-center gap-3.5 p-4 text-left transition-colors`}
            >
              <IconTile icon={t.icon} tone={t.tone} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t.label}</span>
                <span id={`qa-${t.id}`} className="text-ink-3 block truncate text-sm">
                  {t.summary}
                </span>
              </span>
              <ChevronRight
                size={18}
                aria-hidden
                className="text-ink-3 group-hover:text-ink shrink-0"
              />
            </button>
          </li>
        ))}
      </ul>
      <Panel open={!!open} onClose={() => setOpen(null)} title={open?.label ?? ''}>
        {open && (
          <CardBare.Provider value>
            <open.Card data={data} />
          </CardBare.Provider>
        )}
      </Panel>
    </section>
  )
}
