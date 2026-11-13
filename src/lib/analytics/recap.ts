import type { Award, PowerRow, Story } from './league'

/* Plain-text pieces of the "Around the League" recap: shared to league chats, and used for the
   podcast's facts. Every number comes from Sleeper's scores or the labeled power-ranking model. */

export interface RecapGame {
  a: { rosterId: number; points: number }
  b: { rosterId: number; points: number } | null
}

const f1 = (n: number) => n.toFixed(1)

/** "Ants 120.4 def. Bears 98.2 (by 22.2)", or a tie / bye line. */
export function resultLine(g: RecapGame, name: (id: number) => string): string {
  if (!g.b) return `${name(g.a.rosterId)} ${f1(g.a.points)} (no opponent)`
  const [w, l] = g.a.points >= g.b.points ? [g.a, g.b] : [g.b, g.a]
  if (w.points === l.points) return `${name(g.a.rosterId)} and ${name(g.b.rosterId)} tied at ${f1(w.points)}`
  return `${name(w.rosterId)} ${f1(w.points)} def. ${name(l.rosterId)} ${f1(l.points)} (by ${(w.points - l.points).toFixed(w.points - l.points < 1 ? 2 : 1)})`
}

/** One sentence per award. */
export function awardText(a: Award, name: (id: number) => string, playerName: (id: string) => string): string {
  switch (a.id) {
    case 'high':
      return `Highest score: ${name(a.rosterId)} with ${f1(a.value)}`
    case 'blowout':
      return `Biggest blowout: ${name(a.rosterId)} over ${name(a.otherId!)} by ${f1(a.value)}`
    case 'closest':
      return `Closest matchup: ${name(a.rosterId)} over ${name(a.otherId!)} by ${a.value.toFixed(2)}`
    case 'upset':
      return `Biggest upset: ${name(a.rosterId)} beat ${name(a.otherId!)}, projected ${f1(a.value)} points better (model)`
    case 'tough':
      return `Toughest loss: ${name(a.rosterId)} scored ${f1(a.value)} and lost to ${name(a.otherId!)}`
    case 'bench':
      return `Best bench performance: ${playerName(a.playerId!)} scored ${f1(a.value)} on ${name(a.rosterId)}'s bench`
  }
}

/** The full recap, ready to paste into a league chat. */
export function leagueRecapText(o: {
  leagueName: string
  week: number
  final: boolean
  games: RecapGame[]
  name: (id: number) => string
  playerName: (id: string) => string
  awards: Award[]
  stories: Story[]
  power: PowerRow[]
  change: Map<number, number>
}): string {
  const lines = [`Around the League · ${o.leagueName} · Week ${o.week}${o.final ? '' : ' (in progress)'}`, '']
  for (const g of o.games) lines.push(resultLine(g, o.name))
  if (o.awards.length) {
    lines.push('', 'Weekly awards')
    for (const a of o.awards) lines.push(`• ${awardText(a, o.name, o.playerName)}`)
  }
  if (o.stories.length) {
    lines.push('', 'Storylines')
    for (const s of o.stories) lines.push(`• ${s.text}`)
  }
  if (o.power.length) {
    lines.push('', 'Power rankings (GamePlanBitz model, not the official standings)')
    for (const r of o.power) {
      const c = o.change.get(r.rosterId) ?? 0
      lines.push(`${r.rank}. ${o.name(r.rosterId)}${c > 0 ? ` (up ${c})` : c < 0 ? ` (down ${-c})` : ''}`)
    }
  }
  lines.push('', 'Scores from Sleeper · recap by GamePlanBitz')
  return lines.join('\n')
}
