import { useId, useMemo, useState } from 'react'

import { lineupIdsOf } from '../../lib/analytics/lineupValue'
import type { PickAsset } from '../../lib/analytics/picks'
import { evaluateTrade, type TradeInput } from '../../lib/analytics/trades'
import type { Model } from '../../lib/model'
import { PosTag } from '../ui/Pill'
import { EmptyState, ErrorState } from '../ui/states'
import { TradeBody } from './TradeBody'

const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])

function Checklist({
  legend,
  model,
  players,
  picks,
  values,
  selected,
  selectedPicks,
  onPlayer,
  onPick,
}: {
  legend: string
  model: Model
  players: string[]
  picks: PickAsset[]
  values: Map<string, number>
  selected: string[]
  selectedPicks: string[]
  onPlayer: (id: string) => void
  onPick: (key: string) => void
}) {
  const sorted = [...players].sort((a, b) => (values.get(b) ?? 0) - (values.get(a) ?? 0))
  return (
    <fieldset className="border-line bg-card min-w-0 rounded-2xl border p-3">
      <legend className="px-1 text-sm font-extrabold">{legend}</legend>
      <ul className="max-h-80 overflow-y-auto">
        {sorted.map((id) => (
          <li key={id}>
            <label className="hover:bg-panel flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm">
              <input type="checkbox" checked={selected.includes(id)} onChange={() => onPlayer(id)} className="accent-[var(--accent)]" />
              <PosTag pos={model.pos(id)} />
              <span className="min-w-0 flex-1 truncate font-semibold">{model.shortName(id)}</span>
              <span className="text-ink-3 text-xs">{values.has(id) ? Math.round(values.get(id)!).toLocaleString() : '—'}</span>
            </label>
          </li>
        ))}
        {picks.map((p) => (
          <li key={p.key}>
            <label className="hover:bg-panel flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm">
              <input type="checkbox" checked={selectedPicks.includes(p.key)} onChange={() => onPick(p.key)} className="accent-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.label}</span>
              <span className="text-ink-3 text-xs">{p.value !== null ? Math.round(p.value).toLocaleString() : '—'}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

/** Build any trade with any team and see both sides of it. */
export function Analyzer({ input }: { input: TradeInput }) {
  const m = input.model
  const others = m.rosters.filter((r) => r.roster_id !== m.myRosterId)
  const [team, setTeam] = useState<number>(others[0]?.roster_id ?? 0)
  const [give, setGive] = useState<string[]>([])
  const [get, setGet] = useState<string[]>([])
  const [givePicks, setGivePicks] = useState<string[]>([])
  const [getPicks, setGetPicks] = useState<string[]>([])
  const selectId = useId()

  const myPicks = useMemo(() => input.picks.get(m.myRosterId) ?? [], [input.picks, m.myRosterId])
  const theirPicks = useMemo(() => input.picks.get(team) ?? [], [input.picks, team])

  const result = useMemo(() => {
    if (give.length + get.length + givePicks.length + getPicks.length === 0) return null
    try {
      return {
        e: evaluateTrade(
          input,
          team,
          { players: give, picks: myPicks.filter((p) => givePicks.includes(p.key)) },
          { players: get, picks: theirPicks.filter((p) => getPicks.includes(p.key)) },
        ),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'This trade could not be evaluated.' }
    }
  }, [input, team, give, get, givePicks, getPicks, myPicks, theirPicks])

  if (others.length === 0) return <EmptyState>There are no other teams to trade with.</EmptyState>

  return (
    <div>
      <label htmlFor={selectId} className="mb-1 block text-sm font-bold">
        Trade with
      </label>
      <select
        id={selectId}
        value={team}
        onChange={(ev) => {
          setTeam(Number(ev.target.value))
          setGet([])
          setGetPicks([])
        }}
        className="border-line bg-card mb-3 w-full rounded-2xl border px-4 py-3 font-bold"
      >
        {others.map((r) => (
          <option key={r.roster_id} value={r.roster_id}>
            {m.teamName(r.roster_id)}
          </option>
        ))}
      </select>

      <div className="grid gap-3 sm:grid-cols-2">
        <Checklist
          legend="You give"
          model={m}
          players={lineupIdsOf(m.myRoster())}
          picks={myPicks}
          values={input.values}
          selected={give}
          selectedPicks={givePicks}
          onPlayer={(id) => setGive((l) => toggle(l, id))}
          onPick={(k) => setGivePicks((l) => toggle(l, k))}
        />
        <Checklist
          legend="You get"
          model={m}
          players={lineupIdsOf(m.rosterById(team))}
          picks={theirPicks}
          values={input.values}
          selected={get}
          selectedPicks={getPicks}
          onPlayer={(id) => setGet((l) => toggle(l, id))}
          onPick={(k) => setGetPicks((l) => toggle(l, k))}
        />
      </div>

      <section aria-label="Trade evaluation" aria-live="polite" className="mt-4">
        {!result ? (
          <EmptyState>Pick players{myPicks.length + theirPicks.length ? ' or picks' : ''} on either side to see how the trade affects both teams.</EmptyState>
        ) : 'error' in result ? (
          <ErrorState title="Can't evaluate this trade" message={result.error} />
        ) : (
          <div className="border-line bg-card rounded-2xl border p-4">
            <TradeBody model={m} e={result.e!} values={input.values} />
          </div>
        )}
      </section>
    </div>
  )
}
