import { useMemo, useState } from 'react'

import { ProjNotice } from '../components/cards/shared'
import { LeagueGate } from '../components/LeagueGate'
import { WaiverCard, WaiverDetail } from '../components/waivers/WaiverCard'
import { FreshnessBadge } from '../components/ui/badges'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Drawer } from '../components/ui/Overlay'
import { Pill, PosTag } from '../components/ui/Pill'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useLineupInputs } from '../hooks/useLineupInputs'
import { HORIZON_WEEKS, useWaiverInputs } from '../hooks/useWaiverInputs'
import { bidHistory, suggestBid } from '../lib/analytics/bids'
import { mostCommon } from '../lib/analytics/lineupAnalysis'
import { analyzeWaivers, UPGRADE_MIN_PER_WEEK, type WaiverCandidate } from '../lib/analytics/waivers'
import { f1, signed } from '../lib/format'
import { bids } from '../lib/insights'

const COLUMNS = (open: (c: WaiverCandidate) => void): Column<WaiverCandidate>[] => [
  {
    key: 'name',
    header: 'Player',
    cell: (c) => (
      <button type="button" onClick={() => open(c)} aria-label={`${c.name}, details`} className="text-left font-bold">
        {c.name}
      </button>
    ),
    sortValue: (c) => c.name,
  },
  { key: 'pos', header: 'Pos', cell: (c) => <PosTag pos={c.pos} />, sortValue: (c) => c.pos },
  { key: 'team', header: 'Team', cell: (c) => c.team || 'FA', hideBelow: 'sm' },
  { key: 'proj', header: 'This wk', cell: (c) => f1(c.proj[0]), sortValue: (c) => c.proj[0], align: 'right' },
  { key: 'net', header: 'Net gain', cell: (c) => signed(c.net), sortValue: (c) => c.net, align: 'right' },
  { key: 'signals', header: 'Signals', cell: (c) => <span className="flex flex-wrap gap-1">{c.signals.slice(0, 3).map((s) => <Pill key={s}>{s}</Pill>)}</span>, hideBelow: 'md' },
]

