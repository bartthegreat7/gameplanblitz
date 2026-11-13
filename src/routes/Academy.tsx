import { ArrowRight, BookOpenCheck, CheckCircle2, GraduationCap, LineChart, Scale } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { CARD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { usePastWeeks } from '../hooks/usePastWeeks'
import { progress, type Decision } from '../lib/analytics/academy'
import { LESSONS } from '../lib/analytics/lessons'
import { f1 } from '../lib/format'

const DONE_KEY = 'gb-academy-lessons'
const readDone = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const VERDICT: Record<Decision['verdict'], { label: string; cls: string; lesson: string }> = {
  'process-miss': {
    label: 'Process miss',
    cls: 'bg-bad/15 text-bad',
    lesson: 'The projection favored the bench player and he outscored your starter. Default to the higher projection unless you have a specific reason.',
  },
  lucky: {
    label: 'Lucky outcome',
    cls: 'bg-amber/15 text-amber',
    lesson: 'The projection favored the bench player, but your starter scored more. It worked out; repeated, the same choice loses more often than it wins.',
  },
  unlucky: {
    label: 'Good process, bad luck',
    cls: 'bg-good/15 text-good',
    lesson: 'Your starter had the higher projection; the bench player happened to score more. Same call next time.',
  },
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-line/70 bg-card-2/60 rounded-xl border p-3">
      <div className="text-ink-2 text-xs font-semibold">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="text-ink-3 text-xs">{sub}</div>}
    </div>
  )
}

