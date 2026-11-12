import { MIN_GAMES, rateConfidence, type Confidence, type Evidence } from '../evidence'
import { f1, ordinal, signed } from '../format'
import { flexLabel, OUT_INJ, STARTABLE } from '../lineup'
import type { Model } from '../model'
import type { ScheduleGame, SleeperLeague, TrendingEntry } from '../sleeper'
import { buildHistory, type WeekRows } from './history'
import { createValuer, LONG_TERM, lineupIdsOf, type HorizonWeek } from './lineupValue'
import { optimalAssignment } from './lineupPlan'
import { defenseKey, defenseVsPosition } from './matchup'
import { isBye, weekContext } from './schedule'
import { buildDepthIndex, depthInfo, formTrend, trendingInfo, type DepthInfo, type FormTrend } from './signals'
import { usageTrend, type UsageTrend } from './usage'
import { playerSpread, positionSds, projectionRange } from './volatility'

/** An add must improve your best lineup by at least this many points per week to be an "upgrade". */
export const UPGRADE_MIN_PER_WEEK = 1
/** A non-upgrade is shown as a speculative stash when at least this many opportunity signals are positive. */
export const SPECULATIVE_MIN_SIGNALS = 2
/** Trending in Sleeper's top N adds counts as a positive signal. */
export const TOP_TRENDING = 10
export const DEFAULT_MAX_CANDIDATES = 40

export type Tier = 'must' | 'strong' | 'upgrade'
export const tierOf = (gainPerWeek: number): Tier | null =>
  gainPerWeek >= 4 ? 'must' : gainPerWeek >= 2 ? 'strong' : gainPerWeek >= UPGRADE_MIN_PER_WEEK ? 'upgrade' : null

export type { HorizonWeek }

export interface WaiverInput {
  model: Model
  league: SleeperLeague
  /** current week first, then the following weeks */
  horizon: HorizonWeek[]
  weeks: WeekRows[]
  schedule: ScheduleGame[] | null
  trending: TrendingEntry[] | null
  provider: string | null
  maxCandidates?: number
}

export interface PlayerRef {
  id: string
  name: string
  pos: string
  team: string
}

export interface OpponentInfo {
  week: number
  opponent: string | null
  bye: boolean
  /** 1 = most generous defense to the position (context only) */
  rank: number | null
}

export interface WaiverCandidate extends PlayerRef {
  injury: string
  /** Sleeper projection for each horizon week, league scoring (unadjusted) */
  proj: number[]
  /** net change in your best lineup per horizon week (0 where the add cannot count) */
  perWeek: number[]
  /** total net lineup gain over the horizon */
  net: number
  /** net gain ÷ weeks that have projections */
  gainPerWeek: number
  kind: 'upgrade' | 'speculative' | 'none'
  tier: Tier | null
  /** the roster player to drop, or null when there is an open roster spot */
  drop: PlayerRef | null
  dropHorizon: number | null
  usage: UsageTrend | null
  form: FormTrend | null
  depth: DepthInfo | null
  trending: { rank: number; count: number } | null
  opponents: OpponentInfo[]
  sd: number | null
  floor: number | null
  ceiling: number | null
  n: number
  /** short labels for positive/negative signals */
  signals: string[]
  positives: number
  confidence: Confidence
  reasons: string[]
  evidence: Evidence[]
}

export interface Need {
  kind: 'empty' | 'bye-soon'
  text: string
}

export interface WaiverReport {
  candidates: WaiverCandidate[]
  needs: Need[]
  rosterFull: boolean
  rosterCount: number
  rosterLimit: number
  /** horizon weeks for which Sleeper has not published projections */
  missingWeeks: number[]
  /** weeks the net gain is averaged over */
  activeWeeks: number
}

const flagged = (inj: string) => inj !== ''