function WaiverView({ data }: { data: Ready }) {
  const { model, league, matchups, season, week } = data
  const lineup = useLineupInputs(season, week)
  const w = useWaiverInputs(season, week, league.league_id)
  const [selected, setSelected] = useState<WaiverCandidate | null>(null)

  const provider = useMemo(() => mostCommon(lineup.projectionRows.map((r) => r.company)), [lineup.projectionRows])
  const ready = w.horizon.length > 0 && w.horizon[0].proj.size > 0
  const report = useMemo(
    () =>
      ready
        ? analyzeWaivers({ model, league, horizon: w.horizon, weeks: lineup.weeks, schedule: lineup.schedule, trending: w.trending, provider })
        : null,
    [ready, model, league, w.horizon, lineup.weeks, lineup.schedule, w.trending, provider],
  )
  const faab = useMemo(() => bids(model, league, matchups), [model, league, matchups])
  const history = useMemo(() => (w.transactions.length ? bidHistory(w.transactions, model.pos) : null), [w.transactions, model])
  const bidFor = (c: WaiverCandidate) =>
    faab.usesFAAB ? suggestBid({ left: faab.left, gainPerWeek: c.gainPerWeek, pos: c.pos, history }) : null

  const upgrades = report?.candidates.filter((c) => c.kind === 'upgrade') ?? []
  const stashes = report?.candidates.filter((c) => c.kind === 'speculative') ?? []
  const columns = useMemo(() => COLUMNS(setSelected), [])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Waiver Wire Sniper</h1>
        <FreshnessBadge updatedAt={lineup.projectionsUpdatedAt} label="Projections fetched" />
      </div>
      <p className="text-ink-3 mb-4 text-sm">
        Free agents ranked by how much they improve your best lineup over the next {HORIZON_WEEKS} weeks, from Sleeper projections
        {provider ? ` (${provider})` : ''} in your league's scoring.
      </p>

      <ProjNotice data={data} />
      {report && report.missingWeeks.length > 0 && (
        <Notice>
          Sleeper hasn't published projections for week{report.missingWeeks.length > 1 ? 's' : ''} {report.missingWeeks.join(', ')}, so gains are averaged over the {report.activeWeeks} week{report.activeWeeks === 1 ? '' : 's'} that have them.
        </Notice>
      )}
      {w.horizonFailedWeeks.length > 0 && <Notice>Projections for week{w.horizonFailedWeeks.length > 1 ? 's' : ''} {w.horizonFailedWeeks.join(', ')} couldn't be loaded; those weeks count as zero.</Notice>}
      {lineup.historyLoading && <Notice>Loading game history ({lineup.weeks.length} of {lineup.totalWeeks} weeks)… usage and form signals appear when it finishes.</Notice>}
      {lineup.historyFailed && <Notice>Game history couldn't be loaded, so usage, form and range signals are hidden.</Notice>}
      {lineup.scheduleFailed && <Notice>The NFL schedule couldn't be loaded, so byes and locked games aren't detected. Double-check them in Sleeper.</Notice>}
      {w.trendingFailed && <Notice>Sleeper's trending data couldn't be loaded, so the "trending" signal is hidden.</Notice>}
      {faab.usesFAAB && w.transactionsFailed && <Notice>Your league's past waiver bids couldn't be loaded, so FAAB guidance uses a rule of thumb instead of what has been winning.</Notice>}

      {!ready ? (
        w.horizonLoading ? (
          <ListSkeleton rows={5} />
        ) : (
          <EmptyState>Sleeper hasn't published Week {week} projections yet, so free agents can't be valued. Check back closer to kickoff.</EmptyState>
        )
      ) : (
        report && (
          <>
            <div className="border-line bg-card mb-4 grid gap-1 rounded-2xl border p-4 text-sm">
              <div>
                <b>Roster:</b> {report.rosterCount} of {report.rosterLimit} spots used.{' '}
                {report.rosterFull ? <span className="text-amber font-semibold">Full: every add needs a drop.</span> : <span className="text-good font-semibold">Open spot: you can add without dropping.</span>}
              </div>
              <div>
                <b>Claims:</b>{' '}
                {faab.usesFAAB
                  ? `FAAB, $${faab.left} of $${faab.budget} left (${history?.all ? `${history.all.n} winning bids seen this season` : 'no bid history available'}).`
                  : 'Priority-based waivers: claims are resolved by waiver order, there are no bids.'}
              </div>
              {report.needs.map((n, i) => (
                <div key={i} className="text-amber">
                  ⚠ {n.text}
                </div>
              ))}
            </div>

            <h2 className="mb-1 text-lg font-extrabold">Recommended adds</h2>
            <p className="text-ink-3 mb-3 text-sm">
              Each add is valued on its own against your current roster. If you make more than one move, re-check the rest, since several may suggest dropping the same player.
            </p>
            {upgrades.length === 0 ? (
              <Notice tone="ok">No free agent improves your best lineup by {UPGRADE_MIN_PER_WEEK}+ point a week right now. Your roster is already the strongest available.</Notice>
            ) : (
              <ul className="grid gap-3">
                {upgrades.slice(0, 8).map((c) => (
                  <WaiverCard key={c.id} c={c} model={model} bid={bidFor(c)} />
                ))}
              </ul>
            )}

            {stashes.length > 0 && (
              <>
                <h2 className="mt-8 mb-1 text-lg font-extrabold">Speculative stashes</h2>
                <p className="text-ink-3 mb-3 text-sm">Won't help your lineup this week, but have {2}+ positive opportunity signals. Only worth a bench spot you don't need.</p>
                <ul className="grid gap-3">
                  {stashes.slice(0, 5).map((c) => (
                    <WaiverCard key={c.id} c={c} model={model} bid={bidFor(c)} />
                  ))}
                </ul>
              </>
            )}

            <h2 className="mt-8 mb-3 text-lg font-extrabold">All evaluated free agents</h2>
            <div className="border-line bg-card rounded-3xl border p-4">
              <DataTable
                rows={report.candidates}
                columns={columns}
                rowKey={(c) => c.id}
                caption="Evaluated free agents"
                searchText={(c) => `${c.name} ${c.pos} ${c.team}`}
                initialSort={{ key: 'net', dir: 'desc' }}
              />
            </div>
            <p className="text-ink-3 mt-2 text-xs">The {report.candidates.length} free agents with the most projected points over the horizon are evaluated.</p>
          </>
        )
      )}

      <details className="border-line bg-card mt-6 rounded-2xl border p-4 text-sm">
        <summary className="cursor-pointer font-bold">How these numbers are made</summary>
        <ul className="text-ink-2 mt-3 list-disc space-y-1.5 pl-5">
          <li><b>Net gain:</b> for each week, your best lineup with the player added (and the best drop removed) minus your best lineup today, using Sleeper's projection for that week and an exact lineup optimizer. Players who are Out count as zero that week; IR/PUP/suspended players count as zero throughout.</li>
          <li><b>Drop:</b> the droppable player whose loss costs you least. Keepers, IR/taxi players and players whose game has started are never suggested. With an open roster spot no drop is suggested.</li>
          <li><b>This week:</b> counts only if neither the player added nor the player dropped has already played.</li>
          <li><b>Signals</b> (snap share, scoring form, depth chart, Sleeper-wide trending) are shown as context. Only snap share and form come from this season's game logs; depth charts are Sleeper's and may lag, and WR depth charts are not used because Sleeper splits them by alignment. Signals do not change the ranking, except to qualify a low-projection player as a speculative stash.</li>
          <li><b>FAAB:</b> when your league's past waiver bids load, the suggestion uses what actually won (median to 75th percentile, higher for priority adds). Otherwise a labeled rule of thumb. Neither predicts what rivals will bid.</li>
          <li><b>Confidence</b> uses the same fixed rubric as the Lineup Optimizer.</li>
        </ul>
      </details>

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title={selected?.name ?? 'Player'}>
        {selected && <WaiverDetail c={selected} bid={bidFor(selected)} />}
      </Drawer>
    </div>
  )
}

export default function Waivers() {
  return <LeagueGate>{(data) => <WaiverView data={data} />}</LeagueGate>
}
