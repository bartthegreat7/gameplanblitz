import { f1, ordinal, signed, trunc } from '../format'
import type { GmAction } from '../analytics/gm'
import type { KeeperCandidate } from '../analytics/keepers'
import type { LineupAnalysis } from '../analytics/lineupAnalysis'
import type { TeamOdds } from '../analytics/playoffs'
import { projectedLineup, type HeadToHead } from '../analytics/scouting'
import type { FinderResult, TradeEvaluation } from '../analytics/trades'
import type { WaiverReport } from '../analytics/waivers'
import { standings, type GameDay } from '../insights'
import type { Model } from '../model'
import type { Article } from '../news'
import { tsOf } from '../newsFeed'
import type { SleeperMatchup } from '../sleeper'

/* The fact sheet: every number the AI Fantasy GM may use, as short sentences
   built only from what GameplanBlitz's tools already computed. Each fact is labeled as a Sleeper/
   publisher fact or a model output, with its source and timestamp. Nothing here is estimated anew. */

export type Topic =
  | 'matchup'
  | 'lineup'
  | 'injury'
  | 'weather'
  | 'projection'
  | 'waivers'
  | 'breakout'
  | 'trades'
  | 'playoffs'
  | 'standings'
  | 'keepers'
  | 'news'
  | 'recap'
  | 'scouting'

export const TOPIC_ORDER: Topic[] = [
  'matchup',
  'lineup',
  'injury',
  'weather',
  'projection',
  'waivers',
  'breakout',
  'trades',
  'playoffs',
  'standings',
  'keepers',
  'news',
  'recap',
  'scouting',
]

export interface Fact {
  /** F1, F2, … (stable within one sheet) */
  id: string
  topic: Topic
  /** fact = reported by Sleeper or a publisher; model = projection, simulation or recommendation */
  kind: 'fact' | 'model'
  text: string
  source: string
  /** when the underlying data was fetched or published (ms), null when unknown */
  asOf: number | null
  /** player ids the fact is about */
  players: string[]
  /** the GameplanBlitz tool behind it */
  to: string
  /** machine-readable values for the built-in answers (always also present in `text`) */
  data?: Record<string, number | string>
}

export interface Stamps {
  sleeper: number | null
  projections: number | null
  values: number | null
  news: number | null
  model: number | null
}

export interface EngineView {
  value: number
  baseline: number
  floor: number | null
  ceiling: number | null
}

export interface FactInput {
  m: Model
  week: number
  gd: GameDay | null
  /** live points when games have started (Sleeper matchup points) */
  live: { mine: number; theirs: number } | null
  lineup: LineupAnalysis | null
  waivers: WaiverReport | null
  trades: FinderResult | null
  h2h: HeadToHead | null
  playoff: TeamOdds | null
  playoffTeams: number
  myNews: Article[]
  keepers: KeeperCandidate[] | null
  keeperLeague: boolean
  /** The Edge's extra signals: injury watch, weather risk, breakouts, injury openings */
  extras: GmAction[]
  /** the projection engine's view of a player (null when unavailable) */
  engine: ((id: string) => EngineView | null) | null
  /** last completed week's matchups, for recaps */
  lastWeek: { week: number; matchups: SleeperMatchup[] } | null
  stamps: Stamps
}

export const MAX_FACTS = 220

type Draft = Omit<Fact, 'id'>

