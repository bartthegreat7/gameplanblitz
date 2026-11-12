import { Link } from 'react-router-dom'

import { f1 } from '../../lib/format'
import { evidenceFor, type Candidate } from '../../lib/analytics/lineupPlan'
import type { Model } from '../../lib/model'
import { PlayerAvatar } from '../ui/Avatar'
import { EvidenceList } from '../ui/badges'
import { Pill, PosTag } from '../ui/Pill'

export function StatusPills({ c }: { c: Candidate }) {
  return (
    <>
      {c.out && <Pill tone="warn">{c.injury}</Pill>}
      {!c.out && c.injury && <Pill tone="caution">{c.injury}</Pill>}
      {c.bye && <Pill tone="neutral">Bye</Pill>}
      {c.started && <Pill tone="info">Game started</Pill>}
    </>
  )
}

/** Drawer content: everything the optimizer knows about one player, with sources. */
export function PlayerInsight({ c, model, provider }: { c: Candidate; model: Model; provider: string | null }) {
  const tiles: [string, string][] = [
    ['Projection', f1(c.proj)],
    ['Floor', c.floor !== null ? f1(c.floor) : '—'],
    ['Ceiling', c.ceiling !== null ? f1(c.ceiling) : '—'],
  ]
  return (
    <div>
      <div className="flex items-center gap-3.5">
        <PlayerAvatar player={model.players[c.id]} className="size-16 text-lg" />
        <div className="min-w-0">
          <div className="text-xl font-extrabold">{model.name(c.id)}</div>
          <div className="text-ink-3 flex flex-wrap items-center gap-2 text-sm">
            <PosTag pos={c.pos} />
            <span>{c.team || 'FA'}</span>
            {c.opponent && <span>vs {c.opponent}</span>}
            <StatusPills c={c} />
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {tiles.map(([k, v]) => (
          <div key={k} className="border-line bg-panel rounded-xl border p-3 text-center">
            <dd className="text-lg font-extrabold">{v}</dd>
            <dt className="text-ink-3 text-xs">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <EvidenceList items={evidenceFor(c, provider)} />
      </div>
      <Link to={`/players/${c.id}`} className="bg-accent text-accent-ink mt-4 block rounded-xl py-3 text-center font-extrabold">
        Full player details
      </Link>
    </div>
  )
}