function AcademyView({ data }: { data: Ready }) {
  const m = data.model
  const { reviews, loading } = usePastWeeks(data)
  const p = progress(reviews)
  const [done, setDone] = useState<string[]>(readDone)
  const toggleDone = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id]
    setDone(next)
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <GraduationCap size={22} aria-hidden className="text-accent" /> Fantasy GM Academy
        </h1>
        <p className="text-ink-3 text-sm">
          Learn from the lineups you actually set. Every decision is judged on what was known before kickoff (that week&apos;s
          Sleeper projection, in your scoring), separately from how it turned out.
        </p>
      </div>

      <section aria-label="GM development" className={`${CARD} grid gap-3 p-4 sm:p-5`}>
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <LineChart size={20} aria-hidden className="text-accent" /> Your GM development
        </h2>
        {loading && !reviews.length ? (
          <ListSkeleton rows={2} />
        ) : !reviews.length ? (
          <EmptyState>Reviews start after your first completed week.</EmptyState>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Weeks reviewed" value={String(p.weeks)} />
              <Stat label="Weeks you started the best projected lineup" value={`${p.optimalWeeks} of ${p.weeks}`} sub="within half a point" />
              <Stat label="Projected points left on your bench" value={`${f1(p.avgProcessGap)} / wk`} sub="known before kickoff" />
              <Stat
                label="Trend"
                value={p.trend ? `${f1(p.trend.early)} → ${f1(p.trend.recent)}` : '—'}
                sub={p.trend ? (p.trend.recent < p.trend.early ? 'improving: fewer points left on the bench' : p.trend.recent > p.trend.early ? 'more points left on the bench lately' : 'steady') : 'needs 4+ weeks'}
              />
            </div>
            <p className="text-ink-2 text-sm">
              Decisions reviewed: <b>{p.counts['process-miss']}</b> process miss{p.counts['process-miss'] === 1 ? '' : 'es'},{' '}
              <b>{p.counts.lucky}</b> lucky outcome{p.counts.lucky === 1 ? '' : 's'}, <b>{p.counts.unlucky}</b> good call
              {p.counts.unlucky === 1 ? '' : 's'} that went badly.
              {p.focus.length > 0 && (
                <>
                  {' '}
                  Area to work on: <b>{p.focus[0].slot}</b> decisions ({p.focus[0].misses}).
                </>
              )}{' '}
              Lessons completed: <b>{done.filter((d) => LESSONS.some((l) => l.id === d)).length} of {LESSONS.length}</b>.
            </p>
          </>
        )}
      </section>

      <section aria-label="Weekly decision reviews" className={`${CARD} grid gap-3 p-4 sm:p-5`}>
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <Scale size={20} aria-hidden className="text-amber" /> Weekly decision reviews
        </h2>
        <Notice tone="ok">
          Projections are the ones Sleeper serves now for that week, in your league&apos;s scoring; they may differ slightly from
          what you saw before kickoff. Points are Sleeper&apos;s. A projection is a guide, not a guarantee.
        </Notice>
        {reviews.length === 0 ? (
          <EmptyState>No completed weeks with scores yet.</EmptyState>
        ) : (
          <ol className="grid gap-3">
            {reviews.map((r) => (
              <li key={r.week} className="border-line/70 bg-card-2/60 rounded-xl border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-extrabold">
                    Week {r.week}
                    {r.result && (
                      <span className={`ml-2 text-sm ${r.result === 'W' ? 'text-good' : r.result === 'L' ? 'text-bad' : 'text-ink-2'}`}>
                        {r.result === 'W' ? 'Win' : r.result === 'L' ? 'Loss' : 'Tie'}
                        {r.margin !== null && ` by ${f1(Math.abs(r.margin))}`}
                      </span>
                    )}
                  </h3>
                  <span className="text-ink-2 text-sm">
                    Before kickoff: your lineup projected <b>{f1(r.setProj)}</b>, the best possible <b>{f1(r.bestProj)}</b>
                    {r.processGap >= 0.5 ? <span className="text-amber"> ({f1(r.processGap)} left on the bench)</span> : <span className="text-good"> (optimal)</span>}
                  </span>
                </div>
                <p className="text-ink-3 mt-1 text-xs">
                  What happened: you scored {f1(r.setActual)}; the best lineup in hindsight would have scored {f1(r.bestActual)}. Hindsight
                  is not a fair standard; the process number above is.
                </p>
                {r.decisions.length > 0 && (
                  <ul className="mt-2 grid gap-2">
                    {r.decisions.map((d, i) => (
                      <li key={i} className="text-sm">
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${VERDICT[d.verdict].cls}`}>{VERDICT[d.verdict].label}</span>
                        <b>{d.slot}:</b> you started {m.name(d.started.id)} (projected {f1(d.started.proj)}, scored {f1(d.started.actual)}) over{' '}
                        {m.name(d.benched.id)} (projected {f1(d.benched.proj)}, scored {f1(d.benched.actual)}).
                        <span className="text-ink-2 block text-xs">{VERDICT[d.verdict].lesson}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Strategy lessons" className={`${CARD} grid gap-3 p-4 sm:p-5`}>
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <BookOpenCheck size={20} aria-hidden className="text-good" /> Strategy lessons
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {LESSONS.map((l) => {
            const complete = done.includes(l.id)
            return (
              <li key={l.id} className={`rounded-xl border p-4 ${complete ? 'border-good/50 bg-good/5' : 'border-line/70 bg-card-2/60'}`}>
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-extrabold">{l.title}</span>
                    {complete && <CheckCircle2 size={16} aria-label="Completed" className="text-good ml-1.5 inline align-text-bottom" />}
                    <span className="text-ink-2 block text-sm">{l.summary}</span>
                  </summary>
                  <ul className="text-ink-2 mt-2 grid list-disc gap-1 pl-5 text-sm">
                    {l.principles.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link to={l.practice.to} className="text-accent inline-flex items-center gap-1 text-sm font-bold hover:underline">
                      {l.practice.label} <ArrowRight size={14} aria-hidden />
                    </Link>
                    <button
                      type="button"
                      aria-pressed={complete}
                      onClick={() => toggleDone(l.id)}
                      className="border-line hover:bg-raised ml-auto min-h-9 rounded-lg border px-3 text-sm font-bold"
                    >
                      {complete ? 'Completed' : 'Mark as completed'}
                    </button>
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

export default function Academy() {
  return <LeagueGate>{(data) => <AcademyView data={data} />}</LeagueGate>
}