const rec = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ''}`
const pctText = (x: number) => (x >= 99.95 ? '100%' : x > 0 && x < 0.5 ? 'under 1%' : `${Math.round(x)}%`)

export function buildFacts(i: FactInput): Fact[] {
  const { m, week, stamps } = i
  const out: Draft[] = []
  const add = (d: Draft) => out.push(d)
  const table = standings(m)
  const place = (rosterId: number) => table.findIndex((r) => r.rosterId === rosterId) + 1
  const rowOf = (rosterId: number) => table.find((r) => r.rosterId === rosterId)
  const myStarters = new Set(i.lineup?.plan.slots.map((s) => s.current?.id).filter(Boolean) as string[])

  // ---- matchup
  if (i.gd) {
    const gd = i.gd
    if (gd.oppRosterId !== null) {
      const r = rowOf(gd.oppRosterId)
      add({
        topic: 'matchup',
        kind: 'fact',
        text: `Week ${week} opponent: ${gd.oppName}${r ? ` (${rec(r.w, r.l, r.t)}, ${ordinal(place(gd.oppRosterId))} place)` : ''}.`,
        source: 'Sleeper matchups',
        asOf: stamps.sleeper,
        players: [],
        to: '/scouting',
      })
      add({
        topic: 'matchup',
        kind: 'model',
        text: `Projected Week ${week} score with both best lineups: ${gd.myName} ${f1(gd.myProj)}, ${gd.oppName} ${f1(gd.oppProj)}. Win probability ${gd.winPct}%.`,
        source: 'Sleeper projections; GameplanBlitz win model',
        asOf: stamps.projections,
        players: [],
        to: '/gameday',
        data: { myProj: gd.myProj, oppProj: gd.oppProj, winPct: gd.winPct },
      })
      if (i.live)
        add({
          topic: 'matchup',
          kind: 'fact',
          text: `Live Week ${week} score: ${gd.myName} ${f1(i.live.mine)}, ${gd.oppName} ${f1(i.live.theirs)}.`,
          source: 'Sleeper matchups',
          asOf: stamps.sleeper,
          players: [],
          to: '/gameday',
        })
    } else
      add({
        topic: 'matchup',
        kind: 'fact',
        text: `You have no opponent posted for Week ${week}.`,
        source: 'Sleeper matchups',
        asOf: stamps.sleeper,
        players: [],
        to: '/gameday',
      })
  }

  // ---- lineup (Lineup Optimizer, Sleeper projections)
  const plan = i.lineup?.plan
  if (plan) {
    for (const s of plan.slots) {
      const c = s.current
      if (!c)
        add({
          topic: 'lineup',
          kind: 'fact',
          text: `Your ${s.label} slot is empty in Sleeper.`,
          source: 'Sleeper matchups',
          asOf: stamps.sleeper,
          players: [],
          to: '/lineup',
        })
      else
        add({
          topic: 'lineup',
          kind: 'model',
          text: `Current ${s.label} starter: ${m.name(c.id)} (${c.pos}, ${c.team || 'FA'}${c.opponent ? ` vs ${c.opponent}` : ''})${c.bye ? ', on bye' : ''}${c.out ? `, listed ${c.injury}` : ''}. Sleeper projection ${f1(c.proj)} pts${c.floor !== null && c.ceiling !== null ? `, typical range ${f1(c.floor)} to ${f1(c.ceiling)}` : ''}.`,
          source: `Sleeper projections${i.lineup?.provider ? ` (${i.lineup.provider})` : ''}`,
          asOf: stamps.projections,
          players: [c.id],
          to: '/lineup',
          data: { role: 'starter', proj: c.proj, ...(c.floor !== null ? { floor: c.floor } : {}), ...(c.ceiling !== null ? { ceiling: c.ceiling } : {}) },
        })
    }
    const swaps = plan.slots.filter((s) => s.changed && s.recommended && !s.move)
    for (const s of swaps) {
      const p = s.partner ?? s.current
      add({
        topic: 'lineup',
        kind: 'model',
        text: `Lineup Optimizer recommends starting ${m.name(s.recommended!.id)} at ${s.label}${p ? ` instead of ${m.name(p.id)}` : ' in the empty slot'}: ${signed(s.delta)} projected pts${s.confidence ? `, ${s.confidence.level} confidence` : ''}.`,
        source: 'Lineup Optimizer (Sleeper projections)',
        asOf: stamps.projections,
        players: [s.recommended!.id, ...(p ? [p.id] : [])],
        to: '/lineup',
        data: { role: 'swap', delta: s.delta },
      })
    }
    if (swaps.length === 0)
      add({
        topic: 'lineup',
        kind: 'model',
        text: `Lineup Optimizer: your current lineup is already your best projected lineup (${f1(plan.recommended.proj)} pts).`,
        source: 'Lineup Optimizer (Sleeper projections)',
        asOf: stamps.projections,
        players: [],
        to: '/lineup',
      })
    else
      add({
        topic: 'lineup',
        kind: 'model',
        text: `Best projected lineup: ${f1(plan.recommended.proj)} pts, versus ${f1(plan.current.proj)} pts as currently set.`,
        source: 'Lineup Optimizer (Sleeper projections)',
        asOf: stamps.projections,
        players: [],
        to: '/lineup',
      })
    const bench = (i.lineup?.candidates ?? [])
      .filter((c) => !myStarters.has(c.id))
      .sort((a, b) => b.proj - a.proj)
      .slice(0, 6)
    for (const c of bench)
      add({
        topic: 'lineup',
        kind: 'model',
        text: `Bench: ${m.name(c.id)} (${c.pos}, ${c.team || 'FA'})${c.bye ? ', on bye' : ''}${c.injury ? `, listed ${c.injury}` : ''}. Sleeper projection ${f1(c.proj)} pts.`,
        source: 'Sleeper projections',
        asOf: stamps.projections,
        players: [c.id],
        to: '/lineup',
        data: { role: 'bench', proj: c.proj },
      })
  }

  // ---- injuries (Sleeper designations) and The Edge's injury watch
  for (const id of m.myRoster()?.players ?? []) {
    const status = m.injury(id)
    if (!status) continue
    add({
      topic: 'injury',
      kind: 'fact',
      text: `Sleeper lists ${m.name(id)} (${m.pos(id)}, ${m.team(id) || 'FA'}) as ${status}${myStarters.has(id) ? ' and in your starting lineup' : ''}.`,
      source: 'Sleeper injury designations',
      asOf: stamps.sleeper,
      players: [id],
      to: '/injuries',
    })
  }
  const edgeFact = (a: GmAction, topic: Topic) =>
    add({
      topic,
      kind: 'model',
      text: `${a.title}. ${a.detail ? `${a.detail.replace(/\.$/, '')}. ` : ''}Impact: ${a.impact}.${a.deadline ? ` Deadline: ${a.deadline}.` : ''}`,
      source: a.sources.join('; '),
      asOf: topic === 'weather' ? null : stamps.sleeper,
      players: a.playerId ? [a.playerId] : [],
      to: a.to,
    })
  for (const a of i.extras) {
    if (a.area === 'injury') edgeFact(a, 'injury')
    else if (a.area === 'weather') edgeFact(a, 'weather')
    else if (a.area === 'breakout') edgeFact(a, 'breakout')
    else if (a.id.startsWith('opening')) edgeFact(a, 'breakout')
  }

  // ---- projection engine, for my players and the top waiver targets
  if (i.engine) {
    const ids = [
      ...(m.myRoster()?.players ?? []),
      ...(i.waivers?.candidates.slice(0, 4).map((c) => c.id) ?? []),
    ]
    for (const id of [...new Set(ids)]) {
      const e = i.engine(id)
      if (!e || e.value <= 0) continue
      const range = e.floor !== null && e.ceiling !== null
      add({
        topic: 'projection',
        kind: 'model',
        text: `GameplanBlitz projection for ${m.name(id)} (${m.pos(id)}) in Week ${week}: ${f1(e.value)} pts${range ? `, 80% range ${f1(e.floor)} to ${f1(e.ceiling)}` : ''}; Sleeper's projection ${f1(e.baseline)}.`,
        source: 'GameplanBlitz projection engine',
        asOf: stamps.model,
        players: [id],
        to: `/players/${id}`,
        data: { value: e.value, baseline: e.baseline, ...(range ? { floor: e.floor!, ceiling: e.ceiling! } : {}) },
      })
    }
  }

  // ---- waivers
  for (const c of (i.waivers?.candidates ?? []).filter((c) => c.kind !== 'none').slice(0, 5)) {
    add({
      topic: 'waivers',
      kind: 'model',
      text:
        c.kind === 'upgrade'
          ? `Waiver target: ${m.name(c.id)} (${c.pos}, ${c.team || 'FA'}${c.injury ? `, ${c.injury}` : ''}) adds ${signed(c.gainPerWeek)} pts per week to your best lineup over the next ${i.waivers!.activeWeeks} weeks${c.drop ? `, dropping ${m.name(c.drop.id)}` : ''}. Sleeper projections: ${c.proj.map(f1).join(', ')}.`
          : `Speculative stash: ${m.name(c.id)} (${c.pos}, ${c.team || 'FA'}): ${c.signals.slice(0, 2).join('; ')}.`,
      source: 'Waiver Wire Sniper (Sleeper projections)',
      asOf: stamps.projections,
      players: [c.id, ...(c.drop ? [c.drop.id] : [])],
      to: '/waivers',
      data: { gain: c.gainPerWeek },
    })
  }
  for (const n of i.waivers?.needs ?? [])
    add({ topic: 'waivers', kind: 'fact', text: `${n.text.replace(/\.$/, '')}.`, source: 'Sleeper rosters', asOf: stamps.sleeper, players: [], to: '/waivers' })

  // ---- trades
  const tradeFact = (t: TradeEvaluation) => {
    const names = (ids: string[]) => ids.map((id) => m.name(id)).join(' and ') || 'nothing'
    add({
      topic: 'trades',
      kind: 'model',
      text: `Trade idea with ${t.theirName}: you give ${names(t.give.players)}, you get ${names(t.get.players)}.${t.fairness !== null ? ` Market fairness ${Math.round(t.fairness * 100)}%.` : ''} Over ${t.activeWeeks} weeks your best lineup changes ${signed(t.you.total)} pts and theirs ${signed(t.them.total)}. Verdict: ${t.verdict.label}.`,
      source: 'Trade War Room (FantasyCalc values, Sleeper projections)',
      asOf: stamps.values,
      players: [...t.give.players, ...t.get.players],
      to: '/trades',
    })
  }
  for (const t of i.trades?.mutual.slice(0, 3) ?? []) tradeFact(t)
  for (const t of i.trades?.oneSided.slice(0, 2) ?? []) tradeFact(t)

  // ---- playoffs
  if (i.playoff) {
    const o = i.playoff
    add({
      topic: 'playoffs',
      kind: 'model',
      text: `Playoff Simulator: ${pctText(o.playoffPct)} chance to make the playoffs${o.byePct > 0 ? `, ${pctText(o.byePct)} chance of a bye` : ''}, ${pctText(o.championPct)} chance to win the title; average finish ${f1(o.avgWins)} wins and seed ${f1(o.avgSeed)}.`,
      source: 'Playoff Simulator (seeded Monte Carlo)',
      asOf: stamps.sleeper,
      players: [],
      to: '/playoffs',
    })
  }

  // ---- standings
  table.forEach((r, k) =>
    add({
      topic: 'standings',
      kind: 'fact',
      text: `Standings: ${ordinal(k + 1)} ${m.teamName(r.rosterId)}${r.me ? ' (you)' : ''}, ${rec(r.w, r.l, r.t)}, ${f1(r.pf)} points for, ${f1(r.pa)} against.`,
      source: 'Sleeper standings',
      asOf: stamps.sleeper,
      players: [],
      to: '/standings',
    }),
  )
  if (table.length)
    add({
      topic: 'standings',
      kind: 'fact',
      text: `${i.playoffTeams} of ${table.length} teams make the playoffs.`,
      source: 'Sleeper league settings',
      asOf: stamps.sleeper,
      players: [],
      to: '/standings',
    })

  // ---- keepers
  if (i.keeperLeague)
    for (const k of (i.keepers ?? []).filter((k) => k.eligible).slice(0, 4))
      add({
        topic: 'keepers',
        kind: 'model',
        text: `Keeper option: ${m.name(k.id)} (${k.pos})${k.cost.round !== null ? ` costs a round ${k.cost.round} pick` : ' is free to keep'}${k.marketRound !== null ? `; the dynasty market prices that around round ${k.marketRound}` : ''}${k.surplus !== null ? `, a saving of ${k.surplus} round${Math.abs(k.surplus) === 1 ? '' : 's'}` : ''}${k.recommended ? '. Recommended keeper' : ''}.`,
        source: 'Keeper Intelligence (your keeper rules, FantasyCalc dynasty values)',
        asOf: stamps.values,
        players: [k.id],
        to: '/keepers',
      })

  // ---- news about my roster
  for (const a of i.myNews.slice(0, 6))
    add({
      topic: 'news',
      kind: 'fact',
      text: `${a.publisher ?? 'A publisher'} headline: "${trunc(a.title, 140)}"${a.excerpt ? `. Excerpt: ${trunc(a.excerpt, 160)}` : ''}`,
      source: a.publisher ?? 'News feed',
      asOf: tsOf(a) || stamps.news,
      players: (a.players ?? []).map((p) => p.id),
      to: '/news',
    })

  // ---- last week's results (recaps)
  if (i.lastWeek) {
    const { week: lw, matchups } = i.lastWeek
    const mine = matchups.find((x) => x.roster_id === m.myRosterId)
    const opp = mine ? matchups.find((x) => x.matchup_id === mine.matchup_id && x.roster_id !== mine.roster_id) : undefined
    if (mine && opp && ((mine.points ?? 0) > 0 || (opp.points ?? 0) > 0)) {
      const a = mine.points ?? 0
      const b = opp.points ?? 0
      add({
        topic: 'recap',
        kind: 'fact',
        text: `Week ${lw} result: ${m.teamName(mine.roster_id)} ${f1(a)}, ${m.teamName(opp.roster_id)} ${f1(b)}: a ${a > b ? 'win' : a < b ? 'loss' : 'tie'}.`,
        source: 'Sleeper matchups',
        asOf: stamps.sleeper,
        players: [],
        to: '/standings',
      })
      const pts = (mine.starters ?? [])
        .filter((id) => id && id !== '0')
        .map((id) => ({ id, pts: mine.players_points?.[id] ?? null }))
        .filter((x): x is { id: string; pts: number } => x.pts !== null)
        .sort((x, y) => y.pts - x.pts)
      for (const [label, x] of [
        ['top scorer', pts[0]],
        ['second-best starter', pts[1]],
        ['lowest-scoring starter', pts.length > 2 ? pts[pts.length - 1] : undefined],
      ] as const)
        if (x)
          add({
            topic: 'recap',
            kind: 'fact',
            text: `Your ${label} in Week ${lw}: ${m.name(x.id)} with ${f1(x.pts)} pts.`,
            source: 'Sleeper matchups',
            asOf: stamps.sleeper,
            players: [x.id],
            to: '/standings',
          })
    }
    const scored = matchups.filter((x) => (x.points ?? 0) > 0).sort((x, y) => (y.points ?? 0) - (x.points ?? 0))
    if (scored.length > 1) {
      const hi = scored[0]
      const lo = scored[scored.length - 1]
      add({
        topic: 'recap',
        kind: 'fact',
        text: `Week ${lw} high score: ${m.teamName(hi.roster_id)} with ${f1(hi.points)}. Low score: ${m.teamName(lo.roster_id)} with ${f1(lo.points)}.`,
        source: 'Sleeper matchups',
        asOf: stamps.sleeper,
        players: [],
        to: '/standings',
      })
    }
  }

  // ---- opponent scouting
  if (i.h2h && i.gd?.oppRosterId != null) {
    const opp = i.gd.oppName
    for (const g of i.h2h.groups.filter((g) => g.mine > 0 || g.theirs > 0))
      add({
        topic: 'scouting',
        kind: 'model',
        text: `Projected ${g.group} points vs ${opp}: you ${f1(g.mine)}, them ${f1(g.theirs)}.`,
        source: 'Opponent Scouting (Sleeper projections)',
        asOf: stamps.projections,
        players: [],
        to: '/scouting',
      })
    const theirs = projectedLineup(m, i.gd.oppRosterId)
      .filter((s) => s.id)
      .sort((a, b) => b.proj - a.proj)
      .slice(0, 3)
    for (const s of theirs)
      add({
        topic: 'scouting',
        kind: 'model',
        text: `${opp}'s projected starter at ${s.label}: ${m.name(s.id!)} (${m.pos(s.id!)}), ${f1(s.proj)} pts.`,
        source: 'Opponent Scouting (Sleeper projections)',
        asOf: stamps.projections,
        players: [s.id!],
        to: '/scouting',
      })
  }

  return out
    .sort((a, b) => TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic))
    .slice(0, MAX_FACTS)
    .map((d, k) => ({ id: `F${k + 1}`, ...d }))
}

/** Numbers as they are written in a text (e.g. "+4.0", "92%", "1st", "8.0"). */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/(?<![\w.])[-+−]?\d+(?:\.\d+)?/g)].map((x) => Number(x[0].replace('−', '-')))
}

/**
 * Numbers in `text` that none of the `facts` contain (within rounding). Small whole numbers (0-3)
 * are ignored: they are almost always counts or ordinals ("2 players", "1st") rather than claims.
 */
export function unsupportedNumbers(text: string, facts: Fact[]): number[] {
  const known = facts.flatMap((f) => numbersIn(f.text).map((n) => Math.abs(n)))
  return numbersIn(text).filter((n) => {
    const a = Math.abs(n)
    if (Number.isInteger(a) && a <= 3) return false
    return !known.some((k) => Math.abs(k - a) < 0.051)
  })
}
