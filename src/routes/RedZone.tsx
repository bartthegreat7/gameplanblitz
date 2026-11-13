import { AlertTriangle, ArrowRight, CloudLightning, Flame, Radio, RefreshCw, Swords } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { CARD } from '../components/dashboard/styles'
import { WeekSelect } from '../components/layout/Menus'
import { LeagueGate } from '../components/LeagueGate'
import { ProjectedStandings } from '../components/league/LeagueLive'
import { ScoreList } from '../components/league/ScoreList'
import { EmptyState } from '../components/ui/states'
import { useEnteringRecord } from '../hooks/useEnteringRecord'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { useRedZone } from '../hooks/useRedZone'
import type { EventKind } from '../lib/analytics/redzone'
import { f1, relTime } from '../lib/format'

const H2 = 'mb-1 flex items-center gap-2 text-lg font-extrabold'
const KIND: Record<EventKind, { label: string; cls: string }> = {
  'big-play': { label: 'Big play', cls: 'bg-good/15 text-good' },
  correction: { label: 'Correction', cls: 'bg-amber/15 text-amber' },
  'lead-change': { label: 'Lead change', cls: 'bg-accent/15 text-accent' },
  tied: { label: 'Tied', cls: 'bg-accent/15 text-accent' },
  final: { label: 'Final', cls: 'bg-card-2 text-ink-2' },
}

function RedZoneView({ data }: { data: Ready }) {
  const { model: m, week, league } = data
  const rz = useRedZone(data)
  const gm = useGmBrief(data)
  const record = useEnteringRecord(data)
  const [params] = useSearchParams()
  const focus = params.get('m') !== null ? Number(params.get('m')) : null
  const live = rz.games.filter((g) => g.status === 'live').length
  const final = rz.games.length > 0 && rz.games.every((g) => g.status === 'final')
  const started = live > 0 || rz.games.some((g) => g.status === 'final')
  const weather = gm.allActions.filter((a) => a.area === 'weather')
  const close = rz.leaders.filter((l) => l.margin < 10 && l.playersLeft > 0)

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Radio size={22} aria-hidden className="text-bad" /> League RedZone
          </h1>
          <p className="text-ink-3 text-sm">
            {league.name} · Week {week} · {final ? 'Final' : live ? `${live} matchup${live === 1 ? '' : 's'} live` : 'Not started'}
            {rz.updatedAt ? ` · Sleeper updated ${relTime(rz.updatedAt)}` : ''}
          </p>
        </div>
        <WeekSelect className="bg-card/80" />
      </div>

      <p role="note" className="border-line bg-card/70 text-ink-2 rounded-xl border px-3.5 py-2.5 text-sm">
        <RefreshCw size={14} aria-hidden className="text-ink-3 mr-1.5 inline" />
        Scores refresh about every minute while games are on (only while this tab is open). Sleeper publishes running fantasy points, not
        plays, so the scoring feed lists changes seen between updates; Sleeper&apos;s numbers can trail the broadcast and stat corrections can
        change them later. No game video or play-by-play is shown.
        {rz.scheduleFailed && <b className="text-amber"> NFL game status is unavailable right now, so live/final labels may be incomplete.</b>}
      </p>

      {rz.games.length === 0 ? (
        <EmptyState>Sleeper has no Week {week} matchups for this league.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-label="Every matchup" className="min-w-0">
            <ScoreList m={m} games={rz.games} record={record} focus={focus} />
          </section>

          <aside className="grid min-w-0 content-start gap-4">
            <section aria-label="Scoring feed" className={`${CARD} p-4`}>
              <h2 className={H2}>
                <Flame size={18} aria-hidden className="text-bad" /> Scoring feed
              </h2>
              {rz.events.length === 0 ? (
                <p className="text-ink-2 text-sm">
                  {started
                    ? 'Nothing new since this page opened. Big plays (6+ points between updates), corrections and lead changes appear here as Sleeper reports them.'
                    : 'Games have not started. The feed fills in once Sleeper reports points.'}
                </p>
              ) : (
                <ol className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1" aria-live="polite">
                  {rz.events.map((e) => (
                    <li key={e.key} className="border-line/70 bg-card-2/60 rounded-xl border p-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${KIND[e.kind].cls}`}>{KIND[e.kind].label}</span>
                        <span className="text-ink-3 ml-auto text-xs">{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                      </span>
                      <Link to={`/redzone?m=${e.matchupId}`} className="mt-1 block hover:underline">
                        {e.text}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-label="Closest contests" className={`${CARD} p-4`}>
              <h2 className={H2}>
                <Swords size={18} aria-hidden className="text-accent" /> Closest contests
              </h2>
              {close.length === 0 ? (
                <p className="text-ink-2 text-sm">{started ? 'No undecided game is within 10 points.' : 'Shown once games start.'}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {close.slice(0, 4).map((l) => (
                    <li key={l.matchupId}>
                      <Link to={`/redzone?m=${l.matchupId}`} className="hover:bg-raised flex items-center gap-2 rounded-lg px-1 py-1">
                        <span className="min-w-0 flex-1 truncate">
                          <b>{m.teamName(l.leader)}</b> leads {m.teamName(l.trailer)}
                        </span>
                        <span className="tabular-nums">by {f1(l.margin)}</span>
                        <span className="text-ink-3 text-xs">{l.playersLeft} left</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Injury alerts" className={`${CARD} p-4`}>
              <h2 className={H2}>
                <AlertTriangle size={18} aria-hidden className="text-amber" /> Starters who can&apos;t play
              </h2>
              {rz.alerts.length === 0 ? (
                <p className="text-ink-2 text-sm">No starter in the league is listed Out, Doubtful or on IR before his game.</p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {rz.alerts.map((a) => (
                    <li key={`${a.rosterId}-${a.playerId}`}>
                      <b>{m.name(a.playerId)}</b> ({a.injury}) is in {m.teamName(a.rosterId)}&apos;s lineup
                      {a.rosterId === m.myRosterId && (
                        <Link to="/lineup" className="text-accent ml-1 font-bold hover:underline">
                          Fix lineup
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-ink-3 mt-2 text-xs">Sleeper injury designations. Official inactives are not available from Sleeper.</p>
            </section>

            <section aria-label="Weather updates" className={`${CARD} p-4`}>
              <h2 className={H2}>
                <CloudLightning size={18} aria-hidden className="text-accent" /> Weather for your starters
              </h2>
              {gm.weatherLoading && weather.length === 0 ? (
                <p className="text-ink-2 text-sm">Checking forecasts…</p>
              ) : weather.length === 0 ? (
                <p className="text-ink-2 text-sm">No flagged forecast for your starters.</p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {weather.map((a) => (
                    <li key={a.id}>{a.title}</li>
                  ))}
                </ul>
              )}
              <Link to="/weather" className="text-accent mt-2 inline-flex items-center gap-1 text-sm font-bold hover:underline">
                Weather Watch <ArrowRight size={14} aria-hidden />
              </Link>
            </section>
          </aside>
        </div>
      )}

      {rz.games.length > 0 && (
        <section aria-label="Playoff implications" className={`${CARD} p-4 sm:p-5`}>
          <ProjectedStandings data={data} />
        </section>
      )}
    </div>
  )
}

export default function RedZone() {
  return <LeagueGate>{(data) => <RedZoneView data={data} />}</LeagueGate>
}
