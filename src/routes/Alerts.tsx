import { AlertTriangle, ArrowRight, BellRing, Info } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { LeagueGate } from '../components/LeagueGate'
import { EmptyState, ListSkeleton } from '../components/ui/states'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { useLineupInputs } from '../hooks/useLineupInputs'
import { useProjectionEngine } from '../hooks/useProjectionEngine'
import { useUsageBook } from '../hooks/useUsageBook'
import {
  alertsFor,
  loadBaseline,
  saveBaseline,
  sortAlerts,
  type AlertState,
  type Severity,
} from '../lib/alerts'
import { breakouts } from '../lib/analytics/opportunity'
import { findMyMatchup } from '../lib/insights'
import { gameFor } from '../lib/weather/weather'

const TONE: Record<Severity, { cls: string; icon: typeof AlertTriangle; label: string }> = {
  high: { cls: 'border-bad/40 bg-bad/8', icon: AlertTriangle, label: 'Urgent' },
  medium: { cls: 'border-amber/40 bg-amber/8', icon: BellRing, label: 'Heads up' },
  low: { cls: 'border-line bg-card', icon: Info, label: 'FYI' },
}
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

function AlertsView({ data }: { data: Ready }) {
  const { model: m, matchups, league, week, season } = data
  const engine = useProjectionEngine(data)
  const gm = useGmBrief(data)
  const { book, loading: usageLoading } = useUsageBook(data)
  const { schedule } = useLineupInputs(season, week)
  const [baseline, setBaseline] = useState<AlertState | null>(() => loadBaseline(league.league_id))

  const starters = useMemo(
    () => (findMyMatchup(matchups, m.myRosterId)?.starters ?? []).filter((id) => id && id !== '0'),
    [matchups, m.myRosterId],
  )
  const ready =
    !engine.modelLoading && !engine.historyLoading && !usageLoading && gm.pending.length === 0
  const cur: AlertState = useMemo(() => {
    const rostered = m.allRostered()
    const weather = Object.fromEntries(
      gm.allActions
        .filter((a) => a.area === 'weather')
        .map((a) => [a.id.replace('weather-', ''), a.detail.replace(/\.$/, '')]),
    )
    return {
      savedAt: new Date().toISOString(),
      week,
      injuries: Object.fromEntries((m.myRoster()?.players ?? []).map((id) => [id, m.injury(id)])),
      starters,
      proj: Object.fromEntries(
        starters.map((id) => [id, Math.round(engine.projectionFor(id).value * 10) / 10]),
      ),
      weather,
      breakouts: breakouts(book, m.pos)
        .filter((b) => !rostered.has(b.id))
        .slice(0, 5)
        .map((b) => b.id),
    }
  }, [m, week, starters, engine, gm.allActions, book])

  const firstGame = useMemo(() => {
    const dates = starters
      .map((id) => gameFor(schedule, m.team(id), week)?.date)
      .filter((d): d is string => !!d)
      .sort()
    return dates[0] ? fmtDate(dates[0]) : null
  }, [starters, schedule, m, week])
  const alerts = sortAlerts(alertsFor(baseline, cur, { name: m.name, firstGame }))

  // first visit: remember today's state as the baseline once everything has loaded
  useEffect(() => {
    if (ready && !loadBaseline(league.league_id)) saveBaseline(league.league_id, cur)
  }, [ready, league.league_id, cur])

  const markSeen = () => {
    saveBaseline(league.league_id, cur)
    setBaseline(cur)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
        <BellRing size={24} aria-hidden className="text-accent" /> Alert Center
      </h1>
      <p className="text-ink-2 mt-1">
        {baseline
          ? `Changes for your team since you last marked alerts as seen (${new Date(baseline.savedAt).toLocaleString()}), plus anything urgent right now.`
          : 'Anything urgent right now. From here on, injury, lineup, projection, weather and breakout changes for your team are tracked in this browser.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-3 text-sm">
          In-app only: no email or push notifications are set up.
        </p>
        <button
          type="button"
          onClick={markSeen}
          disabled={!ready}
          className="bg-accent text-accent-ink min-h-10 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
        >
          Mark all as seen
        </button>
      </div>
      <section aria-label="Alerts" className="mt-4">
        {!ready && alerts.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : alerts.length === 0 ? (
          <EmptyState>You&apos;re all caught up.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {alerts.map((a) => {
              const t = TONE[a.severity]
              return (
                <li key={a.key} aria-label={a.title} className={`rounded-2xl border p-4 ${t.cls}`}>
                  <div className="flex items-start gap-3">
                    <t.icon
                      size={18}
                      aria-hidden
                      className={
                        a.severity === 'high'
                          ? 'text-bad mt-0.5'
                          : a.severity === 'medium'
                            ? 'text-amber mt-0.5'
                            : 'text-ink-3 mt-0.5'
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-ink-3 text-xs font-bold tracking-wide uppercase">
                        {t.label}
                      </div>
                      <div className="font-bold">{a.title}</div>
                      <p className="text-ink-2 text-sm">{a.detail}</p>
                    </div>
                    <Link
                      to={a.to}
                      aria-label={`Open: ${a.title}`}
                      className="text-accent grid size-9 shrink-0 place-items-center rounded-lg hover:bg-accent/10"
                    >
                      <ArrowRight size={18} aria-hidden />
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function Alerts() {
  return <LeagueGate>{(data) => <AlertsView data={data} />}</LeagueGate>
}
