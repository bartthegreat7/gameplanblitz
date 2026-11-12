import { Coins, Ticket } from 'lucide-react'

import { f1, ordinal } from '../../lib/format'
import { bids, topFreeAgents } from '../../lib/insights'
import { Card } from '../ui/Card'
import { PosTag } from '../ui/Pill'
import { EmptyState } from '../ui/states'
import { Pill } from '../ui/Pill'
import { Proj, PlayerRow, ProjNotice, type CardProps } from './shared'

export function WaiverWireCard({ data }: CardProps) {
  const { model, week } = data
  const top = topFreeAgents(model, 12)
  return (
    <Card id="waiver" title="Waiver Wire" context={`Top free agents · Week ${week}`} icon={Ticket} tone="green">
      <ProjNotice data={data} />
      {top.length === 0 ? (
        <EmptyState>No projected free agents found for Week {week}.</EmptyState>
      ) : (
        <>
          <p className="text-ink-2 mb-3.5">Only players actually free in your league are shown, ranked by what they'd score this week in your scoring.</p>
          {top.map((p, i) => (
            <PlayerRow
              key={p.id}
              model={model}
              id={p.id}
              rank={i + 1}
              meta={
                <>
                  <PosTag pos={p.pos} />
                  <span>{model.team(p.id) || 'FA'}</span>
                  {p.inj && <Pill tone="caution">{p.inj}</Pill>}
                </>
              }
              right={<Proj value={f1(p.pj)} />}
            />
          ))}
        </>
      )}
    </Card>
  )
}

export function WaiverBidsCard({ data }: CardProps) {
  const { model, league, matchups, week } = data
  const b = bids(model, league, matchups)

  const rows = b.rows.length ? (
    b.rows.map((c) => (
      <PlayerRow
        key={c.id}
        model={model}
        id={c.id}
        meta={
          <>
            <PosTag pos={c.pos} />
            <span>{model.team(c.id) || 'FA'}</span>
            {c.help > 0 && <span>+{f1(c.help)} vs your weakest {c.pos}</span>}
          </>
        }
        right={
          c.bid !== null ? (
            <>
              <span className="border-amber/30 bg-amber/10 text-amber rounded-lg border px-2.5 py-1 text-sm font-extrabold">${c.bid}</span>
              <div className="text-ink-3 text-xs">of ${b.left} left</div>
            </>
          ) : (
            <>
              <span className="border-good/30 bg-good/12 text-good rounded-lg border px-2.5 py-1 text-sm font-extrabold">$0</span>
              <div className="text-ink-3 text-xs">no bid needed</div>
            </>
          )
        }
      />
    ))
  ) : (
    <EmptyState>No clear targets right now.</EmptyState>
  )

  if (!b.usesFAAB)
    return (
      <Card id="bids" title="Waiver Priority" context="Rolling waivers" icon={Coins} tone="gold">
        <ProjNotice data={data} />
        <p className="text-ink-2 mb-2">Your league uses rolling waiver priority, not FAAB.</p>
        <h3 className="text-amber mb-1 text-base font-extrabold">Top targets</h3>
        {rows}
      </Card>
    )

  return (
    <Card id="bids" title="Waiver Bids" context={`$${b.budget} budget · Week ${week}`} icon={Coins} tone="gold">
      <ProjNotice data={data} />
      <div className="border-amber/30 bg-panel flex items-center gap-4 rounded-2xl border p-4">
        <div
          aria-hidden
          className="text-logo-ink grid size-20 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe08a,#e9b445_70%)] text-2xl font-extrabold shadow-[0_0_22px_-4px_rgba(242,198,109,0.6)]"
        >
          ${b.left}
        </div>
        <div>
          <div className="text-xl font-extrabold">${b.left} left to spend</div>
          <div className="text-ink-2 text-sm">
            {ordinal(b.place)} most in the league. Rivals can bid up to ${b.maxOther}.
          </div>
        </div>
      </div>
      <h3 className="text-amber mt-4 mb-1 text-base font-extrabold">Bid sheet</h3>
      {rows}
    </Card>
  )
}
