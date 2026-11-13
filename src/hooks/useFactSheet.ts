import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { buildFacts, type Fact } from '../lib/ai/facts'
import type { NameEntry } from '../lib/ai/assistant'
import type { LeagueFactDraft } from '../lib/ai/leagueFacts'
import { activityFacts, memoryFacts, partnerFacts, recommendationFacts, tradeImpactFacts } from '../lib/ai/gmFacts'
import { leagueFacts } from '../lib/ai/leagueFacts'
import { readHistory } from '../lib/analytics/autopilot'
import { movers, powerRankings, storylines, weekAwards } from '../lib/analytics/league'
import { luckReport } from '../lib/analytics/luck'
import { simulate } from '../lib/analytics/playoffs'
import { findMyMatchup, findOpponent, gameDay, standings } from '../lib/insights'
import { lineupTotal } from '../lib/lineup'
import { useAppStore } from '../store/app'
import { useGmBrief } from './useGmBrief'
import { useLeagueBehavior } from './useLeagueBehavior'
import type { Ready } from './useLeagueData'
import { useLeagueBoard } from './useLeagueBoard'
import { useLeagueMatchups } from './useLeagueMatchups'
import { useLeagueSeason } from './useLeagueSeason'
import { useLineupInputs } from './useLineupInputs'
import { useProjectionEngine } from './useProjectionEngine'
import { useSeasonSim } from './useSeasonSim'

/**
 * The fact sheet for this league and week: the AI Fantasy GM and the Podcast Studio may use these
 * facts and nothing else. Built from the same hooks the tool pages use, so every number matches.
 */
