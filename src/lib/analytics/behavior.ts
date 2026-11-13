import type { SleeperDraftPick, SleeperTransaction } from '../sleeper'
import type { WeekGames } from './league'
import type { PartnerFit } from './xray'

/*
 * League Behavioral Intelligence: what each manager has observably done in Sleeper this season
 * (completed trades, waiver claims, free-agent adds, FAAB, lineups left with empty or scoreless
 * slots) and keepers marked in the drafts. These are counts of past actions, never a claim about
 * what a manager wants or will do.
 */

export interface ManagerProfile {
  rosterId: number
  trades: number
  /** roster id → completed trades with that team */
  partners: Map<number, number>
  waiverClaims: number
  failedClaims: number
  freeAgentAdds: number
  faabSpent: number
  /** winning bids only */
  bids: number[]
  /** positions of every player added (waivers, free agency, trades) */
  addsByPos: Record<string, number>
  /** positions received / sent in trades */
  tradeIn: Record<string, number>
  tradeOut: Record<string, number>
  /** completed weeks, starter slots left empty, starters who scored exactly 0 */
  weeks: number
  emptySlots: number
  zeroStarters: number
  keepers: { season: string; playerId: string; round: number }[]
  /** newest completed move (ms) */
  lastMove: number | null
}

const bump = (r: Record<string, number>, k: string) => {
  r[k] = (r[k] ?? 0) + 1
}

export interface BehaviorInput {
  rosterIds: number[]
  transactions: SleeperTransaction[]
  weeks: WeekGames[]
  /** starter slot count, to count empty slots (Sleeper sends '0' or omits them) */
  slots: number
  pos: (playerId: string) => string
  /** drafts with keeper marks, per season; roster ids in each are that season's */
  drafts?: { season: string; picks: SleeperDraftPick[]; rosterFor: (draftRosterId: number) => number | null }[]
}

export function managerProfiles(i: BehaviorInput): Map<number, ManagerProfile> {
  const out = new Map<number, ManagerProfile>(
    i.rosterIds.map((id) => [
      id,
      {
        rosterId: id,
        trades: 0,
        partners: new Map(),
        waiverClaims: 0,
        failedClaims: 0,
        freeAgentAdds: 0,
        faabSpent: 0,
        bids: [],
        addsByPos: {},
        tradeIn: {},
        tradeOut: {},
        weeks: 0,
        emptySlots: 0,
        zeroStarters: 0,
        keepers: [],
        lastMove: null,
      },
    ]),
  )
  const seen = new Set<string>()
  for (const t of i.transactions) {
    const key = JSON.stringify([t.type, t.created, t.roster_ids, t.adds, t.drops])
    if (seen.has(key)) continue // the same transaction can appear in two rounds' lists
    seen.add(key)
    const status = t.status ?? 'complete'
    const adds = Object.entries(t.adds ?? {})
    if (t.type === 'waiver' && status === 'failed') {
      for (const [, rid] of adds) {
        const p = out.get(rid)
        if (p) p.failedClaims++
      }
      continue
    }
    if (status !== 'complete') continue
    const touched = new Set<number>()
    for (const [pid, rid] of adds) {
      const p = out.get(rid)
      if (!p) continue
      touched.add(rid)
      bump(p.addsByPos, i.pos(pid) || '?')
      if (t.type === 'trade') bump(p.tradeIn, i.pos(pid) || '?')
    }
    if (t.type === 'trade') {
      const ids = (t.roster_ids ?? []).filter((r) => out.has(r))
      for (const [pid, rid] of Object.entries(t.drops ?? {})) {
        const p = out.get(rid)
        if (p) bump(p.tradeOut, i.pos(pid) || '?')
      }
      for (const r of ids) {
        const p = out.get(r)!
        p.trades++
        touched.add(r)
        for (const o of ids) if (o !== r) p.partners.set(o, (p.partners.get(o) ?? 0) + 1)
      }
    } else if (t.type === 'waiver') {
      for (const rid of new Set(adds.map(([, r]) => r))) {
        const p = out.get(rid)
        if (!p) continue
        p.waiverClaims++
        const bid = t.settings?.waiver_bid
        if (typeof bid === 'number' && bid >= 0) {
          p.faabSpent += bid
          p.bids.push(bid)
        }
      }
    } else if (t.type === 'free_agent') {
      for (const rid of new Set(adds.map(([, r]) => r))) {
        const p = out.get(rid)
        if (p) p.freeAgentAdds++
      }
    }
    for (const r of touched) {
      const p = out.get(r)!
      if (t.created && (p.lastMove === null || t.created > p.lastMove)) p.lastMove = t.created
    }
  }

  for (const wk of i.weeks)
    for (const g of wk.games)
      for (const s of g.b ? [g.a, g.b] : [g.a]) {
        const p = out.get(s.rosterId)
        if (!p) continue
        p.weeks++
        p.emptySlots += Math.max(0, i.slots - s.starters.length)
        p.zeroStarters += s.starters.filter((id) => s.playersPoints[id] === 0).length
      }

  for (const d of i.drafts ?? [])
    for (const pick of d.picks) {
      if (!pick.is_keeper || !pick.player_id || pick.roster_id === null) continue
      const rid = d.rosterFor(pick.roster_id)
      const p = rid !== null ? out.get(rid) : undefined
      if (p) p.keepers.push({ season: d.season, playerId: pick.player_id, round: pick.round })
    }
  return out
}

