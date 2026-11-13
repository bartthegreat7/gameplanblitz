import type { RecEntry } from '../analytics/autopilot'
import type { ManagerProfile, PartnerIdea, Tendency } from '../analytics/behavior'
import type { TeamLuck } from '../analytics/luck'
import { f1 } from '../format'
import { lineupTotal } from '../lineup'
import type { Model } from '../model'
import type { Fact } from './facts'

/*
 * The AI Fantasy GM's longer memory, as fact-sheet entries: the strategy you saved (your words,
 * labeled as yours), what Autopilot recommended earlier, your season's moves and luck, trade
 * partner evidence, and what losing each of your players would cost this week's best lineup.
 */

export type Draft = Omit<Fact, 'id'>

export interface GmMemory {
  goal: 'win-now' | 'balanced' | 'rebuild'
  risk: 'safe' | 'balanced' | 'aggressive'
  trades: 'open' | 'selective' | 'closed'
  /** free text, at most NOTES_MAX characters */
  notes: string
  updatedAt: number
}

export const NOTES_MAX = 400
export const DEFAULT_MEMORY: Omit<GmMemory, 'updatedAt'> = { goal: 'balanced', risk: 'balanced', trades: 'selective', notes: '' }

const GOAL = { 'win-now': 'win this season', balanced: 'balance this season and the future', rebuild: 'build for future seasons' }
const RISK = { safe: 'prefers safer, higher-floor players', balanced: 'balances floor and ceiling', aggressive: 'accepts more risk for upside' }
const TRADES = { open: 'is open to trading', selective: 'trades selectively', closed: 'prefers not to trade' }

export function memoryFacts(mem: GmMemory | null): Draft[] {
  if (!mem) return []
  const base = {
    topic: 'memory' as const,
    kind: 'fact' as const,
    source: 'Your saved GM preferences (this browser)',
    asOf: mem.updatedAt,
    players: [],
    to: '/ask',
  }
  const out: Draft[] = [
    { ...base, text: `Your saved strategy: you want to ${GOAL[mem.goal]}, ${RISK[mem.risk]}, and ${TRADES[mem.trades]}.`, data: { role: 'strategy', goal: mem.goal, risk: mem.risk, trades: mem.trades } },
  ]
  const notes = mem.notes.trim().slice(0, NOTES_MAX)
  if (notes) out.push({ ...base, text: `Your own note to the GM: "${notes}"`, data: { role: 'notes' } })
  return out
}

/** Earlier Autopilot recommendations still on record (newest first, at most `n`). */
export function recommendationFacts(history: RecEntry[], week: number, currentIds: Set<string>, n = 6): Draft[] {
  return [...history]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, n)
    .map((e) => {
      const status = e.week !== week ? `from Week ${e.week}` : currentIds.has(e.actionId) ? 'still recommended' : 'no longer supported by the data'
      return {
        topic: 'memory' as const,
        kind: 'model' as const,
        text: `Earlier recommendation (${status}): ${e.title} (${e.impact}).`,
        source: 'Fantasy Autopilot history (this browser)',
        asOf: e.lastSeen,
        players: [],
        to: '/autopilot',
        data: { role: 'previous' },
      }
    })
}

/** Your season so far: moves, FAAB, and luck. */
export function activityFacts(
  me: ManagerProfile | null,
  luck: TeamLuck | null,
  traits: Tendency[],
  asOf: number | null,
  m: Model,
): Draft[] {
  const out: Draft[] = []
  const base = { topic: 'history' as const, kind: 'fact' as const, players: [] as string[], asOf }
  if (me) {
    out.push({
      ...base,
      text: `Your moves this season: ${me.trades} trade${me.trades === 1 ? '' : 's'}, ${me.waiverClaims} waiver claim${me.waiverClaims === 1 ? '' : 's'} (${me.failedClaims} lost), ${me.freeAgentAdds} free-agent add${me.freeAgentAdds === 1 ? '' : 's'}${me.faabSpent ? `, $${me.faabSpent} FAAB spent` : ''}.`,
      source: 'Sleeper transactions',
      to: '/managers',
      data: { role: 'moves', trades: me.trades },
    })
    for (const [rid, n] of me.partners)
      out.push({ ...base, text: `You have traded with ${m.teamName(rid)} ${n} time${n === 1 ? '' : 's'} this season.`, source: 'Sleeper transactions', to: '/managers' })
  }
  for (const t of traits.slice(0, 3)) out.push({ ...base, text: `Your pattern: ${t.text.toLowerCase()} (${t.evidence}).`, source: 'Sleeper transactions and matchups', to: '/managers' })
  if (luck && luck.weeks.length)
    out.push({
      ...base,
      kind: 'model',
      text: `Your record luck: ${luck.w}-${luck.l}${luck.t ? `-${luck.t}` : ''} actual vs ${f1(luck.expectedWins)} expected wins from all-play (luck ${luck.luck >= 0 ? '+' : ''}${f1(luck.luck)}).`,
      source: 'Expected Wins & Luck (Sleeper scores)',
      to: '/luck',
      data: { role: 'luck', luck: Math.round(luck.luck * 10) / 10 },
    })
  return out
}

/** Possible trade partners with their evidence (intent is never claimed). */
export function partnerFacts(ideas: PartnerIdea[], m: Model, asOf: number | null): Draft[] {
  return ideas.slice(0, 3).map((x) => ({
    topic: 'trades' as const,
    kind: 'model' as const,
    text: `Possible trade partner: ${m.teamName(x.rosterId)}. ${x.reasons.join('. ')}. Whether they want to trade is unknown.`,
    source: 'Manager Tendencies + League X-Ray',
    asOf,
    players: [],
    to: '/managers',
    data: { role: 'partner' },
  }))
}

/**
 * What trading away each of your players would cost this week's best projected lineup, before
 * whatever comes back (Sleeper projections, league scoring), plus the market value.
 */
export function tradeImpactFacts(m: Model, asOf: number | null): Draft[] {
  const roster = (m.myRoster()?.players ?? []).filter((id) => m.players[id])
  const full = lineupTotal(m.optimal(roster))
  return roster
    .map((id) => {
      const without = lineupTotal(m.optimal(roster.filter((x) => x !== id)))
      return { id, loss: Math.max(0, full - without), value: m.fcValue(id) }
    })
    .filter((x) => x.loss > 0 || x.value > 0)
    .sort((a, b) => b.loss - a.loss || b.value - a.value)
    .slice(0, 10)
    .map((x) => ({
      topic: 'trades' as const,
      kind: 'model' as const,
      text: `If you trade ${m.name(x.id)} away, your best lineup this week projects ${f1(full - x.loss)} instead of ${f1(full)} (−${f1(x.loss)}) before what you get back${x.value > 0 ? `; FantasyCalc value ${Math.round(x.value)}` : ''}.`,
      source: 'Lineup optimizer (Sleeper projections) + FantasyCalc',
      asOf,
      players: [x.id],
      to: '/simulate',
      data: { role: 'impact', loss: Math.round(x.loss * 10) / 10 },
    }))
}
