import { useMemo, useState } from 'react'

import { ProjNotice } from '../components/cards/shared'
import { LeagueGate } from '../components/LeagueGate'
import { PlayerInsight, StatusPills } from '../components/lineup/PlayerInsight'
import { SlotRow } from '../components/lineup/SlotRow'
import { FreshnessBadge } from '../components/ui/badges'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Drawer } from '../components/ui/Overlay'
import { PosTag } from '../components/ui/Pill'
import { Segmented } from '../components/ui/Segmented'
import { EmptyState, Notice } from '../components/ui/states'
import { WeatherIndicator } from '../components/weather/WeatherIndicator'
import { useLineupInputs } from '../hooks/useLineupInputs'
import type { Ready } from '../hooks/useLeagueData'
import { analyzeLineup } from '../lib/analytics/lineupAnalysis'
import { CONFIDENCE_RUBRIC } from '../lib/evidence'
import { f1, signed } from '../lib/format'
import type { Candidate, RiskMode, Totals } from '../lib/analytics/lineupPlan'

const MODES: { value: RiskMode; label: string }[] = [
  { value: 'projection', label: 'Best projection' },
  { value: 'floor', label: 'Safest (floor)' },
  { value: 'ceiling', label: 'Most upside' },
]

function Tile({ title, t, accent }: { title: string; t: Totals; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-accent/40 bg-accent/8' : 'border-line bg-card'}`}>
      <div className="text-ink-3 text-xs font-bold tracking-wide uppercase">{title}</div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight">{f1(t.proj)}</div>
      <div className="text-ink-3 text-xs">
        {t.floor !== null && t.ceiling !== null ? `Range ${f1(t.floor)}–${f1(t.ceiling)}` : 'Range unavailable'}
      </div>
    </div>
  )
}

const COLUMNS: Column<Candidate>[] = [
  { key: 'name', header: 'Player', cell: (c) => <span className="font-bold">{c.name}</span>, sortValue: (c) => c.name },
  { key: 'pos', header: 'Pos', cell: (c) => <PosTag pos={c.pos} />, sortValue: (c) => c.pos },
  {
    key: 'opp',
    header: 'Opp',
    cell: (c) => (
      <span className="inline-flex items-center gap-1.5">
        {c.opponent ?? (c.bye ? 'BYE' : '—')}
        {!c.bye && <WeatherIndicator team={c.team} />}
      </span>
    ),
    hideBelow: 'sm',
  },
  { key: 'proj', header: 'Proj', cell: (c) => f1(c.proj), sortValue: (c) => c.proj, align: 'right' },
  { key: 'floor', header: 'Floor', cell: (c) => (c.floor !== null ? f1(c.floor) : '—'), sortValue: (c) => c.floor ?? -1, align: 'right', hideBelow: 'sm' },
  { key: 'ceil', header: 'Ceiling', cell: (c) => (c.ceiling !== null ? f1(c.ceiling) : '—'), sortValue: (c) => c.ceiling ?? -1, align: 'right', hideBelow: 'sm' },
  {
    key: 'usage',
    header: 'Snaps',
    cell: (c) => (c.usage ? `${Math.round(c.usage.recent * 100)}% ${c.usage.label}` : '—'),
    hideBelow: 'md',
  },
  { key: 'status', header: 'Status', cell: (c) => <span className="flex flex-wrap gap-1"><StatusPills c={c} /></span> },
]

