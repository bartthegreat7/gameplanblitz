import { useEffect, useState } from 'react'

import type { TeamOdds } from '../../lib/analytics/playoffs'
import type { BoardGame } from '../../lib/analytics/scoreboard'
import type { Model } from '../../lib/model'
import { ScoreCard } from './ScoreCard'

/** Every matchup as a card; my game first. `focus` opens (and scrolls to) one matchup. */
export function ScoreList({
  m,
  games,
  record,
  odds,
  focus,
}: {
  m: Model
  games: BoardGame[]
  record: (rosterId: number) => string | null
  odds?: TeamOdds[] | null
  focus?: number | null
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(focus !== null && focus !== undefined ? [focus] : []))
  useEffect(() => {
    if (focus === null || focus === undefined) return
    document.getElementById(`game-${focus}`)?.scrollIntoView?.({ block: 'center' })
  }, [focus])
  const by = new Map((odds ?? []).map((o) => [o.rosterId, o.playoffPct]))
  const race = (id: number) => {
    const p = by.get(id)
    return p !== undefined && p >= 5 && p <= 95
  }
  const mine = (g: BoardGame) => g.a.rosterId === m.myRosterId || g.b?.rosterId === m.myRosterId
  const ordered = [...games].sort((x, y) => Number(mine(y)) - Number(mine(x)))
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {ordered.map((g) => (
        <ScoreCard
          key={g.matchupId}
          m={m}
          game={g}
          record={record}
          playoffRace={!!g.b && g.status !== 'final' && race(g.a.rosterId) && race(g.b.rosterId)}
          open={open.has(g.matchupId)}
          onToggle={() =>
            setOpen((s) => {
              const n = new Set(s)
              if (n.has(g.matchupId)) n.delete(g.matchupId)
              else n.add(g.matchupId)
              return n
            })
          }
        />
      ))}
    </div>
  )
}
