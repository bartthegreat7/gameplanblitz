import { useMemo, useState } from 'react'

import { buildBrief } from '../lib/analytics/gm'
import { defaultRules, myKeepers } from '../lib/analytics/keepers'
import { analyzeLineup, mostCommon } from '../lib/analytics/lineupAnalysis'
import { DEFAULT_SEED, DEFAULT_SIMS, prepareSeason, simulate } from '../lib/analytics/playoffs'
import { headToHead } from '../lib/analytics/scouting'
import { findTrades } from '../lib/analytics/trades'
import { analyzeWaivers } from '../lib/analytics/waivers'
import { findOpponent } from '../lib/insights'
import { NewsNotPublished, playerIdsOf } from '../lib/news'
import { mentioning, tsOf } from '../lib/newsFeed'
import { useAppStore } from '../store/app'
import { useKeeperInputs } from './useKeeperInputs'
import type { Ready } from './useLeagueData'
import { useLeagueMatchups } from './useLeagueMatchups'
import { useLineupInputs } from './useLineupInputs'
import { useNews } from './useNews'
import { useTradeInputs } from './useTradeInputs'
import { useWaiverInputs } from './useWaiverInputs'

/** Roster news older than this isn't a "this week" action. */
export const NEWS_WINDOW_MS = 72 * 3_600_000

/**
 * Runs the same inputs and analyzers as each tool page (lineup, waivers, trades, playoff
 * simulator, keepers, news) and assembles the Fantasy GM brief. Used by the GM page and the
 * dashboard so both show the tools' own numbers.
 */
