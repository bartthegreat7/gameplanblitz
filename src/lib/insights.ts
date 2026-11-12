import { clamp, f1 } from './format'
import { flexLabel, lineupTotal, OUT_INJ, TRADEABLE } from './lineup'
import type { Model } from './model'
import { playerValue, winProbability } from './scoring'
import type { SleeperLeague, SleeperMatchup } from './sleeper'

/* All functions are pure ports of the legacy prototype's formulas (CLAUDE.md §6). */

export const findMyMatchup = (matchups: SleeperMatchup[], rosterId: number) =>
  matchups.find((m) => m.roster_id === rosterId) ?? null

export function findOpponent(matchups: SleeperMatchup[], rosterId: number) {
  const me = findMyMatchup(matchups, rosterId)
  if (!me) return null
  return matchups.find((x) => x.matchup_id === me.matchup_id && x.roster_id !== rosterId) ?? null
}

const realIds = (ids: readonly string[] | null | undefined) => (ids ?? []).filter((p) => p && p !== '0')

/* ---------------- Game Day ---------------- */

export interface Battle {
  slot: string
  me: { name: string; pj: number }
  opp: { name: string; pj: number }
  meWin: boolean
}
export interface GameDay {
  myProj: number
  oppProj: number
  /** 0-100, rounded */
  winPct: number
  myName: string
  oppName: string
  myRosterId: number
  oppRosterId: number | null
  battles: Battle[]
}

export function gameDay(m: Model, matchups: SleeperMatchup[]): GameDay | null {
  const me = findMyMatchup(matchups, m.myRosterId)
  if (!me) return null
  const opp = findOpponent(matchups, m.myRosterId)
  const myLine = m.optimal(m.myRoster()?.players ?? [])
  const myProj = lineupTotal(myLine)

  let oppProj = 0
  let oppName = 'Opponent'
  const battles: Battle[] = []
  if (opp) {
    const oppRoster = m.rosterById(opp.roster_id)
    const oppLine = m.optimal(oppRoster?.players ?? opp.starters)
    oppProj = lineupTotal(oppLine)
    oppName = m.teamName(opp.roster_id)

    const grp: Record<string, typeof oppLine> = {}
    for (const s of oppLine) (grp[s.slot] ??= []).push(s)
    const used: Record<string, number> = {}
    for (const s of myLine) {
      used[s.slot] = used[s.slot] ?? 0
      const o = (grp[s.slot] ?? [])[used[s.slot]++]
      const mine = s.pick ? { name: m.shortName(s.pick.id), pj: s.pick.pj } : { name: '—', pj: 0 }
      const theirs = o?.pick ? { name: m.shortName(o.pick.id), pj: o.pick.pj } : { name: '—', pj: 0 }
      battles.push({ slot: flexLabel(s.slot), me: mine, opp: theirs, meWin: mine.pj >= theirs.pj })
    }
  }
  return {
    myProj,
    oppProj,
    winPct: Math.round(100 * winProbability(myProj, oppProj)),
    myName: m.teamName(m.myRosterId),
    oppName,
    myRosterId: m.myRosterId,
    oppRosterId: opp?.roster_id ?? null,
    battles,
  }
}

/* ---------------- Lineup Check ---------------- */

export interface LineupIssue {
  title: string
  detail: string
}

export function lineupCheck(m: Model, matchups: SleeperMatchup[]): LineupIssue[] | null {
  const me = findMyMatchup(matchups, m.myRosterId)
  if (!me) return null
  const starters = me.starters ?? []
  const issues: LineupIssue[] = []

  starters.forEach((pid, i) => {
    if (!pid || pid === '0')
      issues.push({
        title: `Empty ${flexLabel(m.startSlots[i] ?? 'starter')} slot`,
        detail: 'You have a starting spot with nobody in it. Fill it before kickoff.',
      })
  })
  for (const pid of realIds(starters)) {
    const inj = m.injury(pid)
    if (OUT_INJ.has(inj))
      issues.push({
        title: `${m.shortName(pid)} is ${inj}`,
        detail: `${m.name(pid)} won't play. Swap to a healthy bench option.`,
      })
  }

  const optimal = m.optimal(m.myRoster()?.players ?? [])
  const optimalIds = new Set(optimal.filter((s) => s.pick).map((s) => s.pick!.id))
  starters.forEach((pid, i) => {
    if (!pid || pid === '0' || optimalIds.has(pid)) return
    const slot = m.startSlots[i]
    const better = optimal.find((s) => s.slot === slot && s.pick && !starters.includes(s.pick.id))
    if (better?.pick && m.projPts(better.pick.id) > m.projPts(pid) + 0.5) {
      issues.push({
        title: `Bench upgrade at ${flexLabel(slot)}`,
        detail: `${m.shortName(better.pick.id)} projects ${f1(m.projPts(better.pick.id))} vs ${m.shortName(pid)} at ${f1(m.projPts(pid))}. Consider the swap.`,
      })
    }
  })
  return issues
}

