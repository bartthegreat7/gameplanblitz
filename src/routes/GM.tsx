import { ArrowRight, Briefcase } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ProjNotice } from '../components/cards/shared'
import { WeeklyReport } from '../components/gm/WeeklyReport'
import { LeagueGate } from '../components/LeagueGate'
import { ConfidenceBadge } from '../components/ui/badges'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import type { Area, GmAction, Priority } from '../lib/analytics/gm'
import { f1 } from '../lib/format'

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  1: { label: 'Do now', cls: 'border-bad/40 bg-bad/10 text-bad' },
  2: { label: 'This week', cls: 'border-accent/40 bg-accent/10 text-accent' },
  3: { label: 'Consider', cls: 'border-line bg-panel text-ink-2' },
}

const TOOL: Record<Area, string> = {
  lineup: 'Lineup Optimizer',
  injury: 'Injury Center',
  weather: 'Lineup Optimizer',
  breakout: 'Breakout Radar',
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
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${p.cls}`}>
          {p.label}
        </span>
        <span className="text-ink-3 text-xs font-semibold tracking-wide uppercase">
          {TOOL[a.area]}
        </span>
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
        <Link
          to={a.to}
          className="text-accent inline-flex items-center gap-1 font-bold hover:underline"
        >
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
  const gm = useGmBrief(data)
  const { brief, pending, unavailable, seasonDone } = gm
  const s = brief.summary

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Briefcase size={22} aria-hidden className="text-accent" /> Fantasy GM
      </h1>
      <p className="text-ink-3 mb-4 text-sm">
        A <b>rules-based</b> weekly brief built from this app's own tools. No AI writes it, and it
        adds no numbers of its own. Each item names its source and confidence and links to the tool
        behind it.
      </p>
      <ProjNotice data={data} />

      <section aria-label="This week" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`Week ${s.week} opponent`} value={s.opponent ?? 'None posted'} />
        <Stat
          label="Projected score"
          value={
            s.myProj !== null && s.oppProj !== null ? `${f1(s.myProj)} – ${f1(s.oppProj)}` : '—'
          }
          model
        />
        <Stat label="Win odds" value={s.winPct !== null ? `${Math.round(s.winPct)}%` : '—'} model />
        <Stat
          label="Playoff odds"
          value={s.playoffPct !== null ? `${f1(s.playoffPct)}%` : seasonDone ? 'Season done' : '—'}
          model
        />
      </section>

      {pending.length > 0 && (
        <Notice tone="ok">Still checking: {pending.join(', ')}. More items may appear.</Notice>
      )}
      {unavailable.length > 0 && <Notice>Not included this time: {unavailable.join('; ')}.</Notice>}

      <section aria-label="Your action items">
        <h2 className="mb-3 text-lg font-extrabold">Action items</h2>
        {brief.actions.length === 0 ? (
          pending.length > 0 ? (
            <ListSkeleton rows={3} />
          ) : (
            <EmptyState>
              Nothing needs your attention right now: your lineup is set and no tool found a clear
              upgrade.
            </EmptyState>
          )
        ) : (
          <ol className="grid gap-3">
            {brief.actions.map((a, i) => (
              <ActionItem key={a.id} a={a} n={i + 1} />
            ))}
          </ol>
        )}
      </section>

      <WeeklyReport data={data} gm={gm} />

      <p className="text-ink-3 mt-5 text-xs">
        Order: fixes to facts (empty, bye or Out starters) first, then this week's projected
        upgrades and roster news, then longer-term ideas. Projections, odds and trade fits are model
        estimates, not guarantees.
      </p>
    </div>
  )
}

export default function GM() {
  return <LeagueGate>{(data) => <GMView data={data} />}</LeagueGate>
}
