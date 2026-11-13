import { pairGames, powerRankings, weekAwards, storylines, type WeekGames } from '../analytics/league'
import type { BoardGame } from '../analytics/scoreboard'
import type { SleeperMatchup } from '../sleeper'
import { buildOutline, writeScript } from './podcast'
import type { Fact } from './facts'
import { leagueFacts } from './leagueFacts'

const row = (roster_id: number, matchup_id: number, points: number, pp: Record<string, number> = {}): SleeperMatchup => ({
  roster_id,
  matchup_id,
  points,
  starters: Object.keys(pp),
  players: Object.keys(pp),
  players_points: pp,
})
const name = (id: number) => ['', 'Ants', 'Bears', 'Cats', 'Dogs'][id]
const pname = (id: string) => ({ p1: 'Pat One', p2: 'Sam Two' })[id] ?? id
const season: WeekGames[] = [
  { week: 1, games: pairGames([row(1, 1, 120, { p1: 40 }), row(2, 1, 100), row(3, 2, 99.5), row(4, 2, 99.1, { p2: 30 })]) },
]
const side = (rosterId: number, projectedFinal: number) => ({ rosterId, points: 0, projectedFinal, pregame: projectedFinal, playersLeft: 9, live: {} as never })
const upcoming: BoardGame[] = [
  { matchupId: 1, a: side(1, 110), b: side(3, 104), status: 'scheduled', aWinPct: 61, close: true, upset: false },
]

describe('Around the League facts', () => {
  const drafts = leagueFacts({
    name,
    playerName: pname,
    last: { week: 1, games: season[0].games, awards: weekAwards(season[0].games), stories: storylines(season, 1, name, 2) },
    power: { through: 1, rows: powerRankings(season, 1, null), change: new Map() },
    standings: [
      { rosterId: 1, w: 1, l: 0, t: 0 },
      { rosterId: 3, w: 1, l: 0, t: 0 },
    ],
    upcoming: { week: 2, games: upcoming },
    odds: [{ rosterId: 4, playoffPct: 6, byePct: 0, firstSeedPct: 0, championPct: 0, avgWins: 3, avgSeed: 4, seedPct: [] }],
  })

  it('covers every completed matchup once, with verified top performers, awards and storylines', () => {
    const around = drafts.filter((d) => d.segment === 'around').map((d) => d.text)
    expect(around).toContain('Week 1: Ants 120.0 def. Bears 100.0 (by 20.0). Pat One led Ants with 40.0.')
    expect(around).toContain('Week 1: Cats 99.5 def. Dogs 99.1 (by 0.40).') // no per-player points: no performer claimed
    expect(around.filter((t) => t.startsWith('Week 1: ') && t.includes(' def. '))).toHaveLength(2)
    expect(around).toContain('Week 1 Highest score: Ants with 120.0.')
    expect(around).toContain('Cats edged Dogs by 0.40 points.')
  })

  it('labels rankings and previews as estimates and keeps official standings as facts', () => {
    const power = drafts.filter((d) => d.segment === 'power')
    expect(power[0]).toMatchObject({ kind: 'fact', text: 'Official standings: 1. Ants (1-0), 2. Cats (1-0).' })
    expect(power.find((d) => d.text.startsWith('GamePlanBitz power rankings'))?.kind).toBe('model')
    expect(power.some((d) => d.text === 'Dogs is near elimination: 6 percent playoff odds in the simulation.')).toBe(true)
    const preview = drafts.find((d) => d.segment === 'preview')!
    expect(preview).toMatchObject({ kind: 'model' })
    expect(preview.text).toBe('Week 2 preview: Ants projects 110.0 to 104.0 over Cats, a 61 percent win chance (estimate); projected within 10 points.')
  })

  it('becomes the Around the League and This Week Around the League podcast segments', () => {
    const facts: Fact[] = drafts.map((d, k) => ({
      id: `F${k + 1}`,
      topic: 'league',
      kind: d.kind,
      text: d.text,
      source: 'test',
      asOf: null,
      players: d.players,
      to: '/scores',
      data: { segment: d.segment },
    }))
    const recap = buildOutline('recap', facts)
    expect(recap.chapters.map((c) => c.title)).toEqual(['Around the League', 'Power rankings'])
    const preview = buildOutline('preview', facts)
    expect(preview.chapters.map((c) => c.title)).toEqual(['This Week Around the League'])
    const lines = writeScript(recap.chapters, facts, { leagueName: 'L', week: 2, type: 'recap', format: 'debate', tone: 'straight', seed: 1 })
    expect(lines.filter((l) => l.chapter === 'around' && l.kind === 'fact').every((l) => l.cite.length === 1)).toBe(true)
    expect(lines.some((l) => l.text.includes('Ants 120.0 def. Bears 100.0'))).toBe(true)
  })
})