export function useFactSheet(data: Ready) {
  const { model: m, league, matchups, week, season } = data
  const qc = useQueryClient()
  const gm = useGmBrief(data)
  const engine = useProjectionEngine(data)
  const lineupIn = useLineupInputs(season, week)
  const lastWeeks = useMemo(() => (week > 1 ? [week - 1] : []), [week])
  const last = useLeagueMatchups(league.league_id, lastWeeks)

  const sleeperAt = qc.getQueryState(['rosters', league.league_id])?.dataUpdatedAt || null
  const valuesAt =
    qc.getQueryCache().findAll({ queryKey: ['fantasycalc', league.league_id] })[0]?.state.dataUpdatedAt || null
  const newsAt = gm.news.dataUpdatedAt || null
  const modelAt = engine.model ? Date.parse(engine.model.updated) || null : null

  const gd = useMemo(() => gameDay(m, matchups), [m, matchups])
  const mine = findMyMatchup(matchups, m.myRosterId)
  const opp = findOpponent(matchups, m.myRosterId)
  const started = (mine?.points ?? 0) > 0 || (opp?.points ?? 0) > 0
  const live = started ? { mine: mine?.points ?? 0, theirs: opp?.points ?? 0 } : null
  const liveKey = live ? `${live.mine}:${live.theirs}` : ''

  // Around the League: last week's results, awards, storylines, rankings, this week's previews
  const leagueSeason = useLeagueSeason(data)
  const board = useLeagueBoard(data)
  const sim = useSeasonSim(data)
  const odds = useMemo(() => (sim.input ? simulate(sim.input) : null), [sim.input])
  const league_: LeagueFactDraft[] = useMemo(() => {
    const lastWk = week - 1
    const done = leagueSeason.season.filter((w) => w.week <= lastWk)
    const lw = done.find((w) => w.week === lastWk)
    const strength = new Map(m.rosters.map((r) => [r.roster_id, lineupTotal(m.optimal(r.players ?? []))]))
    const rows = lastWk >= 1 ? powerRankings(done, lastWk, strength) : []
    const prev = lastWk >= 2 ? powerRankings(done, lastWk - 1, null) : []
    return leagueFacts({
      name: m.teamName,
      playerName: m.name,
      last: lw
        ? { week: lastWk, games: lw.games, awards: weekAwards(lw.games), stories: storylines(done, lastWk, m.teamName, gm.playoffTeams) }
        : null,
      power: rows.length ? { through: lastWk, rows, change: new Map(movers(prev, rows).map((x) => [x.rosterId, x.change])) } : null,
      standings: standings(m),
      upcoming: { week, games: board.games.filter((g) => g.status === 'scheduled') },
      odds,
    })
  }, [leagueSeason.season, board.games, odds, m, week, gm.playoffTeams])

  // the GM's memory and your season: saved strategy, earlier recommendations, moves, luck, partners, trade impact
  const memory = useAppStore((s) => s.gmMemory[league.league_id] ?? null)
  const behavior = useLeagueBehavior(data, { past: false })
  const medianGame = league.settings.league_average_match === 1
  const luck = useMemo(() => luckReport(behavior.weeks, { medianGame }), [behavior.weeks, medianGame])
  const more = useMemo(() => {
    const current = new Set(gm.allActions.map((a) => a.id))
    const me = behavior.profiles.find((p) => p.rosterId === m.myRosterId) ?? null
    return [
      ...memoryFacts(memory),
      ...recommendationFacts(readHistory(league.league_id), week, current),
      ...activityFacts(me, luck.teams.find((t) => t.rosterId === m.myRosterId) ?? null, behavior.traits.get(m.myRosterId) ?? [], sleeperAt, m),
      ...partnerFacts(behavior.ideas, m, sleeperAt),
      ...tradeImpactFacts(m, lineupIn.projectionsUpdatedAt),
    ]
  }, [memory, league.league_id, week, gm.allActions, behavior.profiles, behavior.traits, behavior.ideas, luck, sleeperAt, m, lineupIn.projectionsUpdatedAt])

  const facts: Fact[] = useMemo(
    () =>
      buildFacts({
        m,
        week,
        gd,
        live,
        lineup: gm.lineup,
        waivers: gm.waivers,
        trades: gm.trades,
        h2h: gm.h2h,
        playoff: gm.playoff,
        playoffTeams: gm.playoffTeams,
        myNews: gm.myNews,
        keepers: gm.keepers,
        keeperLeague: gm.keeperLeague,
        extras: gm.extras,
        engine: engine.model
          ? (id) => {
              const p = engine.projectionFor(id)
              return {
                value: p.value,
                baseline: p.baseline,
                floor: p.range?.floor ?? null,
                ceiling: p.range?.ceiling ?? null,
              }
            }
          : null,
        league: league_,
        more,
        lastWeek: lastWeeks.length && !last.loading ? { week: lastWeeks[0], matchups: last.weeks[0]?.matchups ?? [] } : null,
        stamps: {
          sleeper: sleeperAt,
          projections: lineupIn.projectionsUpdatedAt,
          values: valuesAt,
          news: newsAt,
          model: modelAt,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      m,
      week,
      gd,
      liveKey,
      gm.lineup,
      gm.waivers,
      gm.trades,
      gm.h2h,
      gm.playoff,
      gm.playoffTeams,
      gm.myNews,
      gm.keepers,
      gm.keeperLeague,
      gm.extras,
      engine.model,
      engine.projectionFor,
      last.loading,
      last.weeks,
      league_,
      more,
      sleeperAt,
      lineupIn.projectionsUpdatedAt,
      valuesAt,
      newsAt,
      modelAt,
    ],
  )

  /** names the assistant can recognize: my roster, the league's rosters, and players in facts */
  const names: NameEntry[] = useMemo(() => {
    const mineIds = new Set(m.myRoster()?.players ?? [])
    const ids = new Set<string>([...m.allRostered(), ...facts.flatMap((f) => f.players)])
    return [...ids]
      .filter((id) => m.players[id] && id !== '0')
      .map((id) => ({ id, full: m.name(id), mine: mineIds.has(id) }))
  }, [m, facts])

  const asOf = Math.max(0, ...facts.map((f) => f.asOf ?? 0)) || null
  return {
    facts,
    names,
    asOf,
    pending: [...gm.pending, ...(engine.modelLoading ? ['projections'] : [])],
    unavailable: gm.unavailable,
    leagueName: league.name,
    week,
  }
}

export type FactSheet = ReturnType<typeof useFactSheet>
