import { AlertTriangle, ClipboardCheck, Crosshair, Gauge, ShieldQuestion } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import type { Ready } from '../../hooks/useLeagueData'
import { usePastWeeks } from '../../hooks/usePastWeeks'
import { adviceRecord, biggestMisses, calibration, matchupPoints } from '../../lib/analytics/trust'
import { f1, relTime } from '../../lib/format'
import { findMyMatchup } from '../../lib/insights'
import type { ModelFile } from '../../lib/projection/engine'
import { CARD } from '../dashboard/styles'
import { EmptyState, ListSkeleton } from '../ui/states'

const pct = (x: number) => `${Math.round(x * 100)}%`
const signedPts = (x: number) => `${x >= 0 ? '+' : '−'}${f1(Math.abs(x))}`

const LIMITS = [
  'Weather is not part of the projections, and past forecasts are not stored, so accuracy by weather cannot be measured yet.',
  'Past-week projections are the ones Sleeper serves now; they may differ slightly from what was shown before kickoff.',
  'Win probabilities treat both lineups as independent and use a fixed spread; they do not know about late injuries.',
  'Injury news after projections are published (and practice reports, which Sleeper leaves empty) are not modeled.',
  'Small samples: a handful of weeks in one league says little; the engine backtest covers thousands of player-games.',
  'Custom league tiebreakers and keeper rules are not in the playoff simulation.',
]

