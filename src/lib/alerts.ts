import { availabilityOf } from './analytics/opportunity'
import { f1 } from './format'

/*
 * Personalized alerts: what changed for my team since I last marked alerts as seen (a baseline
 * kept in this browser), plus conditions that are true right now (an Out starter). Keys are
 * stable, so the same alert never shows twice. In-app only: no other notification channel is
 * configured.
 */

export interface AlertState {
  savedAt: string
  week: number
  /** my roster: id -> injury designation ('' when none) */
  injuries: Record<string, string>
  starters: string[]
  /** my starters: id -> projection */
  proj: Record<string, number>
  /** my starters: id -> joined risk text */
  weather: Record<string, string>
  breakouts: string[]
}

export type Severity = 'high' | 'medium' | 'low'
export interface Alert {
  key: string
  severity: Severity
  title: string
  detail: string
  to: string
}

export const PROJ_MOVE = 2

export interface AlertContext {
  name: (id: string) => string
  /** earliest game date among my starters this week, if known */
  firstGame: string | null
}

export function alertsFor(prev: AlertState | null, cur: AlertState, ctx: AlertContext): Alert[] {
  const out: Alert[] = []
  const add = (a: Alert) => {
    if (!out.some((x) => x.key === a.key)) out.push(a)
  }
  // conditions true now: starters who won't (or likely won't) play
  for (const id of cur.starters) {
    const a = availabilityOf(cur.injuries[id])
    if (a === 'out')
      add({
        key: `inactive-${id}-${cur.week}`,
        severity: 'high',
        title: `${ctx.name(id)} is listed ${cur.injuries[id]} and in your lineup`,
        detail: 'Official designation from Sleeper. Replace him before his game starts.',
        to: '/lineup',
      })
    else if (a === 'doubtful')
      add({
        key: `doubtful-${id}-${cur.week}`,
        severity: 'high',
        title: `${ctx.name(id)} is Doubtful and in your lineup`,
        detail: 'Unlikely to play, not ruled out. Line up a backup.',
        to: '/injuries',
      })
  }
  if (ctx.firstGame)
    add({
      key: `deadline-${cur.week}`,
      severity: 'low',
      title: `Your first starter plays ${ctx.firstGame}`,
      detail: 'Lineup changes lock at each game’s kickoff (Sleeper doesn’t publish kickoff times).',
      to: '/lineup',
    })
  if (!prev) return out

  // changes since the baseline
  for (const [id, status] of Object.entries(cur.injuries)) {
    const before = prev.injuries[id]
    if (before === undefined || before === status) continue
    const sev: Severity = ['out', 'doubtful'].includes(availabilityOf(status))
      ? 'high'
      : status
        ? 'medium'
        : 'low'
    add({
      key: `injury-${id}-${before || 'none'}-${status || 'none'}`,
      severity: sev,
      title: status
        ? `${ctx.name(id)}: ${before || 'no designation'} → ${status}`
        : `${ctx.name(id)} no longer has an injury designation`,
      detail:
        status === 'Questionable'
          ? 'A game-time decision; not assumed inactive.'
          : 'Official designation from Sleeper.',
      to: `/players/${id}`,
    })
  }
  if (prev.week === cur.week && prev.starters.join() !== cur.starters.join())
    add({
      key: `lineup-${cur.week}-${cur.starters.join()}`,
      severity: 'low',
      title: 'Your starting lineup changed',
      detail: 'Sleeper shows a different set of starters than when you last checked.',
      to: '/lineup',
    })
  if (prev.week === cur.week)
    for (const id of cur.starters) {
      const a = prev.proj[id]
      const b = cur.proj[id]
      if (a === undefined || b === undefined || Math.abs(b - a) < PROJ_MOVE) continue
      add({
        key: `proj-${id}-${f1(a)}-${f1(b)}`,
        severity: 'medium',
        title: `${ctx.name(id)}'s projection ${b > a ? 'rose' : 'fell'} ${f1(Math.abs(b - a))} pts`,
        detail: `${f1(a)} → ${f1(b)} projected.`,
        to: `/players/${id}`,
      })
    }
  for (const [id, risk] of Object.entries(cur.weather))
    if (risk && prev.weather[id] !== risk)
      add({
        key: `weather-${id}-${risk}`,
        severity: 'medium',
        title: `Weather flagged for ${ctx.name(id)}`,
        detail: `${risk}. Context only, not applied to projections.`,
        to: '/lineup',
      })
  for (const id of cur.breakouts)
    if (!prev.breakouts.includes(id))
      add({
        key: `breakout-${id}`,
        severity: 'low',
        title: `${ctx.name(id)} is showing rising usage`,
        detail: 'A free agent in your league. See the evidence on the Breakout Radar.',
        to: '/breakouts',
      })
  return out
}

export const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
export const sortAlerts = (a: Alert[]) =>
  [...a].sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity])

/* ---------------- baseline storage (this browser) ---------------- */

const key = (leagueId: string) => `gb-alerts-${leagueId}`

export function loadBaseline(leagueId: string): AlertState | null {
  try {
    const raw = localStorage.getItem(key(leagueId))
    return raw ? (JSON.parse(raw) as AlertState) : null
  } catch {
    return null
  }
}

export function saveBaseline(leagueId: string, s: AlertState) {
  try {
    localStorage.setItem(key(leagueId), JSON.stringify(s))
  } catch {
    /* storage blocked: alerts still work, just without a remembered baseline */
  }
}
