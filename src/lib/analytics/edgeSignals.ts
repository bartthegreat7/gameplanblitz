import { f1 } from '../format'
import { SLOT_ELIG } from '../lineup'
import type { Model } from '../model'
import type { ScheduleGame } from '../sleeper'
import { gameFor } from '../weather/weather'
import type { GmAction } from './gm'
import { availabilityOf, domino, type Breakout, type UsageBook } from './opportunity'

/*
 * Extra signals for The Edge, each turned into a ranked action with its evidence, uncertainty,
 * deadline and sources. Facts come from Sleeper (designations, schedule) and Open-Meteo; usage
 * evidence from this season's games. Nothing here predicts an outcome.
 */

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

/** "Before kickoff on Sun, Nov 15" (Sleeper publishes the date only). */
export function deadlineFor(
  schedule: ScheduleGame[] | null | undefined,
  team: string,
  week: number,
): string | undefined {
  const g = gameFor(schedule, team, week)
  return g?.date ? `Before kickoff on ${fmtDate(g.date)} (kickoff time not published)` : undefined
}

/** Starters listed Questionable or Doubtful: monitor, with the best eligible bench backup named. */
export function injuryWatch(
  m: Model,
  starters: string[],
  slots: string[],
  schedule: ScheduleGame[] | null,
  week: number,
): GmAction[] {
  const roster = m.myRoster()?.players ?? []
  const bench = roster.filter(
    (id) => !starters.includes(id) && availabilityOf(m.injury(id)) === 'active',
  )
  const out: GmAction[] = []
  starters.forEach((id, i) => {
    if (!id || id === '0') return
    const a = availabilityOf(m.injury(id))
    if (a !== 'questionable' && a !== 'doubtful') return
    const elig = SLOT_ELIG[slots[i]] ?? [slots[i]]
    const backup = bench
      .filter((b) => elig.includes(m.pos(b)))
      .sort((x, y) => m.projPts(y) - m.projPts(x))[0]
    out.push({
      id: `injury-${id}`,
      playerId: id,
      area: 'injury',
      priority: a === 'doubtful' ? 1 : 2,
      title: `Monitor ${m.shortName(id)} (${m.injury(id)})`,
      detail: backup
        ? `${a === 'doubtful' ? 'Doubtful: unlikely to play.' : 'Questionable: a game-time decision.'} Best eligible backup on your bench: ${m.shortName(backup)} (${f1(m.projPts(backup))} proj).`
        : `${a === 'doubtful' ? 'Doubtful: unlikely to play.' : 'Questionable: a game-time decision.'} No eligible healthy backup on your bench.`,
      impact: `${f1(m.projPts(id))} projected pts at stake`,
      confidence: null,
      uncertainty: 'The designation can change before kickoff; Questionable players usually play.',
      deadline: deadlineFor(schedule, m.team(id), week),
      sources: ['Sleeper injury designation', 'Sleeper projections'],
      to: '/injuries',
    })
  })
  return out
}

/** Starters whose game has a flagged forecast (strong wind, heavy precipitation, snow, storms). */
export function weatherRisk(
  m: Model,
  risky: { id: string; risks: string[]; matchup: string }[],
  schedule: ScheduleGame[] | null,
  week: number,
): GmAction[] {
  return risky.map((r) => ({
    id: `weather-${r.id}`,
    playerId: r.id,
    area: 'weather' as const,
    priority: 3 as const,
    title: `Review weather for ${m.shortName(r.id)} (${r.matchup})`,
    detail: r.risks.join('. ') + '.',
    impact: 'Context only',
    confidence: null,
    uncertainty: 'Forecasts change; no validated projection adjustment is applied for weather.',
    deadline: deadlineFor(schedule, m.team(r.id), week),
    sources: ['Open-Meteo forecast', 'Sleeper schedule'],
    to: '/lineup',
  }))
}

/** Free agents in the league with rising usage (top few). */
export function breakoutPickups(
  m: Model,
  list: Breakout[],
  rostered: Set<string>,
  max = 2,
): GmAction[] {
  return list
    .filter((b) => !rostered.has(b.id))
    .slice(0, max)
    .map((b) => ({
      id: `breakout-${b.id}`,
      playerId: b.id,
      area: 'breakout' as const,
      priority: 3 as const,
      title: `Investigate ${m.shortName(b.id)} (${b.pos}, ${m.team(b.id) || 'FA'}) on waivers`,
      detail: b.signals.slice(0, 2).join('. ') + '.',
      impact: `${(b.recent.touches + b.recent.targets).toFixed(1)} touches + targets per game lately`,
      confidence: null,
      uncertainty: `Based on his last 2 games vs ${b.games - 2} earlier; usage can revert.`,
      sources: ['Sleeper weekly stats'],
      to: '/breakouts',
    }))
}

/** Free agents whose usage rose in games an injured (out/doubtful) teammate missed. */
export function injuryOpenings(
  m: Model,
  book: UsageBook,
  rostered: Set<string>,
  minGain = 3,
  max = 2,
): GmAction[] {
  const injured = [...rostered].filter((id) =>
    ['out', 'doubtful'].includes(availabilityOf(m.injury(id))),
  )
  const out: GmAction[] = []
  for (const id of injured)
    for (const r of domino(book, m.players, id)) {
      if (rostered.has(r.id) || !r.delta || r.delta.touches + r.delta.targets < minGain) continue
      out.push({
        id: `opening-${r.id}-${id}`,
        playerId: r.id,
        area: 'breakout',
        priority: 3,
        title: `Investigate ${m.shortName(r.id)}: more work when ${m.shortName(id)} is out`,
        detail: `${r.delta.touches >= 0 ? '+' : ''}${r.delta.touches.toFixed(1)} touches and ${r.delta.targets >= 0 ? '+' : ''}${r.delta.targets.toFixed(1)} targets per game in ${r.without} game${r.without === 1 ? '' : 's'} without him. ${m.shortName(id)} is listed ${m.injury(id)}.`,
        impact: `${r.delta.pts >= 0 ? '+' : ''}${r.delta.pts.toFixed(1)} pts per game in those games`,
        confidence: null,
        uncertainty:
          r.without < 3
            ? 'Small sample (fewer than 3 games without him).'
            : 'Past games without him may not repeat.',
        sources: ['Sleeper weekly stats', 'Sleeper injury designation'],
        to: '/injuries',
      })
    }
  return out.sort((a, b) => parseFloat(b.impact) - parseFloat(a.impact)).slice(0, max)
}
