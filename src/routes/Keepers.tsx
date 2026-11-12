import { useId, useMemo, useState } from 'react'

import { LeagueGate } from '../components/LeagueGate'
import { EvidenceList } from '../components/ui/badges'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Drawer } from '../components/ui/Overlay'
import { Pill, PosTag } from '../components/ui/Pill'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useKeeperInputs } from '../hooks/useKeeperInputs'
import { defaultRules, draftRounds, evaluateKeepers, yearsKept, type KeeperCandidate, type KeeperRules } from '../lib/analytics/keepers'
import { f1, ordinal } from '../lib/format'
import { useAppStore } from '../store/app'

function RulesForm({ rules, onChange, onReset, maxRound }: { rules: KeeperRules; onChange: (r: KeeperRules) => void; onReset: () => void; maxRound: number }) {
  const id = useId()
  const input = 'border-line bg-card w-full rounded-xl border px-3 py-2.5 text-sm'
  const num = (key: keyof KeeperRules, label: string, min: number, max: number, hint?: string) => (
    <label htmlFor={`${id}-${key}`} className="flex flex-col gap-1 text-xs font-bold">
      {label}
      <input
        id={`${id}-${key}`}
        type="number"
        min={min}
        max={max}
        value={rules[key] as number}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value))
          if (Number.isFinite(v)) onChange({ ...rules, [key]: Math.min(max, Math.max(min, v)) })
        }}
        className={input}
      />
      {hint && <span className="text-ink-3 font-normal">{hint}</span>}
    </label>
  )
  return (
    <section aria-label="Keeper rules" className="border-line bg-card rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">Your league's keeper rules</h2>
        <button type="button" onClick={onReset} className="text-accent text-sm font-bold">
          Reset to defaults
        </button>
      </div>
      <p className="text-ink-3 mb-3 text-sm">Sleeper doesn't store keeper costs, so set them here. Saved in this browser for this league.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {num('maxKeepers', 'Keepers allowed', 1, 10)}
        <label htmlFor={`${id}-mode`} className="flex flex-col gap-1 text-xs font-bold">
          Keeper cost
          <select id={`${id}-mode`} value={rules.costMode} onChange={(e) => onChange({ ...rules, costMode: e.target.value as KeeperRules['costMode'] })} className={input}>
            <option value="draft-round">Round drafted</option>
            <option value="none">No cost</option>
          </select>
        </label>
        {num('roundPenalty', 'Rounds earlier per year kept', 0, 5)}
        {num('undraftedRound', 'Round for undrafted players', 1, maxRound)}
        {num('maxYears', 'Max years kept', 0, 10, '0 = no limit')}
      </div>
    </section>
  )
}

const COLUMNS = (open: (c: KeeperCandidate) => void): Column<KeeperCandidate>[] => [
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
  { key: 'drafted', header: 'Drafted', cell: (c) => (c.draftedRound !== null ? `Rd ${c.draftedRound}` : 'Undrafted'), sortValue: (c) => c.draftedRound ?? 99, hideBelow: 'sm' },
  { key: 'kept', header: 'Kept', cell: (c) => (c.yearsKept ? `${c.yearsKept} yr` : '—'), sortValue: (c) => c.yearsKept, hideBelow: 'md' },
  { key: 'cost', header: 'Cost', cell: (c) => (c.cost.round !== null ? `Rd ${c.cost.round}` : 'Free'), sortValue: (c) => c.cost.round ?? 0, align: 'right' },
  { key: 'market', header: 'Market', cell: (c) => (c.marketRound !== null ? `Rd ${c.marketRound}` : '—'), sortValue: (c) => c.marketRound ?? 99, align: 'right' },
  {
    key: 'surplus',
    header: 'Saving',
    cell: (c) => (c.surplus === null ? '—' : <span className={c.surplus > 0 ? 'text-good font-bold' : c.surplus < 0 ? 'text-amber' : ''}>{c.surplus > 0 ? `+${c.surplus}` : c.surplus} rd</span>),
    sortValue: (c) => c.surplus ?? -99,
    align: 'right',
  },
  { key: 'ppg', header: 'PPG', cell: (c) => (c.ppg !== null ? f1(c.ppg) : '—'), sortValue: (c) => c.ppg ?? -1, align: 'right', hideBelow: 'md' },
  {
    key: 'status',
    header: 'Status',
    cell: (c) => (c.recommended ? <Pill tone="prio">Keep</Pill> : !c.eligible ? <Pill tone="caution">Ineligible</Pill> : null),
  },
]

