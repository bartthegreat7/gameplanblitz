import type { LineupPlan } from './lineupPlan'
import { availabilityOf, type UsageBook } from './opportunity'
import type { GameState } from './gameday'

/* Command Center: the dashboard's summaries. Each one re-reads what other tools already compute
   (Sleeper facts and the existing models) and adds no estimate of its own. */

/** Time-of-day greeting from the viewer's local hour. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good Morning'
  if (hour >= 12 && hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

/* ---------------- team health ---------------- */

export type ConcernLevel = 'empty' | 'out' | 'bye' | 'doubtful' | 'questionable'

export interface Concern {
  id: string | null
  name: string
  slot: string
  level: ConcernLevel
  /** Sleeper's designation, or "Empty slot" / "Bye week" */
  status: string
}

export interface TeamHealth {
  /** starting slots in the lineup as set in Sleeper */
  slots: number
  /** starters with no designation, not on a bye, and slots that are filled */
  ready: number
  /** ready / slots, 0-100 */
  readiness: number
  /** worst first: empty, out, bye, doubtful, questionable */
  concerns: Concern[]
  /** ready = nothing to do; monitor = only questionable players; action = someone can't play */
  status: 'ready' | 'monitor' | 'action'
}

const LEVEL_ORDER: ConcernLevel[] = ['empty', 'out', 'bye', 'doubtful', 'questionable']

/**
 * Availability of the lineup as set in Sleeper (facts: designations and the schedule's byes).
 * Questionable players are flagged, never assumed out.
 */
export function teamHealth(plan: LineupPlan): TeamHealth {
  const concerns: Concern[] = []
  for (const s of plan.slots) {
    const c = s.current
    if (!c) {
      concerns.push({ id: null, name: 'Empty slot', slot: s.label, level: 'empty', status: 'Empty slot' })
      continue
    }
    if (c.bye) {
      concerns.push({ id: c.id, name: c.name, slot: s.label, level: 'bye', status: 'Bye week' })
      continue
    }
    const a = c.out ? 'out' : availabilityOf(c.injury)
    if (a === 'active') continue
    concerns.push({ id: c.id, name: c.name, slot: s.label, level: a, status: c.injury || 'Out' })
  }
  concerns.sort((x, y) => LEVEL_ORDER.indexOf(x.level) - LEVEL_ORDER.indexOf(y.level))
  const slots = plan.slots.length
  const ready = slots - concerns.length
  const blocking = concerns.some((c) => c.level !== 'questionable')
  return {
    slots,
    ready,
    readiness: slots ? (ready / slots) * 100 : 0,
    concerns,
    status: blocking ? 'action' : concerns.length ? 'monitor' : 'ready',
  }
}

/* ---------------- top action items ---------------- */

/** done = verified clear by the data; attention = needs you; pending = still loading or optional. */
export type ItemState = 'done' | 'attention' | 'pending'

export interface ActionItem {
  id: string
  title: string
  detail: string
  state: ItemState
  to: string
}

