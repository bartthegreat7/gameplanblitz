import { movers, pairGames, powerRankings, storylines, weekAwards, type WeekGames } from '../analytics/league'
import { weekContext } from '../analytics/schedule'
import { scoreboard } from '../analytics/scoreboard'
import { f1 } from '../format'
import { gameDay, standings } from '../insights'
import { lineupTotal, startSlotsOf } from '../lineup'
import { createModel } from '../model'
import type { PlayerMap, ScheduleGame, SleeperLeague, SleeperMatchup, SleeperRoster, SleeperUser, StatLine } from '../sleeper'
import { buildFacts, type Fact } from './facts'
import { tradeImpactFacts, type Draft } from './gmFacts'
import { leagueFacts } from './leagueFacts'

/* The fact sheet without a browser: built from raw Sleeper responses, for the AI Worker's scheduled
   podcast job. A subset of the app's sheet (no waiver, trade, engine or news tools run server-side):
   your matchup, last week's result, the standings and every Around the League segment. */

export interface SleeperBundle {
  season: string
  week: number
  league: SleeperLeague
  rosters: SleeperRoster[]
  users: SleeperUser[]
  players: PlayerMap
  /** this week's Sleeper projections (player id -> stat line) */
  projections: Map<string, StatLine>
  /** every week of the season so far (1..week), Sleeper matchups */
  matchups: Map<number, SleeperMatchup[]>
  schedule: ScheduleGame[]
}

const OUT = new Set(['Out', 'IR', 'PUP', 'Sus', 'NA', 'Doubtful'])

/**
 * The Waiver War Room without the browser's waiver tool: the free agents who would most improve this
 * week's best lineup (Sleeper projections, league scoring), excluding players who can't play.
 */
export function quickWaiverFacts(m: ReturnType<typeof createModel>, asOf: number, n = 4): Draft[] {
  const roster = m.myRoster()?.players ?? []
  const base = lineupTotal(m.optimal(roster))
  return m
    .freeAgents()
    .filter((fa) => !OUT.has(fa.inj))
    .sort((a, b) => b.pj - a.pj)
    .slice(0, 60)
    .map((fa) => ({ fa, gain: lineupTotal(m.optimal([...roster, fa.id])) - base }))
    .filter((x) => x.gain >= 1)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, n)
    .map(({ fa, gain }) => ({
      topic: 'waivers' as const,
      kind: 'model' as const,
      text: `Free agent ${m.name(fa.id)} (${fa.pos}${m.team(fa.id) ? `, ${m.team(fa.id)}` : ''}) would add ${f1(gain)} pts to your best lineup this week${fa.inj ? ` (listed ${fa.inj})` : ''}.`,
      source: 'Sleeper projections (league scoring), this week only',
      asOf,
      players: [fa.id],
      to: '/waivers',
    }))
}

export function serverFacts(b: SleeperBundle, userId: string, now: number): { facts: Fact[]; myRosterId: number } | null {
  const mine = b.rosters.find((r) => r.owner_id === userId) ?? b.rosters.find((r) => (r.co_owners ?? []).includes(userId))
  if (!mine) return null
  const m = createModel({
    players: b.players,
    rosters: b.rosters,
    users: b.users,
    scoring: b.league.scoring_settings ?? {},
    startSlots: startSlotsOf(b.league.roster_positions ?? []),
    proj: b.projections,
    seasonStats: null,
    fc: null,
    myRosterId: mine.roster_id,
  })
  const week = b.week
  const thisWeek = b.matchups.get(week) ?? []
  const season: WeekGames[] = [...b.matchups].filter(([w]) => w < week).map(([w, rows]) => ({ week: w, games: pairGames(rows) }))
  const lastWk = week - 1
  const lw = season.find((w) => w.week === lastWk)
  const playoffTeams = b.league.settings?.playoff_teams ?? 6
  const strength = new Map(m.rosters.map((r) => [r.roster_id, lineupTotal(m.optimal(r.players ?? []))]))
  const rows = lastWk >= 1 ? powerRankings(season, lastWk, strength) : []
  const prev = lastWk >= 2 ? powerRankings(season, lastWk - 1, null) : []
  const board = scoreboard(m, thisWeek, weekContext(b.schedule, week), false)
  const league = leagueFacts({
    name: m.teamName,
    playerName: m.name,
    last: lw ? { week: lastWk, games: lw.games, awards: weekAwards(lw.games), stories: storylines(season, lastWk, m.teamName, playoffTeams) } : null,
    power: rows.length ? { through: lastWk, rows, change: new Map(movers(prev, rows).map((x) => [x.rosterId, x.change])) } : null,
    standings: standings(m),
    upcoming: { week, games: board.filter((g) => g.status === 'scheduled') },
    odds: null,
  })
  const facts = buildFacts({
    m,
    week,
    gd: gameDay(m, thisWeek),
    live: null,
    lineup: null,
    waivers: null,
    trades: null,
    h2h: null,
    playoff: null,
    playoffTeams,
    myNews: [],
    keepers: null,
    keeperLeague: false,
    extras: [],
    engine: null,
    lastWeek: lw ? { week: lastWk, matchups: b.matchups.get(lastWk) ?? [] } : null,
    league,
    more: [...quickWaiverFacts(m, now), ...tradeImpactFacts(m, now)],
    stamps: { sleeper: now, projections: now, values: null, news: null, model: null },
  })
  return { facts, myRosterId: mine.roster_id }
}
