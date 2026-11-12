import { Link } from 'react-router-dom'

import type { Model } from '../lib/model'
import { f1 } from '../lib/format'
import { PlayerAvatar } from './ui/Avatar'
import { Pill, PosTag } from './ui/Pill'

/** Compact player summary used inside a Drawer. */
export function PlayerQuickView({ model, id }: { model: Model; id: string }) {
  const p = model.players[id]
  const ppg = model.ppg(id)
  const inj = model.injury(id)
  const fc = model.fcValue(id)
  const stats: [string, string][] = [
    ['This week (proj)', f1(model.projPts(id))],
    ['Season PPG', ppg != null ? f1(ppg) : '—'],
    ['Trade value (FC)', fc ? fc.toLocaleString() : '—'],
  ]
  return (
    <div>
      <div className="flex items-center gap-3.5">
        <PlayerAvatar player={p} className="size-16 text-lg" />
        <div className="min-w-0">
          <div className="text-xl font-extrabold">{model.name(id)}</div>
          <div className="text-ink-3 flex items-center gap-2 text-sm">
            <PosTag pos={model.pos(id)} />
            <span>{model.team(id) || 'FA'}</span>
            {inj && <Pill tone="caution">{inj}</Pill>}
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {stats.map(([k, v]) => (
          <div key={k} className="border-line bg-panel rounded-xl border p-3 text-center">
            <dd className="text-lg font-extrabold">{v}</dd>
            <dt className="text-ink-3 text-xs">{k}</dt>
          </div>
        ))}
      </dl>
      {(p?.injury_body_part || p?.injury_notes) && (
        <p className="text-ink-2 mt-3 text-sm">{[p.injury_body_part, p.injury_notes].filter(Boolean).join(' — ')}</p>
      )}
      <Link to={`/players/${id}`} className="bg-mint text-mint-ink mt-4 block rounded-xl py-3 text-center font-extrabold">
        Full player details
      </Link>
    </div>
  )
}