/* ---------------- The Edge ---------------- */

export interface Upgrade {
  from: string
  to: string
  gain: number
}
export interface Bust {
  id: string
  pj: number
  tags: { tone: 'warn' | 'caution'; text: string }[]
  note: string
}
export interface Edge {
  upgradePts: number
  upgrades: Upgrade[]
  busts: Bust[]
}

export function edge(m: Model, matchups: SleeperMatchup[]): Edge | null {
  const me = findMyMatchup(matchups, m.myRosterId)
  if (!me) return null
  const bestByPos = new Map<string, { id: string; pj: number }>()
  for (const fa of m.freeAgents()) {
    const b = bestByPos.get(fa.pos)
    if (!b || fa.pj > b.pj) bestByPos.set(fa.pos, fa)
  }

  let upgradePts = 0
  const upgrades: Upgrade[] = []
  const busts: Bust[] = []
  for (const pid of realIds(me.starters)) {
    const myPos = m.pos(pid)
    const myPj = m.projPts(pid)
    const fa = bestByPos.get(myPos)
    if (fa && fa.pj >= myPj + 1) {
      upgradePts += fa.pj - myPj
      upgrades.push({ from: pid, to: fa.id, gain: fa.pj - myPj })
    }
    const inj = m.injury(pid)
    const avg = m.ppg(pid)
    const tags: Bust['tags'] = []
    let isBust = false
    if (inj) {
      tags.push({ tone: OUT_INJ.has(inj) ? 'warn' : 'caution', text: inj })
      if (inj !== 'Questionable') isBust = true
    }
    if (avg && myPj < avg - 3) {
      tags.push({ tone: 'warn', text: `projected ${f1(myPj)}, below his ${f1(avg)} avg` })
      isBust = true
    }
    if (inj === 'Questionable' && avg && myPj < avg) isBust = true
    if (isBust) {
      const note =
        fa && fa.pj >= myPj
          ? `${m.shortName(fa.id)} is free and projects ${f1(fa.pj)}.`
          : `No free agent projects higher at ${myPos}. Keep him, or check your bench.`
      busts.push({ id: pid, pj: myPj, tags, note })
    }
  }
  upgrades.sort((a, b) => b.gain - a.gain)
  return { upgradePts, upgrades, busts }
}

/* ---------------- Waiver Wire ---------------- */

export const topFreeAgents = (m: Model, n = 12) => [...m.freeAgents()].sort((a, b) => b.pj - a.pj).slice(0, n)

/* ---------------- Waiver Bids (FAAB) ---------------- */

export interface BidRow {
  id: string
  pos: string
  pj: number
  help: number
  /** suggested FAAB bid, or null if no bid is needed */
  bid: number | null
}
export interface Bids {
  usesFAAB: boolean
  budget: number
  left: number
  place: number
  maxOther: number
  rows: BidRow[]
}

export function bids(m: Model, league: SleeperLeague, matchups: SleeperMatchup[]): Bids {
  const budget = league.settings.waiver_budget || 100
  const usesFAAB = typeof league.settings.waiver_budget === 'number' && budget > 0
  const leftOf = (r: { settings?: { waiver_budget_used?: number } }) => budget - (r.settings?.waiver_budget_used ?? 0)
  const left = leftOf(m.myRoster() ?? {})
  const order = m.rosters.map((r) => ({ id: r.roster_id, left: leftOf(r) })).sort((a, b) => b.left - a.left)
  const place = order.findIndex((o) => o.id === m.myRosterId) + 1
  const maxOther = order.filter((o) => o.id !== m.myRosterId).reduce((mx, o) => Math.max(mx, o.left), 0)

  const me = findMyMatchup(matchups, m.myRosterId)
  const weakest = new Map<string, number>()
  for (const pid of realIds(me?.starters)) {
    const p = m.pos(pid)
    weakest.set(p, Math.min(weakest.get(p) ?? 99, m.projPts(pid)))
  }
  const rows = m
    .freeAgents()
    .map((fa) => ({ id: fa.id, pos: fa.pos, pj: fa.pj, help: fa.pj - (weakest.get(fa.pos) ?? 0) }))
    .sort((a, b) => b.help - a.help || b.pj - a.pj)
    .slice(0, 5)
    .map<BidRow>((c) => ({
      ...c,
      bid: c.help > 2 && usesFAAB && left > 0 ? clamp(Math.round((c.help / 8) * left), 1, left) : null,
    }))
  return { usesFAAB, budget, left, place, maxOther, rows }
}