function KeepersView({ data }: { data: Ready }) {
  const { model: m, league } = data
  const k = useKeeperInputs(league, m.rosters.length)
  const stored = useAppStore((s) => s.keeperRules[league.league_id])
  const setRules = useAppStore((s) => s.setKeeperRules)
  const defaults = useMemo(() => defaultRules({ maxKeepers: league.settings.max_keepers, draftRounds: league.settings.draft_rounds }), [league])
  const rules = stored ?? defaults
  const [open, setOpen] = useState<KeeperCandidate | null>(null)
  const teams = league.settings.num_teams || m.rosters.length

  const dynasty = k.dynasty
  const thisDraft = k.history?.current ?? null
  const draftSeasons = k.history?.seasons ?? null
  const historyLoading = k.historyLoading
  const candidates = useMemo(() => {
    if (!dynasty || historyLoading) return null
    const rounds = draftRounds(thisDraft ?? [])
    const seasons = draftSeasons ?? []
    const ids = (m.myRoster()?.players ?? []).filter((id) => m.pos(id) !== 'DEF')
    return evaluateKeepers(
      ids.map((id) => ({
        id,
        name: m.name(id),
        pos: m.pos(id),
        draftedRound: rounds.get(id) ?? null,
        yearsKept: yearsKept(seasons, id),
        dynastyRank: dynasty.get(id)?.rank ?? null,
        dynastyValue: dynasty.get(id)?.value ?? null,
        ppg: m.ppg(id),
      })),
      rules,
      teams,
    )
  }, [dynasty, historyLoading, thisDraft, draftSeasons, m, rules, teams])

  const columns = useMemo(() => COLUMNS(setOpen), [])
  const keep = candidates?.filter((c) => c.recommended) ?? []

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Keeper Intelligence</h1>
      <p className="text-ink-3 mb-4 text-sm">
        What each of your players would cost to keep under your rules, against where the market would draft him: FantasyCalc's long-term (dynasty) board mapped to rounds of a {teams}-team draft.
      </p>

      {league.settings.type === 0 && <Notice>Sleeper reports this as a redraft league. The analysis still works with the rules you set below.</Notice>}
      {k.historyFailed && <Notice>Your league's draft history couldn't be loaded, so every player is treated as undrafted and never kept.</Notice>}
      {!k.historyLoading && !k.historyFailed && !k.history?.current && <Notice>No Sleeper draft is linked to this league, so every player is treated as undrafted.</Notice>}
      {!!k.history?.gaps && <Notice>Some previous seasons couldn't be read, so "years kept" may be undercounted.</Notice>}
      {k.valuesFailed && <Notice>FantasyCalc values couldn't be loaded, so market rounds and savings are unavailable.</Notice>}

      <RulesForm rules={rules} onChange={(r) => setRules(league.league_id, r)} onReset={() => setRules(league.league_id, null)} maxRound={Math.max(1, league.settings.draft_rounds ?? 20)} />

      {!candidates ? (
        k.valuesFailed ? (
          <EmptyState>Market values are needed to compare keepers.</EmptyState>
        ) : (
          <div className="mt-4">
            <ListSkeleton rows={4} />
          </div>
        )
      ) : (
        <>
          <section aria-label="Recommended keepers" className="border-line bg-card mt-4 rounded-2xl border p-4">
            <h2 className="mb-2 text-lg font-extrabold">
              Recommended keepers ({keep.length} of {rules.maxKeepers})
            </h2>
            {keep.length === 0 ? (
              <p className="text-ink-2 text-sm">No eligible player costs less than his market value under these rules.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {keep.map((c) => (
                  <li key={c.id} className="border-accent/40 bg-panel rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <PosTag pos={c.pos} />
                      <span className="font-extrabold">{c.name}</span>
                    </div>
                    <div className="text-ink-2 text-sm">
                      {c.cost.round !== null ? `Costs a ${ordinal(c.cost.round)}` : 'Free to keep'}
                      {c.marketRound !== null && `; market: ${ordinal(c.marketRound)} round`}
                      {c.surplus !== null && c.surplus > 0 && <b className="text-good"> · saves {c.surplus} round{c.surplus === 1 ? '' : 's'}</b>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-ink-3 mt-2 text-xs">A ranking of value under your rules, not a guarantee: market rounds are estimated from FantasyCalc's dynasty board, and your league's draft may differ.</p>
          </section>

          <section aria-label="All players" className="border-line bg-card mt-4 rounded-2xl border p-4">
            <h2 className="mb-2 text-lg font-extrabold">Your players</h2>
            <DataTable rows={candidates} columns={columns} rowKey={(c) => c.id} caption="Keeper cost and value by player" searchText={(c) => `${c.name} ${c.pos}`} />
          </section>
        </>
      )}

      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open?.name ?? 'Player'}>
        {open && (
          <div className="grid gap-3">
            <ul className="text-ink-2 list-disc space-y-1 pl-5 text-sm">
              {open.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <EvidenceList items={open.evidence} />
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default function Keepers() {
  return <LeagueGate>{(data) => <KeepersView data={data} />}</LeagueGate>
}
