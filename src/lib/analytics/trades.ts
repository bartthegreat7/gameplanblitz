import type { Confidence, Evidence } from '../evidence'
import { signed } from '../format'
import { flexLabel, OUT_INJ, STARTABLE } from '../lineup'
import type { Model } from '../model'
import type { ScheduleGame, SleeperLeague } from '../sleeper'
import { createValuer, LONG_TERM, lineupIdsOf, type HorizonWeek } from './lineupValue'
import type { PickAsset } from './picks'

/* Trade evaluation. Two separate lenses, never blended into one opaque score:
   - market fairness: FantasyCalc values (one scale for players and picks),
   - lineup fit: change in each team's best lineup over the next few weeks, from Sleeper projections.
   What the other manager will actually accept is an estimate, never a fact. */

/** Within this many points per week a lineup change is "flat". */
export const FLAT_PER_WEEK = 0.15
/** A suggested deal must improve your best lineup by at least this much per week. */
export const MIN_YOU_PER_WEEK = 0.5
/** Fair-by-value deals are shown as "one-sided" down to this per-week cost to the other lineup. */
export const ONE_SIDED_FLOOR_PER_WEEK = -1
/** Value fairness (1 = identical) needed for a suggested deal and for "likely acceptable". */
export const MIN_FAIRNESS = 0.85

export interface TradeInput {
  model: Model
  league: SleeperLeague
  /** current week first */
  horizon: HorizonWeek[]
  schedule: ScheduleGame[] | null
  /** player id → trade value, from the same FantasyCalc scale as the picks */
  values: Map<string, number>
  /** each roster's owned picks; empty on the redraft scale */
  picks: Map<number, PickAsset[]>
  scale: 'redraft' | 'dynasty'
}

export interface Side {
  players: string[]
  picks: PickAsset[]
}

export interface Impact {
  rosterId: number
  /** change in the best lineup, per horizon week */
  perWeek: number[]
  total: number
  /** incoming players who start (in the first week with projections), and where */
  starts: { id: string; name: string; slot: string }[]
  /** starters who lose their spot */
  benches: { id: string; name: string }[]
  /** how many players over the roster limit the team ends up (they would have to drop them) */
  overBy: number
}

export type Acceptable = 'likely' | 'unlikely' | 'unknown'

export interface TradeEvaluation {
  theirRosterId: number
  theirName: string
  give: Side
  get: Side
  /** total FantasyCalc value; null when any asset is unpriced */
  giveValue: number | null
  getValue: number | null
  /** 1 − |give − get| / max; null when a side is unpriced */
  fairness: number | null
  you: Impact
  them: Impact
  flags: string[]
  verdict: { label: string; text: string; acceptable: Acceptable }
  confidence: Confidence
  reasons: string[]
  evidence: Evidence[]
  /** horizon weeks that have projections */
  activeWeeks: number
}

/* ---------- confidence ---------- */

export const TRADE_CONFIDENCE_RUBRIC = [
  'Lineup impact built from 3+ weeks of Sleeper projections: +2 (2 weeks: +1)',
  'Every player and pick in the deal has a FantasyCalc value: +1',
  'No cautions (injured asset, keeper, roster overflow, unpriced pick): +1',
  'High: 4+ points · Medium: 2–3 · Low: 0–1',
]

export function rateTradeConfidence(f: { activeWeeks: number; valuesKnown: boolean; cautions: number }): Confidence {
  let points = 0
  const notes: string[] = []
  if (f.activeWeeks >= 3) {
    points += 2
    notes.push(`Lineup impact uses ${f.activeWeeks} weeks of projections`)
  } else if (f.activeWeeks === 2) {
    points += 1
    notes.push('Lineup impact uses only 2 weeks of projections')
  } else notes.push('Lineup impact uses at most 1 week of projections')
  if (f.valuesKnown) {
    points += 1
    notes.push('All assets have a FantasyCalc value')
  } else notes.push('At least one asset has no FantasyCalc value')
  if (f.cautions === 0) {
    points += 1
    notes.push('No cautions')
  } else notes.push(`${f.cautions} caution${f.cautions === 1 ? '' : 's'} to check`)
  return { level: points >= 4 ? 'high' : points >= 2 ? 'medium' : 'low', points, notes }
}

/* ---------- evaluation ---------- */

