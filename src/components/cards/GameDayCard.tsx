import { Swords } from 'lucide-react'
import { useState } from 'react'

import { f1, clamp, trunc } from '../../lib/format'
import { gameDay } from '../../lib/insights'
import { TeamAvatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/states'
import { ProjNotice, type CardProps } from './shared'

export function GameDayCard({ data }: CardProps) {
  const { model, matchups, week } = data
  const gd = gameDay(model, matchups)
  const [open, setOpen] = useState(false)

  if (!gd)
    return (
      <Card id="gameday" title="Game Day" context="No matchup yet" icon={Swords}>
        <EmptyState>No Week {week} matchup is posted for your team yet. Check back once Sleeper sets the schedule.</EmptyState>
      </Card>
    )

  return (
    <Card id="gameday" title="Game Day" context={`Week ${week} matchup`} icon={Swords}>
      <ProjNotice data={data} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
        <Team name={gd.myName} pts={gd.myProj} user={model.ownerOf(gd.myRosterId)} me />
        <span className="text-ink-3 text-lg font-extrabold">VS</span>
        <Team name={gd.oppName} pts={gd.oppProj} user={gd.oppRosterId ? model.ownerOf(gd.oppRosterId) : null} />
      </div>

      <div
        role="progressbar"
        aria-label="Win probability"
        aria-valuenow={gd.winPct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-line my-5 mb-2 h-3 overflow-hidden rounded-full"
      >
        <span className="from-accent-deep to-accent block h-full rounded-full bg-gradient-to-r" style={{ width: `${clamp(gd.winPct, 3, 97)}%` }} />
      </div>
      <div className="text-ink-3 flex justify-between text-sm">
        <span>
          Win probability <b className="text-ink">{gd.winPct}%</b>
        </span>
        <span>Kickoff preview</span>
      </div>

      {gd.oppRosterId !== null && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="border-line bg-panel mt-4 w-full rounded-2xl border p-3.5 font-bold"
          >
            {open ? 'Hide position battles' : 'Show position battles'}
          </button>
          {open && (
            <ul className="mt-3.5 flex flex-col gap-2">
              {gd.battles.length === 0 && <EmptyState>No projections to compare.</EmptyState>}
              {gd.battles.map((b, i) => (
                <li key={i} className="border-line bg-panel grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border px-3 py-2.5 text-sm">
                  <span className={`min-w-0 ${b.meWin ? 'text-accent' : ''}`}>
                    <span className="block truncate font-semibold">{b.me.name}</span>
                    <span className="text-ink-3 text-xs">{f1(b.me.pj)}</span>
                  </span>
                  <span className="text-ink-3 text-center text-xs font-bold">{b.slot}</span>
                  <span className={`min-w-0 text-right ${!b.meWin ? 'text-accent' : ''}`}>
                    <span className="block truncate font-semibold">{b.opp.name}</span>
                    <span className="text-ink-3 text-xs">{f1(b.opp.pj)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function Team({ name, pts, user, me }: { name: string; pts: number; user: Parameters<typeof TeamAvatar>[0]['user']; me?: boolean }) {
  return (
    <div className={`bg-panel rounded-2xl border px-3.5 py-5 text-center ${me ? 'border-accent/35' : 'border-line'}`}>
      <div className="mb-3 flex justify-center">
        <TeamAvatar user={user} className={`size-16 text-xl ${me ? 'border-accent border-2' : ''}`} />
      </div>
      <div className="mb-1.5 text-base font-bold sm:text-lg">{trunc(name)}</div>
      <div className={`text-4xl font-extrabold tracking-tight sm:text-5xl ${me ? 'text-accent' : ''}`}>{f1(pts)}</div>
      <div className="text-ink-3 mt-1 text-sm">projected</div>
    </div>
  )
}
