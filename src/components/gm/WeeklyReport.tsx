import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { useGmBrief } from '../../hooks/useGmBrief'
import type { Ready } from '../../hooks/useLeagueData'
import { availabilityOf } from '../../lib/analytics/opportunity'
import { f1, signed } from '../../lib/format'

function ReportSection({
  title,
  to,
  link,
  children,
}: {
  title: string
  to?: string
  link?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className="border-line bg-card rounded-2xl border p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold">{title}</h2>
        {to && (
          <Link
            to={to}
            className="text-accent inline-flex items-center gap-1 text-sm font-bold hover:underline"
          >
            {link} <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** The Fantasy GM's weekly report: lineup, injuries, weather, waivers, trades and the playoff race. */
export function WeeklyReport({ data, gm }: { data: Ready; gm: ReturnType<typeof useGmBrief> }) {
  const { allActions, lineup, waivers, playoff, seasonDone } = gm
  const m = data.model
  const hurt = (m.myRoster()?.players ?? []).filter((id) => m.injury(id))
  const weather = allActions.filter((a) => a.area === 'weather')
  const trades = allActions.filter((a) => a.area === 'trades')
  const adds = (waivers?.candidates ?? []).filter((c) => c.kind === 'upgrade').slice(0, 3)
  return (
    <>
        <h2 className="mt-8 mb-3 text-xl font-extrabold tracking-tight">Weekly report</h2>
        <div className="grid gap-4">
          <ReportSection title="Recommended lineup" to="/lineup" link="Lineup Optimizer">
            {!lineup ? (
              <p className="text-ink-3 text-sm">No matchup posted for this week.</p>
            ) : (
              <>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {lineup.plan.slots.map((sl, i) => (
                    <li key={`${sl.slot}-${i}`} className="flex justify-between gap-3">
                      <span>
                        <b className="text-ink-3 mr-2 inline-block w-10">{sl.label}</b>
                        {sl.recommended?.name ?? 'Empty'}
                        {sl.changed && !sl.move && (
                          <span className="text-accent ml-1.5 text-xs font-bold">change</span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {sl.recommended ? f1(sl.recommended.proj) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-ink-3 mt-2 text-xs">
                  {f1(lineup.plan.current.proj)} as set → {f1(lineup.plan.recommended.proj)} projected
                  with these changes (Sleeper projections).
                </p>
              </>
            )}
          </ReportSection>
          <div className="grid gap-4 md:grid-cols-2">
            <ReportSection title="Injury concerns" to="/injuries" link="Injury Center">
              {hurt.length === 0 ? (
                <p className="text-ink-3 text-sm">No injury designations on your roster.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {hurt.map((id) => (
                    <li key={id} className="flex justify-between gap-3">
                      <span>{m.name(id)}</span>
                      <b
                        className={availabilityOf(m.injury(id)) === 'out' ? 'text-bad' : 'text-amber'}
                      >
                        {m.injury(id)}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>
            <ReportSection title="Weather risks">
              {weather.length === 0 ? (
                <p className="text-ink-3 text-sm">
                  No flagged forecasts for your starters (strong wind, heavy precipitation, snow or
                  storms).
                </p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {weather.map((a) => (
                    <li key={a.id}>
                      <b>{a.title.replace('Review weather for ', '')}</b>: {a.detail}
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>
            <ReportSection title="Waiver opportunities" to="/waivers" link="Waiver Sniper">
              {adds.length === 0 ? (
                <p className="text-ink-3 text-sm">No free agent beats your lineup right now.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {adds.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3">
                      <span>
                        {c.name}
                        {c.drop ? <span className="text-ink-3"> (drop {c.drop.name})</span> : null}
                      </span>
                      <b className="text-good tabular-nums">{signed(c.gainPerWeek)}/wk</b>
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>
            <ReportSection title="Trade considerations" to="/trades" link="Trade War Room">
              {trades.length === 0 ? (
                <p className="text-ink-3 text-sm">
                  No fair 1-for-1 swap found that helps both teams.
                </p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {trades.map((a) => (
                    <li key={a.id}>
                      <b>{a.title}</b> · {a.impact}
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>
          </div>
          <ReportSection title="Playoff implications" to="/playoffs" link="Playoff Simulator">
            {playoff ? (
              <p className="text-sm">
                <b>{f1(playoff.playoffPct)}%</b> to make the playoffs,{' '}
                <b>{f1(playoff.championPct)}%</b> to win the title, average finish{' '}
                {f1(playoff.avgSeed)} with {f1(playoff.avgWins)} wins{' '}
                <span className="text-ink-3">
                  (seeded simulation of the remaining schedule; model)
                </span>
                .
              </p>
            ) : (
              <p className="text-ink-3 text-sm">
                {seasonDone
                  ? 'The regular season is over.'
                  : 'Playoff odds are unavailable until the remaining schedule loads.'}
              </p>
            )}
          </ReportSection>
          <p className="text-ink-2 text-sm">
            Every decision with its full evidence, uncertainty and deadline is on{' '}
            <Link to="/edge" className="text-accent font-bold hover:underline">
              The Edge
            </Link>
            .
          </p>
        </div>
    </>
  )
}
