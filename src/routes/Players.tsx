import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PlayerRow, Proj, ProjNotice } from '../components/cards/shared'
import { LeagueGate } from '../components/LeagueGate'
import { Pill, PosTag } from '../components/ui/Pill'
import { Segmented } from '../components/ui/Segmented'
import { EmptyState } from '../components/ui/states'
import { f1 } from '../lib/format'
import type { Ready } from '../hooks/useLeagueData'
import { playerValue } from '../lib/scoring'

type Scope = 'mine' | 'league' | 'free'
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const
const LIMIT = 100

function PlayersList({ data }: { data: Ready }) {
  const { model } = data
  const [scope, setScope] = useState<Scope>('mine')
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>('ALL')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    let ids: string[]
    if (scope === 'mine') ids = model.myRoster()?.players ?? []
    else if (scope === 'league') ids = [...model.allRostered()]
    else ids = model.freeAgents().map((f) => f.id)
    const needle = q.trim().toLowerCase()
    return ids
      .map((id) => ({ id, pos: model.pos(id), pj: model.projPts(id), value: playerValue(model.ppg(id), model.projPts(id)) }))
      .filter((r) => (pos === 'ALL' || r.pos === pos) && (!needle || model.name(r.id).toLowerCase().includes(needle)))
      .sort((a, b) => b.value - a.value)
  }, [model, scope, pos, q])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight">Players</h1>
      <ProjNotice data={data} />
      <Segmented
        label="Player scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'mine', label: 'My roster' },
          { value: 'league', label: 'League' },
          { value: 'free', label: 'Free agents' },
        ]}
      />
      <div className="mb-3 flex gap-2.5">
        <div className="border-line bg-card flex min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3.5">
          <Search size={18} className="text-ink-3" aria-hidden />
          <label htmlFor="player-search" className="sr-only">
            Search players
          </label>
          <input
            id="player-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search players"
            className="min-w-0 flex-1 bg-transparent py-3 outline-none"
          />
        </div>
        <label htmlFor="pos-filter" className="sr-only">
          Position
        </label>
        <select id="pos-filter" value={pos} onChange={(e) => setPos(e.target.value as typeof pos)} className="border-line bg-card rounded-2xl border px-3 font-bold">
          {POSITIONS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="border-line bg-card rounded-3xl border px-4 py-1">
        {rows.length === 0 ? (
          <EmptyState>No players match.</EmptyState>
        ) : (
          rows.slice(0, LIMIT).map((r, i) => (
            <PlayerRow
              key={r.id}
              model={model}
              id={r.id}
              rank={i + 1}
              meta={
                <>
                  <PosTag pos={r.pos} />
                  <span>{model.team(r.id) || 'FA'}</span>
                  {model.injury(r.id) && <Pill tone="caution">{model.injury(r.id)}</Pill>}
                </>
              }
              right={<Proj value={f1(r.pj)} />}
            />
          ))
        )}
      </div>
      {rows.length > LIMIT && <p className="text-ink-3 mt-2 text-center text-sm">Showing the top {LIMIT} of {rows.length}. Narrow with search or a position.</p>}
    </div>
  )
}

export default function Players() {
  return <LeagueGate>{(data) => <PlayersList data={data} />}</LeagueGate>
}
