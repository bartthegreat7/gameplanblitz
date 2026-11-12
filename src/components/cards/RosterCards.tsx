import { BarChart3, DollarSign, Users } from 'lucide-react'
import { useState } from 'react'

import { f1, ordinal, trunc } from '../../lib/format'
import { rosterRows, standings, valueRows } from '../../lib/insights'
import { PlayerQuickView } from '../PlayerQuickView'
import { Card } from '../ui/Card'
import { Pill, PosTag } from '../ui/Pill'
import { Drawer } from '../ui/Overlay'
import { WeatherIndicator } from '../weather/WeatherIndicator'
import { EmptyState } from '../ui/states'
import { PlayerRow, Proj, ProjNotice, type CardProps } from './shared'

export function StandingsCard({ data }: CardProps) {
  const { model, league } = data
  const rows = standings(model)
  const playoffN = league.settings.playoff_teams || 6
  return (
    <Card id="standings" title="Standings" context={`${rows.length} teams`} icon={BarChart3} tone="blue">
      {rows.length === 0 ? (
        <EmptyState>No teams in this league yet.</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[15px]">
              <caption className="sr-only">League standings</caption>
              <thead>
                <tr className="text-ink-3 border-line border-b text-xs">
                  <th scope="col" className="px-1.5 py-2 text-left font-bold">Team</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-bold">W-L</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-bold">PF</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-bold">PA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.rosterId}
                    aria-current={r.me ? 'true' : undefined}
                    className={`${r.me ? 'text-accent' : ''} ${i === playoffN - 1 ? 'border-accent/30 border-b-2 border-dashed' : 'border-line/50 border-b'}`}
                  >
                    <td className="px-1.5 py-2.5 text-left font-semibold">
                      <span className="text-ink-3 mr-1 inline-block w-5 font-extrabold">{i + 1}</span>
                      {trunc(model.teamName(r.rosterId))}
                    </td>
                    <td className="px-1.5 py-2.5 text-right">
                      {r.w}-{r.l}
                      {r.t ? `-${r.t}` : ''}
                    </td>
                    <td className="px-1.5 py-2.5 text-right">{f1(r.pf)}</td>
                    <td className="px-1.5 py-2.5 text-right">{f1(r.pa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-good/25 bg-good/6 text-ink-2 mt-3.5 rounded-xl border px-3.5 py-3 text-sm">
            Dashed line marks the {ordinal(playoffN)} and final playoff spot.
          </p>
        </>
      )}
    </Card>
  )
}

export function RosterCard({ data }: CardProps) {
  const { model, matchups } = data
  const rows = rosterRows(model, matchups)
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <Card id="roster" title="My Roster" context={`${rows.length} players`} icon={Users}>
      <ProjNotice data={data} />
      {rows.length === 0 ? (
        <EmptyState>No players on this roster.</EmptyState>
      ) : (
        rows.map((p) => (
          <PlayerRow
            key={p.id}
            model={model}
            id={p.id}
            onSelect={setSelected}
            badge={p.starter ? <Pill tone="prio">START</Pill> : undefined}
            meta={
              <>
                <PosTag pos={p.pos} />
                <span>{model.team(p.id) || 'FA'}</span>
                {model.injury(p.id) && <Pill tone="caution">{model.injury(p.id)}</Pill>}
              </>
            }
            right={<Proj value={f1(p.pj)} />}
            after={<WeatherIndicator team={model.team(p.id)} />}
          />
        ))
      )}
      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Player">
        {selected && <PlayerQuickView model={model} id={selected} />}
      </Drawer>
    </Card>
  )
}

export function PlayerValueCard({ data }: CardProps) {
  const { model } = data
  const rows = valueRows(model)
  return (
    <Card id="value" title="Player Value" context="Your roster, ranked" icon={DollarSign} tone="gold">
      <ProjNotice data={data} />
      {rows.length === 0 ? (
        <EmptyState>No players on this roster.</EmptyState>
      ) : (
        <>
          <p className="text-ink-2 mb-3.5">
            Blends this season's points per game with this week's projection, in your league's scoring — so a hot streak or soft week moves the number.
          </p>
          {rows.map((p, i) => (
            <PlayerRow
              key={p.id}
              model={model}
              id={p.id}
              rank={i + 1}
              meta={
                <>
                  <PosTag pos={p.pos} />
                  {p.ppg != null && <span>{f1(p.ppg)} PPG</span>}
                  <span>{f1(p.pj)} proj</span>
                </>
              }
              right={
                <>
                  <div className="text-base font-extrabold">{f1(p.value)}</div>
                  {p.fc > 0 && <div className="text-ink-3 text-xs">FC {p.fc.toLocaleString()}</div>}
                </>
              }
            />
          ))}
        </>
      )}
    </Card>
  )
}