/** The trust summary: plain-language accuracy, this league's calibration, advice tracking, recent misses, limits. */
export function TrustPanel({ data, file }: { data: Ready; file: ModelFile | null }) {
  const m = data.model
  const { past, reviews, loading } = usePastWeeks(data)
  const cal = useMemo(() => calibration(matchupPoints(past)), [past])
  const advice = useMemo(() => adviceRecord(reviews), [reviews])
  const last = [...past].sort((a, b) => b.week - a.week)[0]
  const misses = useMemo(() => {
    if (!last) return []
    const mine = findMyMatchup(last.matchups, m.myRosterId)
    return mine ? biggestMisses(mine, last.projOf) : []
  }, [last, m.myRosterId])
  const o = file?.accuracy?.overall

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      <section aria-label="Trust summary" className={`${CARD} p-4 sm:p-5`}>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
          <Gauge size={20} aria-hidden className="text-accent" /> In plain words
        </h2>
        {o && file ? (
          <ul className="text-ink-2 grid gap-1.5 text-[15px]">
            <li>
              Tested on <b className="text-ink">{o.n.toLocaleString()}</b> past player-games with no look-ahead, GamePlanBitz projections missed by{' '}
              <b className="text-ink">{f1(o.maeModel)} points</b> per player on average; Sleeper&apos;s own projections missed by{' '}
              <b className="text-ink">{f1(o.maeBaseline)}</b>.
            </li>
            <li>
              On average our projections ran <b className="text-ink">{Math.abs(o.biasModel) < 0.05 ? 'right on target' : `${f1(Math.abs(o.biasModel))} points too ${o.biasModel > 0 ? 'high' : 'low'}`}</b>.
            </li>
            {o.coverage !== null && (
              <li>
                Our 80% ranges contained the actual score <b className="text-ink">{pct(o.coverage)}</b> of the time (the target is 80%).
              </li>
            )}
            <li className="text-ink-3 text-sm">
              Model updated {relTime(Date.parse(file.updated))}, trained through {file.trainedThrough.season} Week {file.trainedThrough.week}.
            </li>
          </ul>
        ) : (
          <p className="text-ink-3 text-sm">The projection model has not been published yet, so the app uses Sleeper&apos;s projections.</p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Win probability calibration" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
            <Crosshair size={20} aria-hidden className="text-good" /> Win odds in your league
          </h2>
          <p className="text-ink-3 mb-3 text-xs">
            Every decided matchup this season: the favorite&apos;s pre-game win chance (set lineups, that week&apos;s Sleeper projections) vs how often favorites won.
          </p>
          {loading && !cal.n ? (
            <ListSkeleton rows={3} />
          ) : cal.n === 0 ? (
            <EmptyState>No completed matchups yet.</EmptyState>
          ) : (
            <>
              <table className="w-full text-sm">
                <caption className="sr-only">Predicted vs observed win rates of favorites</caption>
                <thead>
                  <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                    <th scope="col" className="pb-1.5 font-semibold">Favorite&apos;s chance</th>
                    <th scope="col" className="pb-1.5 text-right font-semibold">Games</th>
                    <th scope="col" className="pb-1.5 text-right font-semibold">Predicted</th>
                    <th scope="col" className="pb-1.5 text-right font-semibold">Favorites won</th>
                  </tr>
                </thead>
                <tbody>
                  {cal.bins.map((b) => (
                    <tr key={b.label} className="border-line/50 border-b last:border-0">
                      <th scope="row" className="py-1.5 text-left font-semibold">{b.label}</th>
                      <td className="py-1.5 text-right tabular-nums">{b.n}</td>
                      <td className="py-1.5 text-right tabular-nums">{pct(b.predicted)}</td>
                      <td className="py-1.5 text-right font-bold tabular-nums">{pct(b.observed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-ink-2 mt-2 text-sm">
                Brier score <b>{cal.brier.toFixed(3)}</b> over {cal.n} games (a coin flip scores 0.250; lower is better).
                {cal.n < 30 && ' With this few games, treat it as a rough check.'}
              </p>
            </>
          )}
        </section>

        <section aria-label="Recommendation tracking" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
            <ClipboardCheck size={20} aria-hidden className="text-amber" /> Lineup advice, tracked
          </h2>
          <p className="text-ink-3 mb-3 text-xs">The advice = the best lineup by that week&apos;s projections. Compared with the lineup you set.</p>
          {advice.weeks === 0 ? (
            loading ? <ListSkeleton rows={2} /> : <EmptyState>No completed weeks yet.</EmptyState>
          ) : (
            <p className="text-ink-2 text-[15px]">
              Your lineup matched the advice in <b className="text-ink">{advice.followed} of {advice.weeks}</b> weeks.
              {advice.differed > 0 && (
                <>
                  {' '}In the {advice.differed} week{advice.differed === 1 ? '' : 's'} it differed, the advised lineup would have scored more in{' '}
                  <b className="text-ink">{advice.adviceScoredMore}</b>, a net <b className={advice.net >= 0 ? 'text-good' : 'text-bad'}>{signedPts(advice.net)}</b> points.
                </>
              )}{' '}
              <span className="text-ink-3 text-sm">This compares outcomes; it does not show that any advice caused a win or loss.</span>
            </p>
          )}
          <Link to="/autopilot" className="text-accent mt-2 inline-block text-sm font-bold hover:underline">
            Every recommendation you&apos;ve seen: Autopilot history →
          </Link>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Recent misses" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
            <AlertTriangle size={20} aria-hidden className="text-bad" /> Recent misses{last ? ` · Week ${last.week}` : ''}
          </h2>
          <p className="text-ink-3 mb-3 text-xs">Your starters, Sleeper projection vs points (league scoring).</p>
          {misses.length === 0 ? (
            <EmptyState>No completed week with your starters yet.</EmptyState>
          ) : (
            <ul className="grid gap-1 text-sm">
              {misses.map((x) => (
                <li key={x.id} className="flex justify-between gap-2">
                  <Link to={`/players/${x.id}`} className="truncate font-semibold hover:underline">
                    {m.name(x.id)}
                  </Link>
                  <span className="shrink-0 tabular-nums">
                    projected {f1(x.proj)}, scored {f1(x.actual)}{' '}
                    <b className={x.error >= 0 ? 'text-good' : 'text-bad'}>({signedPts(x.error)})</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Known limitations" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
            <ShieldQuestion size={20} aria-hidden className="text-purple" /> Known limitations
          </h2>
          <ul className="text-ink-2 grid list-disc gap-1 pl-5 text-sm">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
