import { FlaskConical } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { PlayerProjection } from '../../lib/projection/client'
import { efficiencyNote } from '../../lib/projection/notes'
import type { ModelFile } from '../../lib/projection/engine'
import { f1, signed } from '../../lib/format'
import { RangeBar } from '../ui/RangeBar'
import { Notice, Skeleton } from '../ui/states'

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

export function ProjectionBreakdown({
  p,
  model,
  loading,
  missing,
  name,
}: {
  p: PlayerProjection
  model: ModelFile | null
  loading: boolean
  missing: boolean
  name: string
}) {
  const note = efficiencyNote(p)
  const max = Math.max(p.range?.ceiling ?? 0, p.value, p.baseline, 1)
  return (
    <section aria-labelledby="pbreak" className="border-line bg-card mt-5 rounded-3xl border p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="pbreak" className="flex items-center gap-2 text-lg font-extrabold">
          <FlaskConical size={18} aria-hidden className="text-accent" /> Projection breakdown
        </h2>
        {loading ? null : p.enabled ? (
          <span className="border-good/40 bg-good/10 text-good rounded-full border px-2.5 py-0.5 text-xs font-bold">
            Validated correction applied
          </span>
        ) : (
          <span className="border-line bg-panel text-ink-2 rounded-full border px-2.5 py-0.5 text-xs font-bold">
            Sleeper baseline
          </span>
        )}
      </div>
      <p className="text-ink-3 mb-4 text-sm">
        How this week's number for {name} is built, in your league's scoring. Model estimates, not
        guarantees.
      </p>
      {missing && (
        <Notice>
          The projection model hasn't been published yet, so this shows Sleeper's projection with no
          correction.
        </Notice>
      )}

      {loading ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(
              [
                ['Projection', f1(p.value)],
                ['Sleeper baseline', f1(p.baseline)],
                ['Floor (10th pct.)', p.range ? f1(p.range.floor) : '—'],
                ['Ceiling (90th pct.)', p.range ? f1(p.range.ceiling) : '—'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="border-line bg-panel rounded-2xl border p-3.5 text-center">
                <dd className="text-xl font-extrabold tabular-nums">{v}</dd>
                <dt className="text-ink-3 text-xs">{k}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <RangeBar
              proj={p.value}
              floor={p.range?.floor ?? null}
              ceiling={p.range?.ceiling ?? null}
              domainMax={max}
            />
            <p className="text-ink-3 mt-1 text-xs">
              {p.range
                ? `80% range from this position's past projection errors (median ${f1(p.range.median)}).`
                : 'No range: not enough past games at this projection level.'}
            </p>
          </div>

          {p.contributions.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold">What moved it from the baseline</h3>
              <ul className="grid gap-1.5 text-sm">
                {p.contributions.map((c) => (
                  <li key={c.label} className="flex justify-between gap-3">
                    <span className="text-ink-2">{c.label}</span>
                    <b
                      className={`tabular-nums ${c.pts > 0.05 ? 'text-good' : c.pts < -0.05 ? 'text-bad' : ''}`}
                    >
                      {signed(c.pts)}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !missing && (
              <p className="text-ink-2 mt-5 text-sm">
                {p.baseline < 1
                  ? "Sleeper doesn't project him to play, so no correction is made."
                  : 'No correction for this position: in backtesting it did not beat Sleeper’s projection, so the baseline is used.'}
              </p>
            )
          )}

          <div className="mt-5">
            <h3 className="mb-2 text-sm font-bold">
              Last {p.recentGames.length || 3} games (newest first)
            </h3>
            {p.recentGames.length === 0 ? (
              <p className="text-ink-3 text-sm">No games played this season yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-ink-3 border-line border-b text-xs">
                      {[
                        'Week',
                        'Pts',
                        'Exp. pts',
                        'Snap %',
                        'Targets',
                        'Carries',
                        'Red zone',
                        'TDs',
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className={`py-2 font-semibold ${h === 'Week' ? 'text-left' : 'text-right'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.recentGames.map((g) => (
                      <tr key={g.week} className="border-line/60 border-b last:border-0">
                        <td className="py-2">Wk {g.week}</td>
                        <td className="py-2 text-right font-bold tabular-nums">{f1(g.pts)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {g.xfp === null ? '—' : f1(g.xfp)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{pct(g.snapShare)}</td>
                        <td className="py-2 text-right tabular-nums">{g.targets}</td>
                        <td className="py-2 text-right tabular-nums">{g.carries}</td>
                        <td className="py-2 text-right tabular-nums">{g.rzOpps}</td>
                        <td className="py-2 text-right tabular-nums">{g.tds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {note && (
              <p className="border-amber/30 bg-amber/8 text-ink-2 mt-3 rounded-xl border px-3.5 py-2.5 text-sm">
                {note}
              </p>
            )}
            <p className="text-ink-3 mt-2 text-xs">
              Previous season:{' '}
              {p.features.prevPpg === null
                ? `${p.prevGames ? `${p.prevGames} games (under 4, not used)` : 'no games'}`
                : `${f1(p.features.prevPpg)} pts per game over ${p.prevGames} games`}
              . Exp. pts = points his targets, carries and red-zone chances usually produce at his
              position. Route participation and practice reports aren't available from Sleeper.
            </p>
          </div>

          <p className="text-ink-3 border-line mt-4 border-t pt-3 text-xs">
            {model
              ? `Model ${model.version}, trained through ${model.trainedThrough.season} week ${model.trainedThrough.week}. `
              : ''}
            <Link to="/accuracy" className="text-accent font-bold hover:underline">
              How accurate is it?
            </Link>
          </p>
        </>
      )}
    </section>
  )
}
