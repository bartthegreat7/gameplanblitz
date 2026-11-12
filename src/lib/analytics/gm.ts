import type { Confidence } from '../evidence'
import { f1, signed } from '../format'
import type { Article } from '../news'
import type { KeeperCandidate } from './keepers'
import type { LineupAnalysis } from './lineupAnalysis'
import type { TeamOdds } from './playoffs'
import type { HeadToHead } from './scouting'
import type { FinderResult } from './trades'
import type { WaiverReport } from './waivers'

/* The Fantasy GM: a rules-based brief assembled from the app's own tools. It adds no new numbers:
   every action points to the tool (and evidence) it came from. No AI is involved. */

export type Area =
  | 'lineup'
  | 'injury'
  | 'weather'
  | 'waivers'
  | 'breakout'
  | 'trades'
  | 'news'
  | 'playoffs'
  | 'keepers'
/** 1 = do now (a fact needs fixing), 2 = this week, 3 = worth considering */
export type Priority = 1 | 2 | 3

export interface GmAction {
  id: string
  area: Area
  priority: Priority
  title: string
  detail: string
  /** the size of the effect, in the tool's own units */
  impact: string
  confidence: Confidence | null
  /** what could make this wrong, in plain words (when not covered by `confidence`) */
  uncertainty?: string
  /** when it has to be done by */
  deadline?: string
  sources: string[]
  /** the player the action is about, when there is one (for a photo) */
  playerId?: string
  /** route of the tool behind it */
  to: string
}

export interface GmSummary {
  week: number
  opponent: string | null
  myProj: number | null
  oppProj: number | null
  winPct: number | null
  playoffPct: number | null
  championPct: number | null
}

export interface GmBrief {
  summary: GmSummary
  actions: GmAction[]
}

export interface GmInput {
  week: number
  opponent: string | null
  lineup: LineupAnalysis | null
  waivers: WaiverReport | null
  trades: FinderResult | null
  h2h: HeadToHead | null
  playoff: TeamOdds | null
  /** recent articles about my players, newest first */
  myNews: Article[]
  keepers: KeeperCandidate[] | null
  /** extra actions from other signals (injury watch, weather, breakouts, injury openings) */
  extras?: GmAction[]
  /** show keeper notes (keeper/dynasty league) */
  keeperLeague: boolean
}

export const MAX_ACTIONS = 8
const NEWS_ITEMS = 2
/** Projected-only lineup changes smaller than this are noise, not an action (same floor as Game Day swaps). */
export const MIN_LINEUP_GAIN = 0.5