/* ---------------- Standings ---------------- */

export interface StandingRow {
  rosterId: number
  w: number
  l: number
  t: number
  pf: number
  pa: number
  me: boolean
}

export function standings(m: Model): StandingRow[] {
  return m.rosters
    .map((r) => {
      const s = r.settings ?? {}
      return {
        rosterId: r.roster_id,
        w: s.wins ?? 0,
        l: s.losses ?? 0,
        t: s.ties ?? 0,
        pf: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
        pa: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
        me: r.roster_id === m.myRosterId,
      }
    })
    .sort((a, b) => b.w - a.w || b.pf - a.pf)
}

/* ---------------- Roster / Player Value ---------------- */

export interface RosterRow {
  id: string
  pos: string
  pj: number
  starter: boolean
}

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 }

export function rosterRows(m: Model, matchups: SleeperMatchup[]): RosterRow[] {
  const starters = new Set(realIds(findMyMatchup(matchups, m.myRosterId)?.starters))
  return (m.myRoster()?.players ?? [])
    .map((id) => ({ id, pos: m.pos(id), pj: m.projPts(id), starter: starters.has(id) }))
    .sort(
      (a, b) =>
        Number(b.starter) - Number(a.starter) ||
        (POS_ORDER[a.pos] ?? 9) - (POS_ORDER[b.pos] ?? 9) ||
        b.pj - a.pj,
    )
}

export interface ValueRow {
  id: string
  pos: string
  value: number
  ppg: number | null
  pj: number
  fc: number
}

export function valueRows(m: Model): ValueRow[] {
  return (m.myRoster()?.players ?? [])
    .map((id) => {
      const pj = m.projPts(id)
      const ppg = m.ppg(id)
      return { id, pos: m.pos(id), value: playerValue(ppg, pj), ppg, pj, fc: m.fcValue(id) }
    })
    .sort((a, b) => b.value - a.value)
}

/* ---------------- Trade Machine ---------------- */

export interface TradeDeal {
  theirRosterId: number
  theirName: string
  get: string
  give: string[]
  /** 0-100 fairness by FantasyCalc value */
  fair: number
  /** weekly starting-lineup gain for you */
  you: number
}

export function findTrades(m: Model): TradeDeal[] {
  const myPlayers = m.myRoster()?.players ?? []
  const baseTotal = lineupTotal(m.optimal(myPlayers))
  const candidates = myPlayers
    .map((id) => ({ id, pos: m.pos(id), val: m.fcValue(id) }))
    .filter((p) => p.val > 0 && TRADEABLE.has(p.pos))

  const deals: TradeDeal[] = []
  for (const r of m.rosters) {
    if (r.roster_id === m.myRosterId) continue
    for (const tp of r.players ?? []) {
      if (!TRADEABLE.has(m.pos(tp))) continue
      const tpj = m.projPts(tp)
      const tval = m.fcValue(tp)
      if (!tval || !tpj) continue
      for (const mp of candidates) {
        if (mp.id === tp) continue
        const fair = 1 - Math.abs(tval - mp.val) / Math.max(tval, mp.val)
        if (fair < 0.82) continue // within ~18%
        if (mp.val > tval * 1.12) continue // don't overpay badly
        const gain = lineupTotal(m.optimal(myPlayers.filter((p) => p !== mp.id).concat([tp]))) - baseTotal
        if (gain < 0.6) continue
        deals.push({
          theirRosterId: r.roster_id,
          theirName: m.teamName(r.roster_id),
          get: tp,
          give: [mp.id],
          fair: Math.round(fair * 100),
          you: gain,
        })
        break
      }
    }
  }
  deals.sort((a, b) => b.you - a.you)
  const seen = new Set<string>()
  const out: TradeDeal[] = []
  for (const d of deals) {
    if (seen.has(d.get)) continue
    seen.add(d.get)
    out.push(d)
    if (out.length >= 5) break
  }
  return out
}
