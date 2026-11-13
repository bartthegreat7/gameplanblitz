import { outcome, type AwardsResult, type LeagueGame, type PowerRow, type Story } from '../analytics/league'
import type { TeamOdds } from '../analytics/playoffs'
import { awardText, resultLine } from '../analytics/recap'
import type { BoardGame } from '../analytics/scoreboard'

/* "Around the League" facts for the AI GM and the podcast. Results, awards and storylines come
   from Sleeper's scores (facts); power rankings, previews and playoff odds are model estimates and
   say so in their own words. */

export type LeagueSegment = 'around' | 'power' | 'preview'

export interface LeagueFactDraft {
  segment: LeagueSegment
  kind: 'fact' | 'model'
  text: string
  players: string[]
}

const f1 = (n: number) => n.toFixed(1)

export interface LeagueFactInput {
  name: (rosterId: number) => string
  playerName: (id: string) => string
  /** the last completed week */
  last: { week: number; games: LeagueGame[]; awards: AwardsResult | null; stories: Story[] } | null
  power: { through: number; rows: PowerRow[]; change: Map<number, number> } | null
  /** official standings order (Sleeper), best first, with records */
  standings: { rosterId: number; w: number; l: number; t: number }[]
  /** the coming week's games (projected) */
  upcoming: { week: number; games: BoardGame[] } | null
  odds: TeamOdds[] | null
}

/** The top scorer on a side, from Sleeper's per-player points (verified stats only). */
function topPlayer(side: LeagueGame['a']): { id: string; pts: number } | null {
  const starters = new Set(side.starters)
  let best: { id: string; pts: number } | null = null
  for (const [id, pts] of Object.entries(side.playersPoints)) if (starters.has(id) && (!best || pts > best.pts)) best = { id, pts }
  return best && best.pts > 0 ? best : null
}

export function leagueFacts(i: LeagueFactInput): LeagueFactDraft[] {
  const out: LeagueFactDraft[] = []
  const rec = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`

  if (i.last) {
    const { week, games, awards, stories } = i.last
    for (const g of games) {
      if (!g.b) continue
      const o = outcome(g)
      const top = o ? topPlayer(o.winner) : null
      out.push({
        segment: 'around',
        kind: 'fact',
        text: `Week ${week}: ${resultLine(g, i.name)}.${top ? ` ${i.playerName(top.id)} led ${i.name(o!.winner.rosterId)} with ${f1(top.pts)}.` : ''}`,
        players: top ? [top.id] : [],
      })
    }
    for (const a of awards?.awards ?? [])
      out.push({ segment: 'around', kind: a.model ? 'model' : 'fact', text: `Week ${week} ${awardText(a, i.name, i.playerName)}.`, players: a.playerId ? [a.playerId] : [] })
    for (const s of stories) out.push({ segment: 'around', kind: 'fact', text: s.text, players: [] })
  }

  if (i.standings.length)
    out.push({
      segment: 'power',
      kind: 'fact',
      text: `Official standings: ${i.standings.slice(0, 4).map((r, k) => `${k + 1}. ${i.name(r.rosterId)} (${rec(r)})`).join(', ')}.`,
      players: [],
    })
  if (i.power && i.power.rows.length) {
    const { rows, change, through } = i.power
    out.push({
      segment: 'power',
      kind: 'model',
      text: `GamePlanBitz power rankings through Week ${through} (a model, not the standings): ${rows.slice(0, 3).map((r) => `${r.rank}. ${i.name(r.rosterId)}`).join(', ')}.`,
      players: [],
    })
    const moves = [...change].filter(([, c]) => c !== 0).sort((a, b) => b[1] - a[1])
    const up = moves[0]
    const down = moves[moves.length - 1]
    if (up && up[1] > 0) out.push({ segment: 'power', kind: 'model', text: `Biggest riser in the power rankings: ${i.name(up[0])}, up ${up[1]}.`, players: [] })
    if (down && down[1] < 0) out.push({ segment: 'power', kind: 'model', text: `Biggest faller in the power rankings: ${i.name(down[0])}, down ${-down[1]}.`, players: [] })
  }
  for (const o of i.odds ?? [])
    if (o.playoffPct > 0 && o.playoffPct < 10)
      out.push({ segment: 'power', kind: 'model', text: `${i.name(o.rosterId)} is near elimination: ${Math.round(o.playoffPct)} percent playoff odds in the simulation.`, players: [] })

  if (i.upcoming) {
    const bubble = (id: number) => {
      const p = i.odds?.find((o) => o.rosterId === id)?.playoffPct
      return p !== undefined && p >= 5 && p <= 95
    }
    for (const g of i.upcoming.games) {
      if (!g.b || g.aWinPct === null) continue
      const [fav, dog, pct] = g.aWinPct >= 50 ? [g.a, g.b, g.aWinPct] : [g.b, g.a, 100 - g.aWinPct]
      const tags = [
        g.close ? 'projected within 10 points' : null,
        bubble(g.a.rosterId) && bubble(g.b.rosterId) ? 'both teams are in the playoff race' : null,
      ].filter(Boolean)
      out.push({
        segment: 'preview',
        kind: 'model',
        text: `Week ${i.upcoming.week} preview: ${i.name(fav.rosterId)} projects ${f1(fav.projectedFinal)} to ${f1(dog.projectedFinal)} over ${i.name(dog.rosterId)}, a ${pct} percent win chance (estimate)${tags.length ? `; ${tags.join(', ')}` : ''}.`,
        players: [],
      })
    }
  }
  return out
}
