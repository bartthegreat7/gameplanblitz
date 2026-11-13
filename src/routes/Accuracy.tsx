import { useQuery } from '@tanstack/react-query'
import { LeagueGate } from '../components/LeagueGate'
import { TrustPanel } from '../components/trust/TrustPanel'
import { useAppStore } from '../store/app'
import { Target } from 'lucide-react'
import type { ReactNode } from 'react'

import { ErrorState, ListSkeleton, EmptyState } from '../components/ui/states'
import { signed } from '../lib/format'
import { getModelFile, ModelNotPublished } from '../lib/projection/client'
import { POSITIONS, type Metrics, type ModelFile } from '../lib/projection/engine'

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
const better = (base: number, model: number) =>
  model < base - 0.005 ? 'text-good' : model > base + 0.005 ? 'text-bad' : ''

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-line bg-card mt-5 rounded-2xl border p-5 sm:p-6">
      <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
      {sub && <p className="text-ink-3 mt-0.5 mb-4 text-sm">{sub}</p>}
      {children}
    </section>
  )
}

function MetricsTable({
  rows,
  label,
}: {
  rows: { name: string; m: Metrics; extra?: ReactNode }[]
  label: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[15px]">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="text-ink-3 border-line border-b text-sm">
            <th scope="col" className="py-2.5 text-left font-semibold">
              {label}
            </th>
            {[
              'Games',
              'MAE Sleeper',
              'MAE engine',
              'RMSE Sleeper',
              'RMSE engine',
              'Bias Sleeper',
              'Bias engine',
              '80% range hit',
            ].map((h) => (
              <th key={h} scope="col" className="py-2.5 text-right font-semibold">
                {h}
              </th>
            ))}
            {rows.some((r) => r.extra) && (
              <th scope="col" className="py-2.5 pl-4 text-left font-semibold">
                Correction
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, m, extra }) => (
            <tr key={name} className="border-line/60 border-b last:border-0">
              <th scope="row" className="py-2.5 text-left font-bold">
                {name}
              </th>
              <td className="text-ink-2 py-2.5 text-right tabular-nums">{m.n.toLocaleString()}</td>
              <td className="py-2.5 text-right tabular-nums">{m.maeBaseline.toFixed(2)}</td>
              <td
                className={`py-2.5 text-right font-bold tabular-nums ${better(m.maeBaseline, m.maeModel)}`}
              >
                {m.maeModel.toFixed(2)}
              </td>
              <td className="py-2.5 text-right tabular-nums">{m.rmseBaseline.toFixed(2)}</td>
              <td
                className={`py-2.5 text-right tabular-nums ${better(m.rmseBaseline, m.rmseModel)}`}
              >
                {m.rmseModel.toFixed(2)}
              </td>
              <td className="py-2.5 text-right tabular-nums">{signed(m.biasBaseline)}</td>
              <td className="py-2.5 text-right tabular-nums">{signed(m.biasModel)}</td>
              <td className="py-2.5 text-right tabular-nums">{pct(m.coverage)}</td>
              {extra !== undefined && <td className="py-2.5 pl-4">{extra}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Report({ file }: { file: ModelFile }) {
  const a = file.accuracy
  const fm = file.formats.ppr
  if (!a || !fm) return <EmptyState>The model has no accuracy report yet.</EmptyState>
  const weeks = [...new Set(a.byWeek.map((b) => b.week))]
  const o = a.overall
  return (
    <>
      <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            [
              'Mean absolute error',
              `${o.maeModel.toFixed(2)} vs ${o.maeBaseline.toFixed(2)}`,
              'engine vs Sleeper, points per player-game',
            ],
            [
              'Root mean squared error',
              `${o.rmseModel.toFixed(2)} vs ${o.rmseBaseline.toFixed(2)}`,
              'penalizes big misses more',
            ],
            [
              'Bias',
              `${signed(o.biasModel)} vs ${signed(o.biasBaseline)}`,
              'positive = projections too high',
            ],
            [
              '80% range coverage',
              pct(o.coverage),
              'share of actual scores inside floor–ceiling (target 80%)',
            ],
          ] as const
        ).map(([k, v, sub]) => (
          <div key={k} className="bg-card p-5">
            <div className="text-ink-2 text-sm font-semibold">{k}</div>
            <div className="mt-1.5 text-2xl font-extrabold tabular-nums">{v}</div>
            <div className="text-ink-3 mt-1 text-sm">{sub}</div>
          </div>
        ))}
      </div>

      <Section
        title="By position"
        sub="Each position's correction is switched on only if it beat Sleeper by at least 2 standard errors in the backtest."
      >
        <MetricsTable
          label="Position"
          rows={POSITIONS.filter((p) => a.byPosition[p]).map((p) => {
            const g = fm.positions[p]?.gate
            return {
              name: p,
              m: a.byPosition[p]!,
              extra: g ? (
                <span
                  title={g.reason}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${g.enabled ? 'border-good/40 bg-good/10 text-good' : 'border-line bg-panel text-ink-2'}`}
                >
                  {g.enabled ? 'On' : 'Off: baseline used'}
                </span>
              ) : (
                '—'
              ),
            }
          })}
        />
        <ul className="text-ink-3 mt-4 grid gap-1 text-sm">
          {POSITIONS.filter((p) => fm.positions[p]).map((p) => (
            <li key={p}>
              <b className="text-ink-2">{p}:</b> {fm.positions[p]!.gate.reason}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={`Week by week, ${file.trainedThrough.season}`}
        sub="Mean absolute error per week, Sleeper → engine (lower is better). Each week was predicted by a model fitted only on earlier weeks. For positions marked Off, the engine number is the tested correction, not what the app uses."
      >
        {weeks.length === 0 ? (
          <EmptyState>No completed weeks this season yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">
                Mean absolute error by week and position, Sleeper vs engine
              </caption>
              <thead>
                <tr className="text-ink-3 border-line border-b">
                  <th scope="col" className="py-2.5 text-left font-semibold">
                    Week
                  </th>
                  {POSITIONS.map((p) => (
                    <th key={p} scope="col" className="py-2.5 text-right font-semibold">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w} className="border-line/60 border-b last:border-0">
                    <th scope="row" className="py-2.5 text-left font-bold">
                      {w}
                    </th>
                    {POSITIONS.map((p) => {
                      const b = a.byWeek.find((x) => x.week === w && x.pos === p)
                      return (
                        <td key={p} className="py-2.5 text-right tabular-nums">
                          {b ? (
                            <>
                              <span className="text-ink-3">{b.maeBaseline.toFixed(2)}</span> →{' '}
                              <b className={better(b.maeBaseline, b.maeModel)}>
                                {b.maeModel.toFixed(2)}
                              </b>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div>
        <Section
          title="By injury designation"
          sub="The designation on Sleeper's projection when it was made."
        >
          <MetricsTable
            label="Designation"
            rows={a.byInjury.map((b) => ({ name: b.status, m: b.metrics }))}
          />
        </Section>
        <Section
          title="By projection size"
          sub="Bigger projections miss by more points; the ranges widen to match."
        >
          <MetricsTable
            label="Projection"
            rows={a.bySize.map((b) => ({ name: b.label, m: b.metrics }))}
          />
        </Section>
      </div>

      <Section
        title="Model versions"
        sub="Each published build, so changes can be compared fairly."
      >
        <ul className="grid gap-2 text-sm">
          <li>
            <b>{file.version}</b> (current), trained through {file.trainedThrough.season} week{' '}
            {file.trainedThrough.week}, built {new Date(file.updated).toLocaleString()}
          </li>
          {file.history.map((h) => (
            <li key={h.updated} className="text-ink-2">
              {h.version}, through {h.trainedThrough.season} week {h.trainedThrough.week}: MAE{' '}
              {h.overall
                ? `${h.overall.maeModel.toFixed(2)} vs ${h.overall.maeBaseline.toFixed(2)}`
                : '—'}{' '}
              ({new Date(h.updated).toLocaleDateString()})
            </li>
          ))}
        </ul>
        <h3 className="mt-5 mb-2 font-bold">Method</h3>
        <ul className="text-ink-2 grid list-disc gap-1 pl-5 text-sm">
          {file.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>
            Scored in standard PPR for this report; your league applies the nearest format (
            {Object.keys(file.formats).join(', ')}) to its own scoring.
          </li>
          <li>
            Not yet measured: accuracy by weather (no historical game-time weather in the pipeline
            yet).
          </li>
        </ul>
      </Section>
    </>
  )
}

export default function Accuracy() {
  const username = useAppStore((s) => s.username)
  const q = useQuery({
    queryKey: ['projectionModel'],
    queryFn: getModelFile,
    staleTime: 30 * 60_000,
    retry: (n, e) => !(e instanceof ModelNotPublished) && n < 1,
  })
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
        <Target size={24} aria-hidden className="text-accent" /> Prediction Trust
      </h1>
      <p className="text-ink-2 mt-1 max-w-3xl">
        How well GamePlanBitz's predictions held up: the projection engine and Sleeper's own
        projections against what actually happened (past weeks, no look-ahead), win odds in your
        league, and how the lineup advice compared with the lineups you set.
      </p>
      {username && <LeagueGate>{(data) => <TrustPanel data={data} file={q.data ?? null} />}</LeagueGate>}
      <h2 className="mt-8 text-xl font-extrabold tracking-tight">Projection engine backtest</h2>
      {q.isPending ? (
        <div className="mt-5">
          <ListSkeleton rows={5} />
        </div>
      ) : q.isError ? (
        q.error instanceof ModelNotPublished ? (
          <div className="mt-5">
            <EmptyState>
              The projection model hasn't been published yet. It's built on every deploy; until then
              the app uses Sleeper's projections.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-5">
            <ErrorState
              title="Couldn't load the accuracy report"
              message={q.error.message}
              onRetry={() => void q.refetch()}
            />
          </div>
        )
      ) : (
        <Report file={q.data} />
      )}
    </div>
  )
}
