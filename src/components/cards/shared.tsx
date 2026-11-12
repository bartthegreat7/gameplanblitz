import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { Ready } from '../../hooks/useLeagueData'
import type { Model } from '../../lib/model'
import { PlayerAvatar } from '../ui/Avatar'
import { Notice } from '../ui/states'

export interface CardProps {
  data: Ready
}

/** Warning for cards that depend on weekly projections. */
export function ProjNotice({ data }: CardProps) {
  const { flags, week } = data
  if (flags.projFailed)
    return <Notice>Couldn't load Week {week} projections from Sleeper, so projected points below are 0 and can't be trusted. Use Refresh to retry.</Notice>
  if (flags.projEmpty)
    return <Notice>Sleeper hasn't published Week {week} projections yet, so projected points below are 0. Check back closer to kickoff.</Notice>
  return null
}

interface PlayerRowProps {
  model: Model
  id: string
  rank?: number
  /** extra meta shown after position/team */
  meta?: ReactNode
  right?: ReactNode
  /** when set, the row is a button (opens a drawer) instead of a link to the player page */
  onSelect?: (id: string) => void
  badge?: ReactNode
}

export function PlayerRow({ model, id, rank, meta, right, onSelect, badge }: PlayerRowProps) {
  const inner = (
    <>
      {rank !== undefined && <span className="text-ink-3 w-6 shrink-0 text-center text-lg font-extrabold">{rank}</span>}
      <PlayerAvatar player={model.players[id]} className="size-11 text-sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-bold">{model.name(id)}</span>
          {badge}
        </span>
        <span className="text-ink-3 flex flex-wrap items-center gap-1.5 text-xs">{meta}</span>
      </span>
      {right && <span className="ml-auto shrink-0 text-right">{right}</span>}
    </>
  )
  const cls = 'border-line/60 flex w-full items-center gap-3 border-t py-3 text-left first:border-t-0 hover:bg-card-2/50'
  return onSelect ? (
    <button type="button" className={cls} onClick={() => onSelect(id)}>
      {inner}
    </button>
  ) : (
    <Link to={`/players/${id}`} className={cls}>
      {inner}
    </Link>
  )
}

export function Proj({ value }: { value: string }) {
  return (
    <span className="text-base font-extrabold">
      {value}
      <span className="text-ink-3 text-xs font-semibold"> proj</span>
    </span>
  )
}