function prepare(inp: TradeInput) {
  const m = inp.model
  const valuer = createValuer(m, inp.horizon, inp.schedule)
  const activeIdx = inp.horizon.map((h, k) => (h.proj.size > 0 ? k : -1)).filter((k) => k >= 0)
  const k0 = activeIdx[0] ?? 0
  const rosterLimit = inp.league.roster_positions.filter((p) => p !== 'IR' && p !== 'TAXI').length
  const baseCache = new Map<number, number[]>()
  const base = (rosterId: number) => {
    let b = baseCache.get(rosterId)
    if (!b) {
      const ids = lineupIdsOf(m.rosterById(rosterId))
      b = inp.horizon.map((_, k) => valuer.total(ids, k))
      baseCache.set(rosterId, b)
    }
    return b
  }

  /** Effect on one roster of losing `remove` and receiving `add`. */
  const impact = (rosterId: number, remove: string[], add: string[]): Impact => {
    const before = lineupIdsOf(m.rosterById(rosterId))
    const after = before.filter((id) => !remove.includes(id)).concat(add.filter((id) => !before.includes(id)))
    const b = base(rosterId)
    const perWeek = inp.horizon.map((_, k) => valuer.total(after, k) - b[k])
    const total = perWeek.reduce((t, x) => t + x, 0)
    return { rosterId, perWeek, total, starts: [], benches: [], overBy: Math.max(0, after.length - rosterLimit) }
  }
  /** Fill in who starts / sits (only for deals we actually present). */
  const detail = (rosterId: number, imp: Impact, remove: string[], add: string[]): Impact => {
    const before = lineupIdsOf(m.rosterById(rosterId))
    const after = before.filter((id) => !remove.includes(id)).concat(add.filter((id) => !before.includes(id)))
    const a = valuer.starters(after, k0)
    const b = valuer.starters(before, k0)
    const starts = a.flatMap((id, i) => (id && add.includes(id) ? [{ id, name: m.shortName(id), slot: flexLabel(m.startSlots[i]) }] : []))
    const afterSet = new Set(a.filter((x): x is string => !!x))
    const benches = b.flatMap((id) => (id && !afterSet.has(id) && !remove.includes(id) ? [{ id, name: m.shortName(id) }] : []))
    return { ...imp, starts, benches }
  }
  return { m, valuer, base, impact, detail, activeWeeks: Math.max(1, activeIdx.length), rosterLimit }
}

const sideValue = (s: Side, values: Map<string, number>): number | null => {
  let t = 0
  for (const id of s.players) {
    const v = values.get(id)
    if (v === undefined) return null
    t += v
  }
  for (const p of s.picks) {
    if (p.value === null) return null
    t += p.value
  }
  return t
}

const fairnessOf = (a: number | null, b: number | null) =>
  a === null || b === null || Math.max(a, b) <= 0 ? null : 1 - Math.abs(a - b) / Math.max(a, b)

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Throws if the deal includes assets the named teams do not own. */
export function evaluateTrade(inp: TradeInput, theirRosterId: number, give: Side, get: Side): TradeEvaluation {
  const m = inp.model
  const them = m.rosterById(theirRosterId)
  if (!them || theirRosterId === m.myRosterId) throw new Error('A trade needs another team in the league')
  const mine = new Set(m.myRoster()?.players ?? [])
  const theirs = new Set(them.players ?? [])
  if (give.players.some((id) => !mine.has(id))) throw new Error('You can only give players on your roster')
  if (get.players.some((id) => !theirs.has(id))) throw new Error("You can only get players on the other team's roster")
  if (give.picks.some((p) => p.ownerRosterId !== m.myRosterId)) throw new Error('You can only give picks you own')
  if (get.picks.some((p) => p.ownerRosterId !== theirRosterId)) throw new Error("You can only get picks the other team owns")
  const c = prepare(inp)
  return build(inp, c, theirRosterId, give, get)
}