export interface ActionInput {
  plan: LineupPlan | null
  health: TeamHealth | null
  waivers: { upgrades: { name: string; gain: number }[] } | null
  trades: { mutual: number } | null
  /** my starters whose game forecast is flagged; null while forecasts load */
  weatherFlags: number | null
  /** starters whose game has a forecast to check (0 = all indoor, too early or played) */
  weatherChecked: boolean
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const STATE_ORDER: ItemState[] = ['attention', 'pending', 'done']

/**
 * The week's checklist. An item is "done" only when the data shows the task is resolved (the lineup
 * as set equals the optimal one, no starter is ruled out, ...), never because it was clicked.
 */
export function actionItems(i: ActionInput): ActionItem[] {
  const out: ActionItem[] = []
  const p = i.plan
  if (!p)
    out.push({ id: 'lineup', title: 'Set optimal lineup', detail: 'No matchup posted for this week yet.', state: 'pending', to: '/lineup' })
  else {
    const gain = p.recommended.proj - p.current.proj
    const changes = p.start.length
    out.push(
      changes > 0 || gain > 0.05
        ? {
            id: 'lineup',
            title: 'Set optimal lineup',
            detail: `${plural(changes, 'change')} worth +${gain.toFixed(1)} projected pts.`,
            state: 'attention',
            to: '/lineup',
          }
        : { id: 'lineup', title: 'Lineup is optimal', detail: 'Your Sleeper lineup matches the best projected lineup.', state: 'done', to: '/lineup' },
    )
  }

  const h = i.health
  if (h) {
    const blocked = h.concerns.filter((c) => c.level !== 'questionable')
    out.push(
      blocked.length
        ? {
            id: 'injuries',
            title: 'Review injury updates',
            detail: blocked.map((c) => `${c.name} (${c.status})`).join(', '),
            state: 'attention',
            to: '/injuries',
          }
        : { id: 'injuries', title: 'Injury check clear', detail: 'No starter is ruled out, on a bye or missing.', state: 'done', to: '/injuries' },
    )
    const q = h.concerns.filter((c) => c.level === 'questionable')
    out.push(
      q.length
        ? {
            id: 'questionable',
            title: `Monitor ${plural(q.length, 'questionable player')}`,
            detail: q.map((c) => c.name).join(', '),
            state: 'attention',
            to: '/injuries',
          }
        : { id: 'questionable', title: 'No questionable starters', detail: 'Sleeper lists no game-time decisions in your lineup.', state: 'done', to: '/injuries' },
    )
  }

  if (!i.waivers)
    out.push({ id: 'waivers', title: 'Investigate high-value waivers', detail: 'Checking free agents in your league…', state: 'pending', to: '/waivers' })
  else {
    const best = i.waivers.upgrades[0]
    out.push(
      best
        ? {
            id: 'waivers',
            title: 'Investigate high-value waivers',
            detail: `${plural(i.waivers.upgrades.length, 'upgrade')}: best is ${best.name} (+${best.gain.toFixed(1)} pts/wk).`,
            state: 'attention',
            to: '/waivers',
          }
        : { id: 'waivers', title: 'Waivers checked', detail: 'No free agent beats your lineup right now.', state: 'done', to: '/waivers' },
    )
  }

  out.push(
    !i.trades
      ? { id: 'trades', title: 'Review trade opportunities', detail: 'Pricing trades…', state: 'pending', to: '/trades' }
      : i.trades.mutual > 0
        ? {
            id: 'trades',
            title: 'Review trade opportunities',
            detail: `${plural(i.trades.mutual, 'fair trade')} that help both teams. Optional.`,
            state: 'pending',
            to: '/trades',
          }
        : { id: 'trades', title: 'Trades checked', detail: 'No fair 1-for-1 swap helps both teams.', state: 'done', to: '/trades' },
  )

  out.push(
    i.weatherFlags === null
      ? { id: 'weather', title: 'Check game weather', detail: 'Loading forecasts…', state: 'pending', to: '/weather' }
      : i.weatherFlags > 0
        ? {
            id: 'weather',
            title: 'Check upcoming game weather',
            detail: `${plural(i.weatherFlags, 'starter')} with a flagged forecast (wind, heavy rain or snow).`,
            state: 'attention',
            to: '/weather',
          }
        : i.weatherChecked
          ? { id: 'weather', title: 'Weather checked', detail: 'No flagged forecasts for your starters.', state: 'done', to: '/weather' }
          : { id: 'weather', title: 'Check game weather', detail: 'Forecasts are not out yet, or every game is indoors.', state: 'pending', to: '/weather' },
  )
  return out.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state))
}

/* ---------------- game day strip ---------------- */

export interface StripPlayer {
  id: string
  name: string
  team: string
  points: number
  remaining: number
  state: GameState
}

export interface StripGame {
  id: string
  away: string
  home: string
  date: string
  state: 'scheduled' | 'live' | 'final'
  mine: StripPlayer[]
  theirs: StripPlayer[]
  /** projected points still to come from my starters in this game, minus my opponent's (model) */
  net: number
}

export interface ScheduleLike {
  game_id: string
  week: number
  status: string
  date: string
  home: string
  away: string
}

/**
 * NFL games this week that involve my starters or my opponent's (facts: schedule, live points),
 * with the projected points still at stake on each side (model). Live first, then by date, finals last.
 */
export function gameStrip(
  schedule: ScheduleLike[],
  week: number,
  mine: StripPlayer[],
  theirs: StripPlayer[],
): StripGame[] {
  const inGame = (g: ScheduleLike) => (p: StripPlayer) => p.team === g.home || p.team === g.away
  const games = schedule
    .filter((g) => g.week === week)
    .map((g): StripGame | null => {
      const m = mine.filter(inGame(g))
      const t = theirs.filter(inGame(g))
      if (!m.length && !t.length) return null
      const scored = [...m, ...t].some((p) => p.points > 0 || p.state === 'in-progress')
      const state =
        g.status === 'complete'
          ? 'final'
          : g.status === 'pre_game' || !g.status
            ? scored
              ? 'live'
              : 'scheduled'
            : 'live'
      const left = (ps: StripPlayer[]) => ps.reduce((a, p) => a + p.remaining, 0)
      return { id: g.game_id, away: g.away, home: g.home, date: g.date, state, mine: m, theirs: t, net: left(m) - left(t) }
    })
    .filter((g): g is StripGame => g !== null)
  const rank = { live: 0, scheduled: 1, final: 2 }
  return games.sort((a, b) => rank[a.state] - rank[b.state] || a.date.localeCompare(b.date))
}