export function useGmBrief(data: Ready) {
  const { model: m, league, matchups, week, season } = data
  const opp = findOpponent(matchups, m.myRosterId)
  const keeperLeague = league.settings.type === 1 || league.settings.type === 2

  const lineupIn = useLineupInputs(season, week)
  const waiverIn = useWaiverInputs(season, week, league.league_id)
  const tradeIn = useTradeInputs(league, season, week, m)
  const keeperIn = useKeeperInputs(league, m.rosters.length, keeperLeague)
  const news = useNews()
  const stored = useAppStore((s) => s.keeperRules[league.league_id])
  const lastRegular = (league.settings.playoff_week_start ?? 15) - 1
  const playoffTeams = league.settings.playoff_teams ?? 6
  const seasonWeeks = useMemo(
    () => (week <= lastRegular ? Array.from({ length: lastRegular }, (_, i) => i + 1) : []),
    [week, lastRegular],
  )
  const sched = useLeagueMatchups(league.league_id, seasonWeeks)
  const [now] = useState(() => Date.now())

  const lineup = useMemo(
    () =>
      analyzeLineup({
        model: m,
        matchups,
        projectionRows: lineupIn.projectionRows,
        weeks: lineupIn.weeks,
        schedule: lineupIn.schedule,
        week,
        mode: 'projection',
      }),
    [m, matchups, lineupIn.projectionRows, lineupIn.weeks, lineupIn.schedule, week],
  )
  const provider = useMemo(
    () => mostCommon(lineupIn.projectionRows.map((r) => r.company)),
    [lineupIn.projectionRows],
  )
  const waiversReady = !waiverIn.horizonLoading && waiverIn.horizon.length > 0
  const waivers = useMemo(
    () =>
      waiversReady
        ? analyzeWaivers({
            model: m,
            league,
            horizon: waiverIn.horizon,
            weeks: lineupIn.weeks,
            schedule: lineupIn.schedule,
            trending: waiverIn.trending,
            provider,
          })
        : null,
    [
      waiversReady,
      m,
      league,
      waiverIn.horizon,
      lineupIn.weeks,
      lineupIn.schedule,
      waiverIn.trending,
      provider,
    ],
  )
  const tradesReady =
    !!tradeIn.values && tradeIn.horizon.length > 0 && tradeIn.horizon[0].proj.size > 0
  const trades = useMemo(
    () =>
      tradesReady
        ? findTrades({
            model: m,
            league,
            horizon: tradeIn.horizon,
            schedule: tradeIn.schedule,
            values: new Map([...tradeIn.values!].map(([id, v]) => [id, v.value])),
            picks: tradeIn.picks,
            scale: tradeIn.scale,
          })
        : null,
    [
      tradesReady,
      m,
      league,
      tradeIn.horizon,
      tradeIn.schedule,
      tradeIn.values,
      tradeIn.picks,
      tradeIn.scale,
    ],
  )
  const h2h = useMemo(() => (opp ? headToHead(m, m.myRosterId, opp.roster_id) : null), [m, opp])
  const playoff = useMemo(() => {
    if (seasonWeeks.length === 0 || sched.loading) return null
    const prep = prepareSeason({ m, weeks: sched.weeks, week, lastRegular, basis: 'blend' })
    if (prep.remaining.length === 0) return null
    const odds = simulate({
      teams: prep.teams,
      standings: prep.standings,
      remaining: prep.remaining,
      playoffTeams,
      sims: DEFAULT_SIMS,
      seed: DEFAULT_SEED,
    })
    return odds.find((o) => o.rosterId === m.myRosterId) ?? null
  }, [seasonWeeks.length, sched.loading, sched.weeks, m, week, lastRegular, playoffTeams])

  const roster = useMemo(() => m.myRoster()?.players ?? [], [m])
  const articles = useMemo(() => news.data?.articles ?? [], [news.data])
  const myNews = useMemo(
    () =>
      mentioning(articles, new Set(roster), (a) => playerIdsOf(a, roster, m.players)).filter(
        (a) => now - tsOf(a) <= NEWS_WINDOW_MS,
      ),
    [articles, roster, m.players, now],
  )
  const teams = league.settings.num_teams || m.rosters.length
  const rules = useMemo(
    () =>
      stored ??
      defaultRules({
        maxKeepers: league.settings.max_keepers,
        draftRounds: league.settings.draft_rounds,
      }),
    [stored, league],
  )
  const keepers = useMemo(
    () =>
      keeperLeague && keeperIn.dynasty && !keeperIn.historyLoading
        ? myKeepers(m, keeperIn.history, keeperIn.dynasty, rules, teams)
        : null,
    [keeperLeague, keeperIn.dynasty, keeperIn.history, keeperIn.historyLoading, m, rules, teams],
  )

  const brief = useMemo(
    () =>
      buildBrief({
        week,
        opponent: opp ? m.teamName(opp.roster_id) : null,
        lineup,
        waivers,
        trades,
        h2h,
        playoff,
        myNews,
        keepers,
        keeperLeague,
      }),
    [week, opp, m, lineup, waivers, trades, h2h, playoff, myNews, keepers, keeperLeague],
  )

  const pending = [
    !waiversReady && 'waivers',
    !trades && tradeIn.valuesLoading && 'trades',
    seasonWeeks.length > 0 && sched.loading && 'playoff odds',
    news.isPending && 'news',
    keeperLeague && (keeperIn.valuesLoading || keeperIn.historyLoading) && 'keepers',
  ].filter(Boolean) as string[]
  const unavailable = [
    tradeIn.valuesFailed && 'trade ideas (FantasyCalc values failed to load)',
    news.isError &&
      (news.error instanceof NewsNotPublished
        ? "roster news (the news feed hasn't been published yet)"
        : 'roster news (the news feed failed to load)'),
    keeperLeague && keeperIn.valuesFailed && 'keeper notes (FantasyCalc values failed to load)',
  ].filter(Boolean) as string[]

  return {
    brief,
    lineup,
    waivers,
    waiversLoading: !waiversReady,
    playoff,
    playoffLoading: seasonWeeks.length > 0 && sched.loading,
    /** no regular-season weeks left to simulate */
    seasonDone: seasonWeeks.length === 0,
    playoffTeams,
    news,
    pending,
    unavailable,
  }
}