function build(inp: TradeInput, c: ReturnType<typeof prepare>, theirRosterId: number, give: Side, get: Side): TradeEvaluation {
  const { m, activeWeeks } = c
  const me = m.myRosterId
  const you = c.detail(me, c.impact(me, give.players, get.players), give.players, get.players)
  const them = c.detail(theirRosterId, c.impact(theirRosterId, get.players, give.players), get.players, give.players)

  const giveValue = sideValue(give, inp.values)
  const getValue = sideValue(get, inp.values)
  const fairness = fairnessOf(giveValue, getValue)
  const theirName = m.teamName(theirRosterId)

  const myKeepers = new Set(m.myRoster()?.keepers ?? [])
  const theirKeepers = new Set(m.rosterById(theirRosterId)?.keepers ?? [])
  const flags: string[] = []
  let cautions = 0
  const caution = (s: string) => {
    flags.push(s)
    cautions++
  }
  for (const id of give.players) if (myKeepers.has(id)) caution(`${m.shortName(id)} is one of your designated keepers; keeper cost and eligibility aren't tracked here yet.`)
  for (const id of get.players) if (theirKeepers.has(id)) caution(`${m.shortName(id)} is one of ${theirName}'s designated keepers, so they may be unwilling to move him.`)
  for (const id of [...give.players, ...get.players]) {
    const inj = m.injury(id)
    if (LONG_TERM.has(inj)) caution(`${m.shortName(id)} is listed ${inj}.`)
    else if (OUT_INJ.has(inj)) caution(`${m.shortName(id)} is listed ${inj} this week.`)
  }
  if (you.overBy > 0) caution(`You would be ${plural(you.overBy, 'player')} over the roster limit and must drop ${you.overBy === 1 ? 'one' : 'them'}.`)
  if (them.overBy > 0) caution(`${theirName} would be ${plural(them.overBy, 'player')} over the roster limit and must drop ${them.overBy === 1 ? 'one' : 'them'}.`)
  if (giveValue === null || getValue === null) caution('At least one player or pick has no FantasyCalc value, so fairness can\'t be judged.')
  const pieces = (s: Side) => s.players.length + s.picks.length
  if (pieces(give) !== pieces(get) && giveValue !== null && getValue !== null)
    flags.push('FantasyCalc values are summed. The market usually pays a premium to consolidate into one star, so an uneven-count deal can look fairer here than it is.')
  if (give.picks.length + get.picks.length > 0) flags.push('Picks have no lineup effect now; they are priced on FantasyCalc\'s dynasty scale.')

  // ---- verdict: lineup fit and market value are reported separately
  const flat = FLAT_PER_WEEK * activeWeeks
  const band = (x: number) => (x >= flat ? 'gain' : x <= -flat ? 'loss' : 'flat')
  const yb = band(you.total)
  const tb = band(them.total)
  let label: string
  let text: string
  if (yb === 'gain' && tb === 'gain') [label, text] = ['Win-win', 'Both lineups improve.']
  else if (yb === 'gain') [label, text] = ['Helps you', `Your lineup improves; theirs ${tb === 'flat' ? 'stays about the same' : 'gets worse'}.`]
  else if (tb === 'gain') [label, text] = ['Helps them', `Their lineup improves; yours ${yb === 'flat' ? 'stays about the same' : 'gets worse'}.`]
  else if (yb === 'loss' && tb === 'loss') [label, text] = ['Hurts both lineups', 'Neither lineup improves.']
  else if (yb === 'loss') [label, text] = ['Costs your lineup', 'Your lineup gets worse and theirs doesn\'t improve.']
  else if (tb === 'loss') [label, text] = ['Costs their lineup', 'Their lineup gets worse and yours doesn\'t improve.']
  else [label, text] = ['Roughly neutral', 'Neither lineup changes much.']

  const fair = fairness !== null && fairness >= MIN_FAIRNESS
  const acceptable: Acceptable =
    fairness === null ? 'unknown' : fair && tb !== 'loss' ? 'likely' : 'unlikely'
  const accText =
    acceptable === 'unknown'
      ? 'Can\'t judge: some assets have no market value.'
      : acceptable === 'likely'
        ? 'Looks acceptable to them on value and lineup fit. This is an estimate, not a prediction of what they will do.'
        : !fair
          ? `Lopsided on value (${Math.round((fairness ?? 0) * 100)}% fair): they may want more. This is an estimate, not a prediction.`
          : 'Fair on value but it hurts their lineup: they may want a sweetener. This is an estimate, not a prediction.'

  const names = (s: Side) => [...s.players.map((id) => m.shortName(id)), ...s.picks.map((p) => p.label)].join(', ') || 'nothing'
  const scaleName = inp.scale === 'dynasty' ? 'FantasyCalc dynasty' : 'FantasyCalc redraft'
  const impactLine = (who: string, i: Impact) =>
    `${who}: ${signed(i.total)} over ${plural(activeWeeks, 'week')}` +
    (i.starts.length ? `; ${i.starts.map((s) => `${s.name} starts at ${s.slot}`).join(', ')}` : '') +
    (i.benches.length ? `; ${i.benches.map((b) => b.name).join(', ')} ${i.benches.length === 1 ? 'loses his' : 'lose their'} starting spot` : '') +
    '.'

  const reasons = [
    giveValue !== null && getValue !== null
      ? `You give ${names(give)} (${Math.round(giveValue).toLocaleString()}) and get ${names(get)} (${Math.round(getValue).toLocaleString()}): ${Math.round((fairness ?? 0) * 100)}% fair on ${scaleName} values.`
      : `You give ${names(give)} and get ${names(get)}; some assets have no ${scaleName} value.`,
    impactLine('Your lineup', you),
    impactLine(`${theirName}'s lineup`, them),
    accText,
    ...flags,
  ]
  const evidence: Evidence[] = [
    { label: 'Market value', value: giveValue !== null && getValue !== null ? `${Math.round(giveValue).toLocaleString()} for ${Math.round(getValue).toLocaleString()}` : 'incomplete', source: `${scaleName} values` },
    { label: 'Your lineup', value: `${signed(you.total)} over ${plural(activeWeeks, 'wk')} (${you.perWeek.map((x) => signed(x)).join(' · ')})`, source: 'Model: best lineup after minus before, each week, from Sleeper projections' },
    { label: `${theirName}'s lineup`, value: `${signed(them.total)} over ${plural(activeWeeks, 'wk')} (${them.perWeek.map((x) => signed(x)).join(' · ')})`, source: 'Model: same method on their roster' },
  ]

  return {
    theirRosterId,
    theirName,
    give,
    get,
    giveValue,
    getValue,
    fairness,
    you,
    them,
    flags,
    verdict: { label, text: `${text} ${accText}`, acceptable },
    confidence: rateTradeConfidence({ activeWeeks, valuesKnown: giveValue !== null && getValue !== null, cautions }),
    reasons,
    evidence,
    activeWeeks,
  }
}