export interface Tendency {
  text: string
  /** the counts behind it, in plain words */
  evidence: string
}

const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Observable tendencies for one manager, compared with the league. Only counts, never motives. */
export function tendencies(p: ManagerProfile, all: ManagerProfile[]): Tendency[] {
  const out: Tendency[] = []
  const n = all.length || 1
  const moves = (x: ManagerProfile) => x.waiverClaims + x.freeAgentAdds + x.trades
  const avgMoves = all.reduce((a, x) => a + moves(x), 0) / n
  const mostTrades = Math.max(...all.map((x) => x.trades))
  const tied = all.filter((x) => x.trades === mostTrades).length
  // "most frequent" needs a real lead: 2+ trades and no tie
  if (p.trades >= 2 && p.trades === mostTrades && tied === 1)
    out.push({ text: 'Most frequent trader in the league', evidence: `${p.trades} completed trades this season` })
  else if (p.trades === 0 && moves(p) > 0 && all.some((x) => x.trades > 0)) out.push({ text: 'Has not traded this season', evidence: '0 completed trades' })
  if (moves(p) >= Math.max(3, avgMoves * 1.5))
    out.push({ text: 'Very active on the wire', evidence: `${p.waiverClaims + p.freeAgentAdds} adds vs a league average of ${(all.reduce((a, x) => a + x.waiverClaims + x.freeAgentAdds, 0) / n).toFixed(1)}` })
  else if (moves(p) === 0 && avgMoves > 0) out.push({ text: 'Has made no roster moves', evidence: 'no completed adds or trades this season' })

  const leagueAdds: Record<string, number> = {}
  for (const x of all) for (const [k, v] of Object.entries(x.addsByPos)) leagueAdds[k] = (leagueAdds[k] ?? 0) + v
  const mine = total(p.addsByPos)
  const lt = total(leagueAdds)
  if (mine >= 3 && lt > 0) {
    const [pos, cnt] = Object.entries(p.addsByPos).sort((a, b) => b[1] - a[1])[0]
    const share = cnt / mine
    const leagueShare = (leagueAdds[pos] ?? 0) / lt
    if (share >= leagueShare + 0.15)
      out.push({ text: `Adds ${pos}s more than the league`, evidence: `${Math.round(share * 100)}% of their adds vs ${Math.round(leagueShare * 100)}% league-wide (${cnt} of ${mine})` })
  }
  if (p.bids.length >= 2) {
    const leagueBids = all.flatMap((x) => x.bids)
    const mm = median(p.bids)
    const lm = median(leagueBids)
    if (mm >= lm * 1.5 && mm - lm >= 3) out.push({ text: 'Bids aggressively on waivers', evidence: `median winning bid $${mm} vs $${lm} league-wide` })
  }
  if (p.weeks > 0 && p.emptySlots + p.zeroStarters >= 2)
    out.push({
      text: 'Has left starting spots unproductive',
      evidence: `${p.emptySlots} empty slot${p.emptySlots === 1 ? '' : 's'} and ${p.zeroStarters} scoreless starter${p.zeroStarters === 1 ? '' : 's'} over ${p.weeks} weeks`,
    })
  const outT = total(p.tradeOut)
  if (outT >= 2) {
    const [pos, cnt] = Object.entries(p.tradeOut).sort((a, b) => b[1] - a[1])[0]
    if (cnt / outT >= 0.5) out.push({ text: `Has traded away ${pos}s`, evidence: `${cnt} of ${outT} players sent in trades` })
  }
  if (p.keepers.length) {
    const seasons = new Set(p.keepers.map((k) => k.season)).size
    out.push({ text: 'Uses keepers', evidence: `${p.keepers.length} keeper${p.keepers.length === 1 ? '' : 's'} marked across ${seasons} draft${seasons === 1 ? '' : 's'}` })
  }
  return out
}

export interface PartnerIdea {
  rosterId: number
  score: number
  reasons: string[]
}

/**
 * Possible trade partners from evidence only: complementary roster strengths (X-Ray), whether
 * they have traded at all this season, and whether they have already traded with you.
 */
export function partnerIdeas(me: number, fits: PartnerFit[], profiles: Map<number, ManagerProfile>): PartnerIdea[] {
  return fits
    .map((f) => {
      const p = profiles.get(f.rosterId)
      const reasons = [`They are thin at ${f.theyNeed.join(', ')}, where you are strong`, `They are strong at ${f.youNeed.join(', ')}, where you are thin`]
      let score = f.theyNeed.length + f.youNeed.length
      if (p && p.trades > 0) {
        score += 1
        reasons.push(`Has completed ${p.trades} trade${p.trades === 1 ? '' : 's'} this season`)
      }
      const withMe = p?.partners.get(me) ?? 0
      if (withMe > 0) {
        score += 0.5
        reasons.push(`Has traded with you ${withMe} time${withMe === 1 ? '' : 's'}`)
      }
      return { rosterId: f.rosterId, score, reasons }
    })
    .sort((a, b) => b.score - a.score)
}
