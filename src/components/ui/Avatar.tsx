import { useState } from 'react'

import { headshotUrl, teamAvatarUrl, type SleeperPlayer, type SleeperUser } from '../../lib/sleeper'

const BASE = 'bg-panel border-line text-ink-3 grid shrink-0 place-items-center overflow-hidden rounded-full border font-bold'

function Face({ src, fallback, className }: { src: string | null; fallback: string; className: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`${BASE} ${className}`} aria-hidden>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        fallback
      )}
    </span>
  )
}

function playerInitials(p?: SleeperPlayer) {
  if (!p) return '?'
  if (p.position === 'DEF') return (p.team ?? '?').slice(0, 2)
  return ((p.first_name ?? ' ')[0] + (p.last_name ?? ' ')[0]).toUpperCase()
}

/** Player headshot (or team logo for DEF) with an initials fallback on image error. */
export function PlayerAvatar({ player, className = 'size-11 text-sm' }: { player?: SleeperPlayer; className?: string }) {
  return <Face src={player ? headshotUrl(player) : null} fallback={playerInitials(player)} className={className} />
}

/** Sleeper user avatar with an initial fallback. */
export function TeamAvatar({ user, className = 'size-16 text-xl' }: { user?: SleeperUser | null; className?: string }) {
  return (
    <Face
      src={user?.avatar ? teamAvatarUrl(user.avatar) : null}
      fallback={(user?.display_name ?? '?')[0].toUpperCase()}
      className={className}
    />
  )
}
