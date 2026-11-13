import type { Model } from '../model'
import type { SleeperTransaction } from '../sleeper'
import { availabilityOf } from './opportunity'
import { groupOf, groupTotals, projectedLineup, type Group } from './scouting'

/*
 * League X-Ray: every roster measured the same way. Projections are Sleeper's (league scoring);
 * designations, byes and transactions are Sleeper facts. Nothing here guesses what another manager
 * intends: trade partners are teams whose roster strengths and needs complement yours.
 */

export interface GroupRank {
  proj: number
  /** 1 = strongest in the league */
  rank: number
}

export interface TeamXray {
  rosterId: number
  /** projected best lineup this week (healthy players) */
  total: number
  groups: Map<Group, GroupRank>
  /** best three healthy players outside the projected lineup */
  bench: { id: string; proj: number }[]
  benchDepth: number
  /** players in the best lineup by projection who carry a designation */
  injured: { id: string; status: string }[]
  /** the remaining week with the most best-lineup players on a bye */
  byeWorst: { week: number; count: number } | null
  /** FantasyCalc market value of the roster */
  value: number
  strengths: Group[]
  weaknesses: Group[]
  moves: { adds: number; trades: number }
}

/** Adds and trades per roster from Sleeper's completed transactions. */
export function movesByRoster(txs: SleeperTransaction[]): Map<number, { adds: number; trades: number }> {
  const out = new Map<number, { adds: number; trades: number }>()
  const get = (id: number) => out.get(id) ?? (out.set(id, { adds: 0, trades: 0 }), out.get(id)!)
  for (const t of txs) {
    if (t.status && t.status !== 'complete') continue
    if (t.type === 'trade') for (const id of new Set(t.roster_ids ?? [])) get(id).trades++
    else for (const id of Object.values(t.adds ?? {})) get(id).adds++
  }
  return out
}

export function leagueXray(
  m: Model,
  opts: {
    /** remaining weeks in which an NFL team has no game */
    byeWeeksOf: (team: string) => number[]
    transactions: SleeperTransaction[]
  },
): TeamXray[] {
  const groups = [...new Set(m.startSlots.map(groupOf))]
  const lines = m.rosters.map((r) => ({ id: r.roster_id, line: projectedLineup(m, r.roster_id) }))
  const totals = new Map(lines.map((l) => [l.id, groupTotals(l.line)]))
  const moves = movesByRoster(opts.transactions)
  const rankOf = (g: Group, v: number) => 1 + lines.filter((l) => (totals.get(l.id)!.get(g) ?? 0) > v + 1e-9).length
  const n = lines.length
  return lines.map(({ id, line }) => {
    const t = totals.get(id)!
    const gr = new Map(groups.map((g) => [g, { proj: t.get(g) ?? 0, rank: rankOf(g, t.get(g) ?? 0) }]))
    const starters = new Set(line.map((s) => s.id).filter(Boolean) as string[])
    const roster = m.rosterById(id)
    const away = new Set([...(roster?.reserve ?? []), ...(roster?.taxi ?? [])])
    const bench = (roster?.players ?? [])
      .filter((p) => !starters.has(p) && !away.has(p) && availabilityOf(m.injury(p)) !== 'out')
      .map((p) => ({ id: p, proj: m.projPts(p) }))
      .sort((a, b) => b.proj - a.proj)
      .slice(0, 3)
    const best = m.optimal(roster?.players ?? []).map((s) => s.pick?.id).filter((p): p is string => !!p)
    const injured = best.filter((p) => m.injury(p)).map((p) => ({ id: p, status: m.injury(p) }))
    const byes = new Map<number, number>()
    for (const p of best) for (const w of opts.byeWeeksOf(m.team(p))) byes.set(w, (byes.get(w) ?? 0) + 1)
    const worst = [...byes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    return {
      rosterId: id,
      total: [...t.values()].reduce((a, b) => a + b, 0),
      groups: gr,
      bench,
      benchDepth: bench.reduce((a, b) => a + b.proj, 0),
      injured,
      byeWorst: worst ? { week: worst[0], count: worst[1] } : null,
      value: (roster?.players ?? []).reduce((a, p) => a + m.fcValue(p), 0),
      strengths: n > 3 ? groups.filter((g) => gr.get(g)!.rank <= Math.max(1, Math.round(n / 4))) : [],
      weaknesses: n > 3 ? groups.filter((g) => gr.get(g)!.rank > n - Math.max(1, Math.round(n / 4))) : [],
      moves: moves.get(id) ?? { adds: 0, trades: 0 },
    }
  })
}

export interface PartnerFit {
  rosterId: number
  /** your strengths where they are weak: what you could offer */
  theyNeed: Group[]
  /** their strengths where you are weak: what you could ask for */
  youNeed: Group[]
}

/** Teams whose needs and surpluses complement yours (both directions required), best fit first. */
export function tradePartners(xs: TeamXray[], me: number): PartnerFit[] {
  const mine = xs.find((x) => x.rosterId === me)
  if (!mine) return []
  return xs
    .filter((x) => x.rosterId !== me)
    .map((x) => ({
      rosterId: x.rosterId,
      theyNeed: mine.strengths.filter((g) => x.weaknesses.includes(g) && g !== 'FLEX'),
      youNeed: x.strengths.filter((g) => mine.weaknesses.includes(g) && g !== 'FLEX'),
    }))
    .filter((p) => p.theyNeed.length > 0 && p.youNeed.length > 0)
    .sort((a, b) => b.theyNeed.length + b.youNeed.length - (a.theyNeed.length + a.youNeed.length))
}

/** Remaining weeks (from `from` through `to`) each NFL team is off, from the season schedule. */
export function byeWeeks(schedule: { week: number; home: string; away: string }[], from: number, to: number): (team: string) => number[] {
  const playing = new Map<number, Set<string>>()
  const teams = new Set<string>()
  for (const g of schedule) {
    teams.add(g.home)
    teams.add(g.away)
    if (g.week < from || g.week > to) continue
    const s = playing.get(g.week) ?? new Set<string>()
    s.add(g.home)
    s.add(g.away)
    playing.set(g.week, s)
  }
  const weeks = [...playing.keys()].sort((a, b) => a - b)
  return (team: string) => (team && teams.has(team) ? weeks.filter((w) => !playing.get(w)!.has(team)) : [])
}
