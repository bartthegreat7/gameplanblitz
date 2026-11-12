import { Link } from 'react-router-dom'

import {
  AVAILABILITY_TEXT,
  availabilityOf,
  teamContext,
  type Ripple,
} from '../../lib/analytics/opportunity'
import type { Model } from '../../lib/model'
import { PlayerAvatar } from '../ui/Avatar'
import { Pill, PosTag } from '../ui/Pill'

/** Who has the player in this league: you, another team, or nobody (a free agent). */
export function Ownership({ m, id }: { m: Model; id: string }) {
  const r = m.rosters.find((x) => (x.players ?? []).includes(id))
  if (!r) return <Pill tone="prio">Free agent</Pill>
  if (r.roster_id === m.myRosterId) return <Pill tone="info">Your team</Pill>
  return <Pill>{m.teamName(r.roster_id)}</Pill>
}

export function InjuryTag({ status }: { status: string }) {
  if (!status) return null
  const a = availabilityOf(status)
  return <Pill tone={a === 'out' ? 'warn' : 'caution'}>{status}</Pill>
}

export function PlayerLine({
  m,
  id,
  children,
}: {
  m: Model
  id: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PlayerAvatar player={m.players[id]} className="size-10 text-xs" />
      <div className="min-w-0 flex-1">
        <Link to={`/players/${id}`} className="block truncate font-bold hover:underline">
          {m.name(id)}
        </Link>
        <div className="text-ink-3 flex flex-wrap items-center gap-1.5 text-sm">
          <PosTag pos={m.pos(id)} />
          <span>{m.team(id) || 'FA'}</span>
          <InjuryTag status={m.injury(id)} />
          <Ownership m={m} id={id} />
        </div>
      </div>
      {children}
    </div>
  )
}

const sgn = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`

/** One teammate's measured usage change in games the injured player missed. */
export function RippleRow({ m, r, injuredName }: { m: Model; r: Ripple; injuredName: string }) {
  return (
    <li className="border-line/60 border-b py-3 last:border-0">
      <PlayerLine m={m} id={r.id}>
        {r.delta ? (
          <div className="shrink-0 text-right text-sm">
            <div
              className={`font-extrabold tabular-nums ${r.delta.touches + r.delta.targets > 0.5 ? 'text-good' : r.delta.touches + r.delta.targets < -0.5 ? 'text-bad' : ''}`}
            >
              {sgn(r.delta.touches)} touches · {sgn(r.delta.targets)} tgts
            </div>
            <div className="text-ink-3">
              {r.delta.snapShare !== null ? `${sgn(r.delta.snapShare * 100, 0)} snap % · ` : ''}
              {sgn(r.delta.pts)} pts
            </div>
          </div>
        ) : (
          <div className="text-ink-3 shrink-0 text-right text-sm">
            {r.depth ? `Depth chart #${r.depth}` : 'No missed games to compare'}
          </div>
        )}
      </PlayerLine>
      {r.delta && (
        <p className="text-ink-3 mt-1.5 pl-[52px] text-xs">
          Per game, in {r.without} game{r.without === 1 ? '' : 's'} without {injuredName} vs{' '}
          {r.with} with him{r.without < 3 ? ' (small sample)' : ''}.
        </p>
      )}
    </li>
  )
}

/** Official designation + the team's QB and offensive-line situation (Sleeper facts). */
export function AvailabilityFacts({ m, id }: { m: Model; id: string }) {
  const p = m.players[id]
  if (!p) return null
  const status = p.injury_status ?? ''
  const ctx = p.team ? teamContext(m.players, p.team) : null
  const qbOut = ctx?.qb && ctx.qb.id !== id && availabilityOf(ctx.qb.status) !== 'active'
  return (
    <dl className="grid gap-2.5 text-sm">
      <div>
        <dt className="text-ink-3">Designation (Sleeper)</dt>
        <dd className="font-bold">
          {status
            ? `${status}${p.injury_body_part ? ` · ${p.injury_body_part}` : ''}${p.injury_notes ? ` (${p.injury_notes})` : ''}`
            : 'None'}
          <span className="text-ink-2 block font-normal">
            {AVAILABILITY_TEXT[availabilityOf(status)]}
          </span>
        </dd>
      </div>
      {ctx && (
        <>
          <div>
            <dt className="text-ink-3">Starting QB (depth chart)</dt>
            <dd className="font-bold">
              {ctx.qb
                ? `${m.name(ctx.qb.id)}${ctx.qb.status ? ` · ${ctx.qb.status}` : ''}`
                : 'Not listed'}
              {qbOut && (
                <span className="text-amber block font-normal">
                  The starting QB has an injury designation.
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Offensive line injuries</dt>
            <dd className="font-bold">
              {ctx.olInjuries.length === 0
                ? 'None listed'
                : ctx.olInjuries.map((o) => `${m.name(o.id)} (${o.pos}, ${o.status})`).join(', ')}
            </dd>
          </div>
        </>
      )}
      <p className="text-ink-3 text-xs">
        Practice reports aren&apos;t available from Sleeper, so participation isn&apos;t shown.
      </p>
    </dl>
  )
}