/** `max` caps the list (the dashboard and GM page show the top 8; The Edge shows everything). */
export function buildBrief(i: GmInput, max = MAX_ACTIONS): GmBrief {
  const actions: GmAction[] = []

  // ---- lineup: facts first (Out, bye, empty), then projected upgrades, largest gain first
  const slots = [...(i.lineup?.plan.slots ?? [])].sort((a, b) => b.delta - a.delta)
  for (const s of slots) {
    if (!s.changed || !s.recommended || s.move) continue
    const p = s.partner ?? s.current
    const forced = !s.current || !!s.current.out || !!s.current.bye
    if (!forced && s.delta < MIN_LINEUP_GAIN) continue
    actions.push({
      id: `lineup-${s.recommended.id}`,
      playerId: s.recommended.id,
      area: 'lineup',
      priority: forced ? 1 : 2,
      title: !s.current
        ? `Fill your empty ${s.label} slot with ${s.recommended.name}`
        : forced
          ? `Replace ${s.current.name} (${s.current.out ? s.current.injury : 'bye'}) with ${s.recommended.name}`
          : `Start ${s.recommended.name} over ${p?.name ?? 'your current starter'}`,
      detail: s.reasons[0] ?? '',
      impact: `${signed(s.delta)} projected pts`,
      confidence: s.confidence,
      sources: [
        `Sleeper projections${i.lineup?.provider ? ` (${i.lineup.provider})` : ''}`,
        'Lineup Optimizer',
      ],
      to: '/lineup',
    })
  }

  // ---- waivers: the best upgrade
  const add = i.waivers?.candidates.find((c) => c.kind === 'upgrade')
  if (add)
    actions.push({
      id: `waiver-${add.id}`,
      playerId: add.id,
      area: 'waivers',
      priority: add.tier === 'must' ? 2 : 3,
      title: `Add ${add.name}${add.drop ? `, drop ${add.drop.name}` : ''}`,
      detail: add.reasons[0] ?? '',
      impact: `${signed(add.gainPerWeek)} pts/wk`,
      confidence: add.confidence,
      sources: ['Sleeper projections (next weeks)', 'Waiver Wire Sniper'],
      to: '/waivers',
    })

  // ---- trades: the best win-win swap
  const deal = i.trades?.mutual[0]
  if (deal)
    actions.push({
      id: `trade-${deal.get.players[0]}`,
      area: 'trades',
      priority: 3,
      title: `Explore a trade with ${deal.theirName}: get ${deal.get.players.length} for ${deal.give.players.length}`,
      detail: deal.reasons.slice(0, 2).join(' '),
      impact: `${signed(deal.you.total)} pts over ${deal.activeWeeks} wk, they gain ${signed(deal.them.total)}`,
      confidence: deal.confidence,
      sources: ['FantasyCalc values', 'Sleeper projections', 'Trade War Room'],
      to: '/trades',
    })

  // ---- news: recent coverage of my players (facts, no interpretation)
  for (const a of i.myNews.slice(0, NEWS_ITEMS))
    actions.push({
      id: `news-${a.id}`,
      area: 'news',
      priority: 2,
      title: `Read: ${a.title}`,
      detail: a.excerpt ?? '',
      impact:
        (a.players ?? [])
          .map((p) => p.name)
          .slice(0, 3)
          .join(', ') || 'Your roster',
      confidence: null,
      sources: [a.publisher ?? 'Publisher'],
      to: '/news',
    })

  // ---- playoffs: only when the race is open
  if (i.playoff && i.playoff.playoffPct > 5 && i.playoff.playoffPct < 95)
    actions.push({
      id: 'playoffs',
      area: 'playoffs',
      priority: 3,
      title: `Playoff race: ${f1(i.playoff.playoffPct)}% to make it`,
      detail: `Average finish ${f1(i.playoff.avgSeed)} with ${f1(i.playoff.avgWins)} wins in the simulator. See which results matter most.`,
      impact: `${f1(i.playoff.championPct)}% title odds`,
      confidence: null,
      sources: ['Playoff Simulator (model)'],
      to: '/playoffs',
    })

  // ---- keepers: the best saving, in keeper leagues
  const keep = i.keeperLeague ? i.keepers?.find((k) => k.recommended) : undefined
  if (keep && keep.surplus !== null)
    actions.push({
      id: `keeper-${keep.id}`,
      area: 'keepers',
      priority: 3,
      title: `Keeper outlook: ${keep.name}`,
      detail: keep.reasons.slice(0, 2).join(' '),
      impact: `saves ${keep.surplus} round${keep.surplus === 1 ? '' : 's'}`,
      confidence: null,
      sources: ['Your keeper rules', 'FantasyCalc dynasty values'],
      to: '/keepers',
    })

  actions.push(...(i.extras ?? []))
  const order: Area[] = [
    'lineup',
    'injury',
    'news',
    'waivers',
    'breakout',
    'weather',
    'trades',
    'playoffs',
    'keepers',
  ]
  actions.sort((a, b) => a.priority - b.priority || order.indexOf(a.area) - order.indexOf(b.area))

  return {
    summary: {
      week: i.week,
      opponent: i.opponent,
      myProj: i.h2h?.myProj ?? null,
      oppProj: i.h2h?.theirProj ?? null,
      winPct: i.h2h?.winPct ?? null,
      playoffPct: i.playoff?.playoffPct ?? null,
      championPct: i.playoff?.championPct ?? null,
    },
    actions: actions.slice(0, max),
  }
}