export function analyzeWaivers(inp: WaiverInput): WaiverReport {
  const { model: m, league, horizon, schedule } = inp
  const roster = m.myRoster()
  const lineupIds = lineupIdsOf(roster)
  const keepers = new Set(roster?.keepers ?? [])
  const rosterLimit = league.roster_positions.filter((p) => p !== 'IR' && p !== 'TAXI').length
  const rosterFull = lineupIds.length >= rosterLimit
  const { ctx, raw, valueAt, total, started0 } = createValuer(m, horizon, schedule)
  const missingWeeks = horizon.filter((h) => h.proj.size === 0).map((h) => h.week)
  const activeWeeks = Math.max(1, horizon.length - missingWeeks.length)

  const history = inp.weeks.length ? buildHistory(inp.weeks, m.scoring) : null
  const posSd = history ? positionSds(history, m.pos) : new Map<string, number>()
  const defense = inp.weeks.length ? defenseVsPosition(inp.weeks, m.scoring, m.pos) : null
  const depthIndex = buildDepthIndex(m.players)

  const base = horizon.map((_, k) => total(lineupIds, k))
  const hold = (id: string) => horizon.reduce((t, _, k) => t + valueAt(id, k), 0)
  const droppable = lineupIds.filter((id) => !keepers.has(id) && !started0(id))
  const ref = (id: string): PlayerRef => ({ id, name: m.shortName(id), pos: m.pos(id), team: m.team(id) })

  // ---- candidate pool: unrostered, startable, projected to score at some point in the horizon
  const rostered = m.allRostered()
  const pool: { id: string; sum: number }[] = []
  for (const id in m.players) {
    if (rostered.has(id)) continue
    const p = m.players[id]
    if (!p?.position || !STARTABLE.has(p.position)) continue
    if (p.position !== 'DEF' && !p.team) continue
    const sum = horizon.reduce((t, _, k) => t + raw(id, k), 0)
    if (sum > 0) pool.push({ id, sum })
  }
  pool.sort((a, b) => b.sum - a.sum)

  const candidates: WaiverCandidate[] = []
  for (const { id } of pool.slice(0, inp.maxCandidates ?? DEFAULT_MAX_CANDIDATES)) {
    const evalAdd = (drop: string | null) => {
      const ids = lineupIds.filter((x) => x !== drop).concat(id)
      const perWeek = horizon.map((_, k) => {
        // a started game locks both the add and the drop for this week
        if (k === 0 && (started0(id) || (drop && started0(drop)))) return 0
        return total(ids, k) - base[k]
      })
      return { drop, perWeek, net: perWeek.reduce((a, b) => a + b, 0) }
    }
    const options = rosterFull ? droppable.map(evalAdd) : [evalAdd(null)]
    if (options.length === 0) continue // roster full and nobody can be dropped
    const best = options.reduce((a, b) => (b.net > a.net + 1e-9 || (Math.abs(b.net - a.net) <= 1e-9 && b.drop && a.drop && hold(b.drop) < hold(a.drop)) ? b : a))

    const pos = m.pos(id)
    const team = m.team(id)
    const injury = m.injury(id)
    const games = history?.get(id)
    const usage = usageTrend(games)
    const form = formTrend(games)
    const depth = depthInfo(m.players, depthIndex, id, m.shortName)
    const trending = trendingInfo(inp.trending, id)
    const spread = playerSpread(games, posSd.get(pos))
    const range = projectionRange(raw(id, 0), spread.sd)
    const opponents = horizon.map<OpponentInfo>((h, k) => {
      const opp = ctx?.[k].opponent.get(team) ?? null
      return {
        week: h.week,
        opponent: opp,
        bye: ctx ? isBye(ctx[k], team) : false,
        rank: opp && defense ? (defense.get(defenseKey(opp, pos))?.rank ?? null) : null,
      }
    })

    const proj = horizon.map((_, k) => raw(id, k))
    const gainPerWeek = best.net / activeWeeks
    const dropRef = best.drop ? ref(best.drop) : null
    const dropSd = best.drop ? playerSpread(history?.get(best.drop), posSd.get(m.pos(best.drop))) : null

    const signals: string[] = []
    let positives = 0
    if (usage?.label === 'rising') {
      positives++
      signals.push('Snaps rising')
    }
    if (usage?.label === 'falling') signals.push('Snaps falling')
    if (form?.label === 'rising') {
      positives++
      signals.push('Form rising')
    }
    if (form?.label === 'falling') signals.push('Form falling')
    if (depth?.nextManUp) {
      positives++
      signals.push('Next man up')
    }
    if (trending && trending.rank <= TOP_TRENDING) {
      positives++
      signals.push(`Trending #${trending.rank}`)
    }
    const byeWeek = opponents.find((o) => o.bye)
    if (byeWeek) signals.push(`Bye wk ${byeWeek.week}`)
    if (injury) signals.push(injury)

    const kind: WaiverCandidate['kind'] =
      gainPerWeek >= UPGRADE_MIN_PER_WEEK ? 'upgrade' : positives >= SPECULATIVE_MIN_SIGNALS && !LONG_TERM.has(injury) ? 'speculative' : 'none'

    const sdDiff = spread.sd !== null ? Math.sqrt(spread.sd ** 2 + (dropSd?.sd ?? 0) ** 2) : null
    const confidence = rateConfidence({
      marginZ: sdDiff ? gainPerWeek / sdDiff : 0,
      sampleOk: spread.n >= MIN_GAMES && (!dropSd || dropSd.n >= MIN_GAMES),
      injuryFlag: flagged(injury),
    })

    const src = `Sleeper projections${inp.provider ? ` (${inp.provider})` : ''}`
    const reasons = [
      `Adds ${signed(best.net)} projected points over the next ${activeWeeks} week${activeWeeks === 1 ? '' : 's'} (${signed(best.perWeek[0])} this week) to your best lineup.`,
      dropRef
        ? `Best drop: ${dropRef.name} (${dropRef.pos}), the droppable player whose loss costs your lineup least once ${m.shortName(id)} is added.`
        : 'You have an open roster spot, so no drop is needed.',
    ]
    if (usage?.label === 'rising') reasons.push(`Snap share is rising: ${Math.round(usage.recent * 100)}% over the last 3 games vs ${Math.round(usage.season * 100)}% this season.`)
    if (form?.label === 'rising') reasons.push(`Scoring more lately: ${f1(form.recent)} per game over the last 3 vs ${f1(form.season)} this season.`)
    if (depth?.nextManUp)
      reasons.push(`Next in line at ${depth.position}: ${depth.ahead.filter((a) => OUT_INJ.has(a.injury)).map((a) => `${a.name} (${a.injury})`).join(', ')} is ahead of him on Sleeper's depth chart.`)
    if (trending && trending.rank <= TOP_TRENDING) reasons.push(`#${trending.rank} most-added player across Sleeper in the last 24 hours (${trending.count.toLocaleString()} adds). Popularity is not value; rivals may bid.`)
    if (injury) reasons.push(`Listed ${injury}: confirm his status before claiming.`)
    if (byeWeek) reasons.push(`On a bye in week ${byeWeek.week}.`)

    const evidence: Evidence[] = [
      { label: 'Projected points', value: horizon.map((h, k) => `wk${h.week} ${f1(proj[k])}`).join(' · '), source: src },
      {
        label: 'Net lineup gain',
        value: `${signed(best.net)} over ${activeWeeks} wk${activeWeeks === 1 ? '' : 's'}`,
        source: 'Model: your best lineup with him minus your best lineup without, each week, from Sleeper projections',
      },
    ]
    if (range)
      evidence.push({ label: 'This week\'s range (≈10th–90th pct)', value: `${f1(range.floor)}–${f1(range.ceiling)}`, source: `Model: projection ± 1.28 × week-to-week sd (${f1(spread.sd)}), ${spread.n} games` })
    if (usage) evidence.push({ label: 'Snap share', value: `${Math.round(usage.recent * 100)}% last 3 vs ${Math.round(usage.season * 100)}% season`, source: `Sleeper weekly stats (${usage.games} games)` })
    if (depth) evidence.push({ label: 'Depth chart', value: `${depth.position}${depth.order}${depth.ahead.length ? `, behind ${depth.ahead.map((a) => a.name).join(', ')}` : ''}`, source: "Sleeper depth chart (may lag real-world changes)" })
    if (trending) evidence.push({ label: 'Sleeper-wide adds (24h)', value: `#${trending.rank}, ${trending.count.toLocaleString()} adds`, source: 'Sleeper trending data' })
    const opps = opponents.filter((o) => o.opponent && o.rank !== null)
    if (opps.length)
      evidence.push({ label: 'Upcoming matchups', value: opps.map((o) => `wk${o.week} ${o.opponent} (${ordinal(o.rank!)})`).join(' · '), source: 'Sleeper weekly stats: rank = how generous the defense is to his position. Context only: not added to projections' })

    candidates.push({
      ...ref(id),
      injury,
      proj,
      perWeek: best.perWeek,
      net: best.net,
      gainPerWeek,
      kind,
      tier: kind === 'upgrade' ? tierOf(gainPerWeek) : null,
      drop: dropRef,
      dropHorizon: best.drop ? hold(best.drop) : null,
      usage,
      form,
      depth,
      trending,
      opponents,
      sd: spread.sd,
      floor: range?.floor ?? null,
      ceiling: range?.ceiling ?? null,
      n: spread.n,
      signals,
      positives,
      confidence,
      reasons,
      evidence,
    })
  }

  const rank = { upgrade: 0, speculative: 1, none: 2 }
  candidates.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      (a.kind === 'speculative' ? b.positives - a.positives : 0) ||
      b.net - a.net ||
      b.proj.reduce((x, y) => x + y, 0) - a.proj.reduce((x, y) => x + y, 0),
  )

  return {
    candidates,
    needs: rosterNeeds(m, lineupIds, horizon, ctx, valueAt),
    rosterFull,
    rosterCount: lineupIds.length,
    rosterLimit,
    missingWeeks,
    activeWeeks,
  }
}

/** Slots that cannot be filled this week, and starters facing a bye in the next two weeks. */
function rosterNeeds(
  m: Model,
  lineupIds: string[],
  horizon: HorizonWeek[],
  ctx: ReturnType<typeof weekContext>[] | null,
  valueAt: (id: string, k: number) => number,
): Need[] {
  const needs: Need[] = []
  const available0 = lineupIds.filter((id) => !(ctx && isBye(ctx[0], m.team(id))) && !OUT_INJ.has(m.injury(id)))
  const assigned = optimalAssignment(m.startSlots, available0.map((id) => ({ id, pos: m.pos(id), value: valueAt(id, 0) })))
  m.startSlots.forEach((slot, i) => {
    if (!assigned[i]) needs.push({ kind: 'empty', text: `No healthy ${flexLabel(slot)} available for week ${horizon[0].week}.` })
  })
  if (ctx) {
    for (const id of assigned.filter((x): x is string => !!x)) {
      for (let k = 1; k < Math.min(3, horizon.length); k++) {
        if (isBye(ctx[k], m.team(id))) needs.push({ kind: 'bye-soon', text: `${m.shortName(id)} (${m.pos(id)}) is on a bye in week ${horizon[k].week}.` })
      }
    }
  }
  return needs
}