/** Short game date from the schedule (Sleeper publishes no kickoff time): "Sun, Nov 16". */
export const gameDate = (date: string) =>
  date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : 'Date TBD'

/* ---------------- breakout radar ---------------- */

export interface RadarAxis {
  key: 'snap' | 'targets' | 'touches' | 'rz' | 'xfp' | 'growth'
  label: string
  /** the player's value (recent games), null when unknown */
  raw: number | null
  /** shown next to the axis: "71%", "6.5/g", "+3.0/g" */
  display: string
  /** percentile among players at his position with enough games (0-100), 0 when unknown */
  pct: number
}

export interface RadarProfile {
  id: string
  pos: string
  /** players at the position compared against */
  peers: number
  axes: RadarAxis[]
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Mid-rank percentile of v among xs (0-100). */
export function percentile(xs: number[], v: number): number {
  if (!xs.length) return 0
  const below = xs.filter((x) => x < v).length
  const equal = xs.filter((x) => x === v).length
  return ((below + equal / 2) / xs.length) * 100
}

interface Recent {
  snap: number | null
  targets: number
  touches: number
  rz: number
  xfp: number | null
  growth: number | null
}

function recentOf(book: UsageBook, id: string, recentGames: number): Recent | null {
  const g = book.games.get(id) ?? []
  if (g.length < recentGames) return null
  const r = g.slice(-recentGames)
  const e = g.slice(0, -recentGames)
  const snaps = r.map((u) => u.snapShare).filter((v): v is number => v !== null)
  const xfps = r.map((u) => u.xfp).filter((v): v is number => v !== null)
  const vol = (us: typeof g) => mean(us.map((u) => u.touches + u.targets))
  return {
    snap: snaps.length === r.length ? mean(snaps) : null,
    targets: mean(r.map((u) => u.targets)),
    touches: mean(r.map((u) => u.touches)),
    rz: mean(r.map((u) => u.rzOpps)),
    xfp: xfps.length === r.length ? mean(xfps) : null,
    growth: e.length >= 2 ? vol(r) - vol(e) : null,
  }
}

/**
 * A breakout candidate's opportunity profile: each axis is his average over the last games,
 * placed as a percentile among every player at his position with as many games. Every value comes
 * from Sleeper's weekly stats; nothing is scaled for looks.
 */
export function radarProfile(
  book: UsageBook,
  posOf: (id: string) => string,
  id: string,
  recentGames = 2,
): RadarProfile | null {
  const me = recentOf(book, id, recentGames)
  if (!me) return null
  const pos = posOf(id)
  const peers: Recent[] = []
  for (const pid of book.games.keys()) {
    if (posOf(pid) !== pos) continue
    const r = recentOf(book, pid, recentGames)
    if (r) peers.push(r)
  }
  const axis = (
    key: RadarAxis['key'],
    label: string,
    pick: (r: Recent) => number | null,
    fmt: (v: number) => string,
  ): RadarAxis => {
    const v = pick(me)
    const pool = peers.map(pick).filter((x): x is number => x !== null)
    return { key, label, raw: v, display: v === null ? 'n/a' : fmt(v), pct: v === null ? 0 : percentile(pool, v) }
  }
  return {
    id,
    pos,
    peers: peers.length,
    axes: [
      axis('snap', 'Snap share', (r) => r.snap, (v) => `${Math.round(v * 100)}%`),
      axis('targets', 'Targets', (r) => r.targets, (v) => `${v.toFixed(1)}/g`),
      axis('touches', 'Touches', (r) => r.touches, (v) => `${v.toFixed(1)}/g`),
      axis('rz', 'Red-zone chances', (r) => r.rz, (v) => `${v.toFixed(1)}/g`),
      axis('xfp', 'Expected points', (r) => r.xfp, (v) => `${v.toFixed(1)}/g`),
      axis('growth', 'Usage growth', (r) => r.growth, (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}/g`),
    ],
  }
}

/* ---------------- playoff odds history ---------------- */

export interface OddsSnapshot {
  /** local calendar day, YYYY-MM-DD */
  day: string
  week: number
  pct: number
}

export const MAX_SNAPSHOTS = 30

/** Records today's playoff odds (one snapshot per day, newest last). */
export function recordOdds(history: OddsSnapshot[], snap: OddsSnapshot): OddsSnapshot[] {
  const rest = history.filter((h) => h.day !== snap.day)
  return [...rest, snap].sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_SNAPSHOTS)
}

/** The change since the most recent snapshot from an earlier day, or null when there is none. */
export function oddsChange(
  history: OddsSnapshot[],
  today: string,
  current: number,
): { delta: number; since: OddsSnapshot } | null {
  const prev = [...history].reverse().find((h) => h.day < today)
  return prev ? { delta: current - prev.pct, since: prev } : null
}