/* ---------- finder ---------- */

export interface FinderOptions {
  minFairness?: number
  maxPerList?: number
}

export interface FinderResult {
  /** both lineups improve */
  mutual: TradeEvaluation[]
  /** fair on value and you gain, but their lineup is flat or slightly worse: may need a sweetener */
  oneSided: TradeEvaluation[]
  /** player pairs checked */
  evaluated: number
}

/**
 * 1-for-1 swaps with every other team that are fair on market value and improve your best
 * lineup. Designated keepers on either side are never offered. One deal per player you'd receive.
 */
export function findTrades(inp: TradeInput, opts: FinderOptions = {}): FinderResult {
  const c = prepare(inp)
  const { m, activeWeeks } = c
  const minFair = opts.minFairness ?? MIN_FAIRNESS
  const cap = opts.maxPerList ?? 6
  const me = m.myRosterId

  const tradeable = (rosterId: number) => {
    const keepers = new Set(m.rosterById(rosterId)?.keepers ?? [])
    return lineupIdsOf(m.rosterById(rosterId)).filter(
      (id) => !keepers.has(id) && (inp.values.get(id) ?? 0) > 0 && STARTABLE.has(m.pos(id)),
    )
  }
  const mine = tradeable(me)
  const minYou = MIN_YOU_PER_WEEK * activeWeeks
  const flat = FLAT_PER_WEEK * activeWeeks
  const floor = ONE_SIDED_FLOOR_PER_WEEK * activeWeeks

  type Hit = { theirs: number; give: string; get: string; you: number; them: number; fair: number }
  const hits: Hit[] = []
  let evaluated = 0
  for (const r of m.rosters) {
    if (r.roster_id === me) continue
    for (const t of tradeable(r.roster_id)) {
      for (const g of mine) {
        const gv = inp.values.get(g)!
        const tv = inp.values.get(t)!
        const fair = 1 - Math.abs(gv - tv) / Math.max(gv, tv)
        if (fair < minFair) continue
        evaluated++
        const you = c.impact(me, [g], [t]).total
        if (you < minYou) continue
        const them = c.impact(r.roster_id, [t], [g]).total
        if (them < floor) continue
        hits.push({ theirs: r.roster_id, give: g, get: t, you, them, fair })
      }
    }
  }

  // one deal per player received: keep the best for you, preferring mutual gain on ties
  const best = new Map<string, Hit>()
  for (const h of hits) {
    const cur = best.get(h.get)
    if (!cur || h.you > cur.you + 1e-9 || (Math.abs(h.you - cur.you) <= 1e-9 && h.them > cur.them)) best.set(h.get, h)
  }
  const rank = (a: Hit, b: Hit) => b.you - a.you || b.fair - a.fair
  const all = [...best.values()]
  const toEval = (h: Hit) => build(inp, c, h.theirs, { players: [h.give], picks: [] }, { players: [h.get], picks: [] })
  return {
    mutual: all.filter((h) => h.them >= flat).sort(rank).slice(0, cap).map(toEval),
    oneSided: all.filter((h) => h.them < flat).sort(rank).slice(0, cap).map(toEval),
    evaluated,
  }
}

/**
 * Plain-text offer to paste into Sleeper. GameplanBlitz is read-only and never sends anything.
 * "You" in the text is the recipient, so the sides read from their point of view.
 */
export function offerText(model: Model, e: TradeEvaluation): string {
  const list = (s: Side) => [...s.players.map((id) => model.name(id)), ...s.picks.map((p) => p.label)].join(', ') || 'nothing'
  return `Trade offer to ${e.theirName}:
You get ${list(e.give)}
You give ${list(e.get)}
(drafted with GameplanBlitz)`
}