function LineupView({ data }: { data: Ready }) {
  const { model, matchups, week, season } = data
  const inputs = useLineupInputs(season, week)
  const [mode, setMode] = useState<RiskMode>('projection')
  const [selected, setSelected] = useState<Candidate | null>(null)

  const analysis = useMemo(
    () =>
      analyzeLineup({
        model,
        matchups,
        projectionRows: inputs.projectionRows,
        weeks: inputs.weeks,
        schedule: inputs.schedule,
        week,
        mode,
      }),
    [model, matchups, inputs.projectionRows, inputs.weeks, inputs.schedule, week, mode],
  )

  if (!analysis)
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-3 text-2xl font-extrabold tracking-tight">Lineup Optimizer</h1>
        <EmptyState>No Week {week} matchup is posted for your team yet. Check back once Sleeper sets the schedule.</EmptyState>
      </div>
    )

  const { plan, candidates, provider } = analysis
  const gain = plan.recommended.proj - plan.current.proj
  const changes = plan.start.length // new starters; position reshuffles are not extra swaps
  const unchanged = plan.slots.every((s) => !s.changed)
  const domainMax = Math.max(1, ...candidates.map((c) => c.ceiling ?? c.proj))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Lineup Optimizer</h1>
        <FreshnessBadge updatedAt={inputs.projectionsUpdatedAt} label="Projections fetched" />
      </div>
      <p className="text-ink-3 mb-4 text-sm">
        Week {week} · projections from Sleeper{provider ? ` (${provider})` : ''} in your league's scoring.
      </p>

      <ProjNotice data={data} />
      {inputs.historyLoading && (
        <Notice>
          Loading game history ({inputs.weeks.length} of {inputs.totalWeeks} weeks)… ranges and usage trends appear when it finishes.
        </Notice>
      )}
      {inputs.historyFailed && <Notice>Game history couldn't be loaded, so floors, ceilings and usage trends are hidden. Projections still drive the plan.</Notice>}
      {inputs.historyPartial && <Notice>Game history is incomplete ({inputs.weeks.length} of {inputs.totalWeeks} weeks), so volatility estimates are less reliable.</Notice>}
      {inputs.scheduleFailed && <Notice>The NFL schedule couldn't be loaded, so bye weeks and locked games aren't detected. Double-check them in Sleeper.</Notice>}

      <Segmented label="Optimize for" value={mode} onChange={setMode} options={MODES} />

      <div className="grid grid-cols-3 gap-2.5">
        <Tile title="Current" t={plan.current} />
        <Tile title="Recommended" t={plan.recommended} accent />
        <div className="border-line bg-card rounded-2xl border p-4">
          <div className="text-ink-3 text-xs font-bold tracking-wide uppercase">Change</div>
          <div className={`mt-1 text-3xl font-extrabold tracking-tight ${gain > 0.05 ? 'text-good' : ''}`}>{signed(gain)}</div>
          <div className="text-ink-3 text-xs">{changes} swap{changes === 1 ? '' : 's'}</div>
        </div>
      </div>
      <p className="text-ink-3 mt-2 text-xs">
        Current counts players who are Out or on a bye as 0. Ranges assume players' scores are independent (a model, not a guarantee).
      </p>

      {unchanged ? (
        <div className="mt-4">
          <Notice tone="ok">Your lineup is already the best available under this setting. Nothing to change.</Notice>
        </div>
      ) : (
        <p className="border-line bg-card mt-4 rounded-2xl border p-3.5 text-sm">
          {plan.start.length > 0 && (
            <>
              <b className="text-good">Start</b> {plan.start.map((c) => c.name).join(', ')}
            </>
          )}
          {plan.start.length > 0 && plan.sit.length > 0 && <span className="text-ink-3"> · </span>}
          {plan.sit.length > 0 && (
            <>
              <b className="text-amber">Bench</b> {plan.sit.map((c) => c.name).join(', ')}
            </>
          )}
        </p>
      )}

      <h2 className="mt-6 mb-3 text-lg font-extrabold">Slot by slot</h2>
      <ul className="grid gap-3">
        {plan.slots.map((s, i) => (
          <SlotRow key={`${s.slot}-${i}`} slot={s} domainMax={domainMax} onSelect={setSelected} />
        ))}
      </ul>

      <h2 className="mt-8 mb-3 text-lg font-extrabold">Your players</h2>
      <div className="border-line bg-card rounded-3xl border p-4">
        <DataTable
          rows={candidates}
          columns={COLUMNS}
          rowKey={(c) => c.id}
          caption="Your players with projections and ranges"
          searchText={(c) => `${c.name} ${c.pos} ${c.team}`}
          initialSort={{ key: 'proj', dir: 'desc' }}
        />
      </div>

      <details className="border-line bg-card mt-6 rounded-2xl border p-4 text-sm">
        <summary className="cursor-pointer font-bold">How these numbers are made</summary>
        <ul className="text-ink-2 mt-3 list-disc space-y-1.5 pl-5">
          <li><b>Projection:</b> Sleeper's weekly projection, scored with your league's settings. We do not adjust it.</li>
          <li><b>Floor / ceiling:</b> Sleeper provides no ranges. We estimate ≈10th/90th percentile as projection ± 1.28 × the player's week-to-week standard deviation this season, blended toward his position's average (3 games' worth) so small samples don't mislead. Hidden when there is no game history.</li>
          <li><b>Matchup context:</b> points each defense has allowed to the position this season. Shown for reference only. Sleeper's projection may already account for it, so it is never added.</li>
          <li><b>Optimizer:</b> an exact best assignment of players to your slots (not greedy), skipping players who are Out or on a bye and never moving players whose games have started. Equal-value ties keep your current slots.</li>
          <li><b>Confidence</b> comes from a fixed rubric:
            <ul className="mt-1 list-[circle] space-y-0.5 pl-5">
              {CONFIDENCE_RUBRIC.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </li>
        </ul>
      </details>

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Player">
        {selected && <PlayerInsight c={selected} model={model} provider={provider} />}
      </Drawer>
    </div>
  )
}

export default function Lineup() {
  return <LeagueGate>{(data) => <LineupView data={data} />}</LeagueGate>
}
