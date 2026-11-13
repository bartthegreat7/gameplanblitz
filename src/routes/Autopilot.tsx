import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarClock, Gauge, HeartPulse, History, Plus, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { CARD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { ConfidenceBadge } from '../components/ui/badges'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { CADENCE, focusFor, historyKey, mergeHistory, readHistory, recStatus, type RecEntry } from '../lib/analytics/autopilot'
import { gameDate, teamHealth } from '../lib/analytics/command'
import type { GmAction, Priority } from '../lib/analytics/gm'
import { f1, relTime } from '../lib/format'
import { findMyMatchup } from '../lib/insights'
import { getSchedule } from '../lib/sleeper'

const URGENCY: Record<Priority, { label: string; cls: string }> = {
  1: { label: 'Do now', cls: 'border-bad/40 bg-bad/10 text-bad' },
  2: { label: 'This week', cls: 'border-amber/40 bg-amber/10 text-amber' },
  3: { label: 'Consider', cls: 'border-line bg-panel text-ink-2' },
}

const KEY = historyKey

function ActionCard({ a, n, freshness }: { a: GmAction; n: number; freshness: string }) {
  const u = URGENCY[a.priority]
  return (
    <li className="border-line/70 bg-card-2/60 grid gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-3 text-sm font-extrabold">{n}.</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${u.cls}`}>{u.label}</span>
        {a.deadline && <span className="text-ink-3 text-xs">Deadline: {a.deadline}</span>}
        {a.confidence && (
          <span className="ml-auto">
            <ConfidenceBadge confidence={a.confidence} />
          </span>
        )}
      </div>
      <h3 className="text-base leading-snug font-extrabold">{a.title}</h3>
      {a.detail && <p className="text-ink-2 text-sm">{a.detail}</p>}
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-3 inline">Expected impact: </dt>
          <dd className="inline font-bold">{a.impact}</dd>
        </div>
        <div>
          <dt className="text-ink-3 inline">Data: </dt>
          <dd className="inline">{freshness}</dd>
        </div>
        {a.uncertainty && (
          <div className="sm:col-span-2">
            <dt className="text-ink-3 inline">Uncertainty: </dt>
            <dd className="inline">{a.uncertainty}</dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-ink-3 inline">Supporting data: </dt>
          <dd className="inline">{a.sources.join(' · ')}</dd>
        </div>
      </dl>
      <Link to={a.to} className="text-accent inline-flex items-center gap-1 text-sm font-bold hover:underline">
        Review it <ArrowRight size={14} aria-hidden />
      </Link>
    </li>
  )
}

function AutopilotView({ data }: { data: Ready }) {
  const { model: m, matchups, week, league, season } = data
  const gm = useGmBrief(data)
  const qc = useQueryClient()
  const plan = gm.lineup?.plan ?? null
  const health = useMemo(() => (plan ? teamHealth(plan) : null), [plan])
  const [day] = useState(() => new Date().getDay())
  const today = focusFor(day)
  const syncedAt = qc.getQueryState(['rosters', league.league_id])?.dataUpdatedAt || null
  const freshness = syncedAt ? `Sleeper synced ${relTime(syncedAt)}` : 'Sleeper data loading'
  const scheduleQ = useQuery({ queryKey: ['schedule', season], queryFn: () => getSchedule(season), staleTime: 30 * 60_000, retry: 1 })

  // lineup locks: each of my starters locks at his game's kickoff (Sleeper publishes dates, not times)
  const deadlines = useMemo(() => {
    const starters = (findMyMatchup(matchups, m.myRosterId)?.starters ?? []).filter((id) => id && id !== '0')
    const by = new Map<string, string[]>()
    for (const id of starters) {
      const g = (scheduleQ.data ?? []).find((x) => x.week === week && (x.home === m.team(id) || x.away === m.team(id)))
      if (!g?.date || g.status === 'complete') continue
      by.set(g.date, [...(by.get(g.date) ?? []), m.shortName(id)])
    }
    return [...by].sort(([a], [b]) => a.localeCompare(b))
  }, [matchups, m, scheduleQ.data, week])

  // recommendation history (this browser): record what is recommended now
  const [now] = useState(() => Date.now())
  const ready = gm.pending.length === 0
  const history: RecEntry[] = useMemo(() => {
    const saved = readHistory(league.league_id)
    return ready ? mergeHistory(saved, week, gm.allActions, now) : saved
  }, [ready, gm.allActions, league.league_id, week, now])
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(KEY(league.league_id), JSON.stringify(history))
    } catch {
      /* storage unavailable: history lasts for this visit only */
    }
  }, [ready, history, league.league_id])
  const current = new Set(gm.allActions.map((a) => a.id))
  const top = gm.allActions.slice(0, 3)
  const adds = (gm.waivers?.candidates ?? []).filter((c) => c.kind === 'upgrade').slice(0, 3)
  const benchHurt = (m.myRoster()?.players ?? []).filter((id) => m.injury(id) && !plan?.slots.some((s) => s.current?.id === id))

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Sparkles size={22} aria-hidden className="text-accent" /> Fantasy Autopilot
        </h1>
        <p className="text-ink-3 text-sm">
          Your team watched for you: lineup, injuries, weather, waivers, trades and the playoff race, ranked by urgency.
        </p>
      </div>
      <Notice tone="ok">
        <ShieldCheck size={15} aria-hidden className="mr-1 inline" />
        Recommendation-only. Autopilot never changes your Sleeper roster or lineup: Sleeper&apos;s public API is read-only. It
        re-checks everything each time you open GamePlanBitz; scheduled briefings when the app is closed need the AI server.
      </Notice>

      <section aria-label="This week's rhythm" className={`${CARD} p-4`}>
        <ol className="grid gap-2 sm:grid-cols-5">
          {CADENCE.slice()
            .sort((a, b) => ((a.day + 5) % 7) - ((b.day + 5) % 7))
            .map((c) => {
              const on = c.day === today.day
              return (
                <li key={c.day}>
                  <Link
                    to={c.to}
                    aria-current={on ? 'true' : undefined}
                    className={`block h-full rounded-xl border p-3 text-sm transition-colors ${on ? 'border-accent bg-accent/12' : 'border-line/70 hover:bg-raised'}`}
                  >
                    <span className={`block text-xs font-extrabold tracking-wide uppercase ${on ? 'text-accent' : 'text-ink-3'}`}>
                      {c.label}
                      {on && ' · today'}
                    </span>
                    <span className="mt-1 block leading-snug">{c.focus}</span>
                  </Link>
                </li>
              )
            })}
        </ol>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="Top recommended actions" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
            <Gauge size={20} aria-hidden className="text-accent" /> Top 3 actions
          </h2>
          {top.length === 0 ? (
            gm.pending.length ? (
              <ListSkeleton rows={3} />
            ) : (
              <EmptyState>Nothing needs your attention right now: your lineup is set and no tool found a clear upgrade.</EmptyState>
            )
          ) : (
            <ol className="grid gap-3">
              {top.map((a, i) => (
                <ActionCard key={a.id} a={a} n={i + 1} freshness={freshness} />
              ))}
            </ol>
          )}
          {gm.allActions.length > 3 && (
            <Link to="/edge" className="text-accent mt-3 inline-flex items-center gap-1 text-sm font-bold hover:underline">
              All {gm.allActions.length} recommendations on The Edge <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </section>

        <div className="grid content-start gap-5">
          <section aria-label="Team readiness" className={`${CARD} p-4`}>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
              <ShieldCheck size={20} aria-hidden className="text-good" /> Team readiness
            </h2>
            {health ? (
              <>
                <div className="text-3xl font-extrabold tabular-nums">{Math.round(health.readiness)}%</div>
                <p className="text-ink-2 text-sm">
                  {health.ready} of {health.slots} starters available · Sleeper designations and byes
                </p>
              </>
            ) : (
              <p className="text-ink-3 text-sm">No lineup posted for Week {week} yet.</p>
            )}
          </section>

          <section aria-label="Upcoming deadlines" className={`${CARD} p-4`}>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
              <CalendarClock size={20} aria-hidden className="text-amber" /> Upcoming deadlines
            </h2>
            {deadlines.length === 0 ? (
              <p className="text-ink-3 text-sm">No unlocked starters left this week.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {deadlines.map(([date, names]) => (
                  <li key={date}>
                    <b>{gameDate(date)}</b>: {names.join(', ')} lock at kickoff
                  </li>
                ))}
              </ul>
            )}
            <p className="text-ink-3 mt-2 text-xs">Sleeper publishes game dates but not kickoff times; waiver processing time is set in your league.</p>
          </section>

          <section aria-label="Injury concerns" className={`${CARD} p-4`}>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
              <HeartPulse size={20} aria-hidden className="text-bad" /> Injury concerns
            </h2>
            {!health || (health.concerns.length === 0 && benchHurt.length === 0) ? (
              <p className="text-good text-sm font-semibold">No designations on your roster.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {health.concerns.map((c, i) => (
                  <li key={`${c.slot}-${i}`}>
                    <b>{c.name}</b> ({c.slot}): {c.status}
                  </li>
                ))}
                {benchHurt.map((id) => (
                  <li key={id} className="text-ink-2">
                    {m.name(id)} (bench): {m.injury(id)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Waiver opportunities" className={`${CARD} p-4`}>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
              <Plus size={20} aria-hidden className="text-good" /> Waiver opportunities
            </h2>
            {gm.waiversLoading && !gm.waivers ? (
              <ListSkeleton rows={2} />
            ) : adds.length === 0 ? (
              <p className="text-ink-3 text-sm">No free agent beats your lineup right now.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {adds.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <Link to={`/players/${c.id}`} className="truncate font-semibold hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-good shrink-0 font-bold tabular-nums">+{f1(c.gainPerWeek)}/wk</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section aria-label="Recommendation history" className={`${CARD} p-4 sm:p-5`}>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
          <History size={20} aria-hidden className="text-accent" /> Recent recommendations
        </h2>
        <p className="text-ink-3 mb-3 text-xs">
          Kept in this browser. &ldquo;Cleared&rdquo; means the data no longer supports it (for example the lineup was fixed or a
          player was ruled healthy); it does not claim the advice changed a result.
        </p>
        {history.length === 0 ? (
          <EmptyState>Recommendations you see here are recorded as you use GamePlanBitz.</EmptyState>
        ) : (
          <ul className="grid gap-1.5 text-sm">
            {history.slice(0, 15).map((e) => {
              const s = recStatus(e, week, current)
              return (
                <li key={e.key} className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s === 'active' ? 'bg-amber/15 text-amber' : s === 'cleared' ? 'bg-good/15 text-good' : 'bg-line text-ink-2'}`}
                  >
                    {s === 'active' ? 'Active' : s === 'cleared' ? 'Cleared' : `Week ${e.week}`}
                  </span>
                  <Link to={e.to} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                    {e.title}
                  </Link>
                  <span className="text-ink-3 text-xs">
                    {e.impact} · first seen {relTime(e.firstSeen)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function Autopilot() {
  return <LeagueGate>{(data) => <AutopilotView data={data} />}</LeagueGate>
}
