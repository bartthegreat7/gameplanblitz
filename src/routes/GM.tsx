import { ArrowRight, Briefcase } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ProjNotice } from '../components/cards/shared'
import { LeagueGate } from '../components/LeagueGate'
import { ConfidenceBadge } from '../components/ui/badges'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import { useKeeperInputs } from '../hooks/useKeeperInputs'
import type { Ready } from '../hooks/useLeagueData'
import { useLeagueMatchups } from '../hooks/useLeagueMatchups'
import { useLineupInputs } from '../hooks/useLineupInputs'
import { useNews } from '../hooks/useNews'
import { useTradeInputs } from '../hooks/useTradeInputs'
import { useWaiverInputs } from '../hooks/useWaiverInputs'
import { buildBrief, type Area, type GmAction, type Priority } from '../lib/analytics/gm'
import { defaultRules, myKeepers } from '../lib/analytics/keepers'
import { analyzeLineup, mostCommon } from '../lib/analytics/lineupAnalysis'
import { DEFAULT_SEED, DEFAULT_SIMS, prepareSeason, simulate } from '../lib/analytics/playoffs'
import { headToHead } from '../lib/analytics/scouting'
import { findTrades } from '../lib/analytics/trades'
import { analyzeWaivers } from '../lib/analytics/waivers'
import { f1 } from '../lib/format'
import { findOpponent } from '../lib/insights'
import { NewsNotPublished, playerIdsOf } from '../lib/news'
import { mentioning, tsOf } from '../lib/newsFeed'
import { useAppStore } from '../store/app'

/** Roster news older than this isn't a "this week" action. */
const NEWS_WINDOW_MS = 72 * 3_600_000

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  1: { label: 'Do now', cls: 'border-bad/40 bg-bad/10 text-bad' },
  2: { label: 'This week', cls: 'border-accent/40 bg-accent/10 text-accent' },
  3: { label: 'Consider', cls: 'border-line bg-panel text-ink-2' },
}

const TOOL: Record<Area, string> = {
  lineup: 'Lineup Optimizer',
  waivers: 'Waiver Sniper',
  trades: 'Trade War Room',
  news: 'News & Articles',
  playoffs: 'Playoff Simulator',
  keepers: 'Keeper Intelligence',
}

function ActionItem({ a, n }: { a: GmAction; n: number }) {
  const p = PRIORITY[a.priority]
  return (
    <li className="border-line bg-card rounded-2xl border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-ink-3 text-sm font-extrabold">{n}.</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${p.cls}`}>{p.label}</span>
        <span className="text-ink-3 text-xs font-semibold tracking-wide uppercase">{TOOL[a.area]}</span>
        {a.confidence && (
          <span className="ml-auto">
            <ConfidenceBadge confidence={a.confidence} />
          </span>
        )}
      </div>
      <h3 className="text-base leading-snug font-extrabold">{a.title}</h3>
      {a.detail && <p className="text-ink-2 mt-1 text-sm">{a.detail}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <span>
          <span className="text-ink-3">{a.area === 'news' ? 'About: ' : 'Impact: '}</span>
          <b>{a.impact}</b>
        </span>
        <Link to={a.to} className="text-accent inline-flex items-center gap-1 font-bold hover:underline">
          Open {TOOL[a.area]} <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      <p className="text-ink-3 mt-2 text-xs">Source: {a.sources.join(' · ')}</p>
    </li>
  )
}

function Stat({ label, value, model }: { label: string; value: string; model?: boolean }) {
  return (
    <div className="border-line bg-panel rounded-xl border px-3 py-2">
      <div className="text-ink-3 text-xs font-semibold">
        {label}
        {model && <span className="text-amber"> · model</span>}
      </div>
      <div className="text-lg font-extrabold">{value}</div>
    </div>
  )
}

function GMView({ data }: { data: Ready }) {
  const { model: m, league, matchups, week, season } = data
  const opp = findOpponent(matchups, m.myRosterId)
  const keeperLeague = league.settings.type === 1 || league.settings.type === 2

  // the same inputs each tool uses, so the brief matches what the tool pages show
  const lineupIn = useLineupInputs(season, week)
  const waiverIn = useWaiverInputs(season, week, league.league_id)
  const tradeIn = useTradeInputs(league, season, week, m)
  const keeperIn = useKeeperInputs(league, m.rosters.length, keeperLeague)
  const news = useNews()
  const stored = useAppStore((s) => s.keeperRules[league.league_id])
  const lastRegular = (league.settings.playoff_week_start ?? 15) - 1
  const seasonWeeks = useMemo(() => (week <= lastRegular ? Array.from({ length: lastRegular }, (_, i) => i + 1) : []), [week, lastRegular])
  const sched = useLeagueMatchups(league.league_id, seasonWeeks)
  const [now] = useState(() => Date.now())

  const lineup = useMemo(
    () =>
      analyzeLineup({ model: m, matchups, projectionRows: lineupIn.projectionRows, weeks: lineupIn.weeks, schedule: lineupIn.schedule, week, mode: 'projection' }),
    [m, matchups, lineupIn.projectionRows, lineupIn.weeks, lineupIn.schedule, week],
  )
  const provider = useMemo(() => mostCommon(lineupIn.projectionRows.map((r) => r.company)), [lineupIn.projectionRows])
  const waiversReady = !waiverIn.horizonLoading && waiverIn.horizon.length > 0
  const waivers = useMemo(
    () =>
      waiversReady
        ? analyzeWaivers({ model: m, league, horizon: waiverIn.horizon, weeks: lineupIn.weeks, schedule: lineupIn.schedule, trending: waiverIn.trending, provider })
        : null,
    [waiversReady, m, league, waiverIn.horizon, lineupIn.weeks, lineupIn.schedule, waiverIn.trending, provider],
  )
  const tradesReady = !!tradeIn.values && tradeIn.horizon.length > 0 && tradeIn.horizon[0].proj.size > 0
  const trades = useMemo(
    () =>
      tradesReady
        ? findTrades({ model: m, league, horizon: tradeIn.horizon, schedule: tradeIn.schedule, values: new Map([...tradeIn.values!].map(([id, v]) => [id, v.value])), picks: tradeIn.picks, scale: tradeIn.scale })
        : null,
    [tradesReady, m, league, tradeIn.horizon, tradeIn.schedule, tradeIn.values, tradeIn.picks, tradeIn.scale],
  )
  const h2h = useMemo(() => (opp ? headToHead(m, m.myRosterId, opp.roster_id) : null), [m, opp])
  const playoff = useMemo(() => {
    if (seasonWeeks.length === 0 || sched.loading) return null
    const prep = prepareSeason({ m, weeks: sched.weeks, week, lastRegular, basis: 'blend' })
    if (prep.remaining.length === 0) return null
    const odds = simulate({ teams: prep.teams, standings: prep.standings, remaining: prep.remaining, playoffTeams: league.settings.playoff_teams ?? 6, sims: DEFAULT_SIMS, seed: DEFAULT_SEED })
    return odds.find((o) => o.rosterId === m.myRosterId) ?? null
  }, [seasonWeeks.length, sched.loading, sched.weeks, m, week, lastRegular, league.settings.playoff_teams])

  const roster = useMemo(() => m.myRoster()?.players ?? [], [m])
  const articles = useMemo(() => news.data?.articles ?? [], [news.data])
  const myNews = useMemo(
    () => mentioning(articles, new Set(roster), (a) => playerIdsOf(a, roster, m.players)).filter((a) => now - tsOf(a) <= NEWS_WINDOW_MS),
    [articles, roster, m.players, now],
  )
  const teams = league.settings.num_teams || m.rosters.length
  const rules = useMemo(() => stored ?? defaultRules({ maxKeepers: league.settings.max_keepers, draftRounds: league.settings.draft_rounds }), [stored, league])
  const keepers = useMemo(
    () => (keeperLeague && keeperIn.dynasty && !keeperIn.historyLoading ? myKeepers(m, keeperIn.history, keeperIn.dynasty, rules, teams) : null),
    [keeperLeague, keeperIn.dynasty, keeperIn.history, keeperIn.historyLoading, m, rules, teams],
  )

  const brief = buildBrief({
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
  })

  const pending = [
    !waiversReady && 'waivers',
    !trades && tradeIn.valuesLoading && 'trades',
    seasonWeeks.length > 0 && sched.loading && 'playoff odds',
    news.isPending && 'news',
    keeperLeague && (keeperIn.valuesLoading || keeperIn.historyLoading) && 'keepers',
  ].filter(Boolean) as string[]
  const unavailable = [
    tradeIn.valuesFailed && 'trade ideas (FantasyCalc values failed to load)',
    news.isError && (news.error instanceof NewsNotPublished ? "roster news (the news feed hasn't been published yet)" : 'roster news (the news feed failed to load)'),
    keeperLeague && keeperIn.valuesFailed && 'keeper notes (FantasyCalc values failed to load)',
  ].filter(Boolean) as string[]
  const s = brief.summary

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Briefcase size={22} aria-hidden className="text-accent" /> Fantasy GM
      </h1>
      <p className="text-ink-3 mb-4 text-sm">
        A <b>rules-based</b> weekly brief built from this app's own tools. No AI writes it, and it adds no numbers of its own. Each item names its source and confidence and links to the tool behind it.
      </p>
      <ProjNotice data={data} />

      <section aria-label="This week" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`Week ${s.week} opponent`} value={s.opponent ?? 'None posted'} />
        <Stat label="Projected score" value={s.myProj !== null && s.oppProj !== null ? `${f1(s.myProj)} – ${f1(s.oppProj)}` : '—'} model />
        <Stat label="Win odds" value={s.winPct !== null ? `${Math.round(s.winPct)}%` : '—'} model />
        <Stat label="Playoff odds" value={s.playoffPct !== null ? `${f1(s.playoffPct)}%` : seasonWeeks.length === 0 ? 'Season done' : '—'} model />
      </section>

      {pending.length > 0 && <Notice tone="ok">Still checking: {pending.join(', ')}. More items may appear.</Notice>}
      {unavailable.length > 0 && <Notice>Not included this time: {unavailable.join('; ')}.</Notice>}

      <section aria-label="Your action items">
        <h2 className="mb-3 text-lg font-extrabold">Action items</h2>
        {brief.actions.length === 0 ? (
          pending.length > 0 ? (
            <ListSkeleton rows={3} />
          ) : (
            <EmptyState>Nothing needs your attention right now: your lineup is set and no tool found a clear upgrade.</EmptyState>
          )
        ) : (
          <ol className="grid gap-3">
            {brief.actions.map((a, i) => (
              <ActionItem key={a.id} a={a} n={i + 1} />
            ))}
          </ol>
        )}
      </section>

      <p className="text-ink-3 mt-5 text-xs">
        Order: fixes to facts (empty, bye or Out starters) first, then this week's projected upgrades and roster news, then longer-term ideas. Projections, odds and trade fits are model estimates, not guarantees.
      </p>
    </div>
  )
}

export default function GM() {
  return <LeagueGate>{(data) => <GMView data={data} />}</LeagueGate>
}
