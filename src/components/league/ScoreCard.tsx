import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'

import type { BoardGame, BoardSide } from '../../lib/analytics/scoreboard'
import { f1 } from '../../lib/format'
import type { Model } from '../../lib/model'
import { TeamAvatar } from '../ui/Avatar'
import { Pill } from '../ui/Pill'

const STATUS = {
  final: { label: 'Final', tone: 'neutral' as const },
  live: { label: 'Live', tone: 'warn' as const },
  scheduled: { label: 'Scheduled', tone: 'info' as const },
}

const STATE: Record<string, string> = {
  'not-started': 'Yet to play',
  'in-progress': 'Playing',
  final: 'Final',
  bye: 'Bye',
  unknown: '—',
}

function TeamRow({
  m,
  s,
  winPct,
  status,
  record,
  leading,
}: {
  m: Model
  s: BoardSide
  winPct: number | null
  status: BoardGame['status']
  record: string | null
  leading: boolean
}) {
  const mine = s.rosterId === m.myRosterId
  return (
    <div className="flex items-center gap-3">
      <TeamAvatar user={m.ownerOf(s.rosterId)} className={`size-10 shrink-0 text-sm ${mine ? 'ring-accent/70 ring-2' : ''}`} />
      <div className="min-w-0 flex-1">
        <div className={`truncate ${leading ? 'font-extrabold' : 'font-semibold'}`}>
          {m.teamName(s.rosterId)}
          {mine && <span className="text-accent"> (you)</span>}
        </div>
        <div className="text-ink-3 text-xs">
          {record ?? ''}
          {status !== 'final' && (
            <>
              {record ? ' · ' : ''}
              {s.playersLeft} left to play
            </>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-2xl leading-none font-extrabold tabular-nums ${status === 'final' && leading ? 'text-good' : ''}`}>
          {status === 'scheduled' ? f1(s.projectedFinal) : f1(s.points)}
        </div>
        <div className="text-ink-3 mt-0.5 text-[11px]">
          {status === 'scheduled' ? 'projected' : status === 'live' ? `proj. ${f1(s.projectedFinal)}` : 'final'}
          {winPct !== null && status !== 'final' && ` · ${winPct}%`}
        </div>
      </div>
    </div>
  )
}

function Lineup({ m, s }: { m: Model; s: BoardSide }) {
  return (
    <table className="w-full text-xs">
      <caption className="text-ink-2 pb-1 text-left text-xs font-bold">{m.teamName(s.rosterId)}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Slot</th>
          <th scope="col">Player</th>
          <th scope="col">Status</th>
          <th scope="col">Points</th>
          <th scope="col">Projection</th>
        </tr>
      </thead>
      <tbody>
        {s.live.players.map((p, i) => (
          <tr key={`${p.slot}-${i}`} className="border-line/40 border-t">
            <td className="text-ink-3 w-10 py-1 font-bold">{p.slot}</td>
            <td className="truncate py-1">
              {p.id ? (
                <Link to={`/players/${p.id}`} className="font-semibold hover:underline">
                  {p.name}
                </Link>
              ) : (
                <span className="text-ink-3">Empty</span>
              )}
            </td>
            <td className="text-ink-3 py-1 whitespace-nowrap">{p.id ? STATE[p.state] : ''}</td>
            <td className="py-1 text-right font-bold tabular-nums">{p.id ? f1(p.points) : ''}</td>
            <td className="text-ink-3 py-1 pl-2 text-right tabular-nums">{p.id ? f1(p.proj) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** One fantasy matchup: both teams, actual vs projected points, win odds, flags and starters. */
export function ScoreCard({
  m,
  game: g,
  record,
  playoffRace = false,
  open,
  onToggle,
}: {
  m: Model
  game: BoardGame
  record: (rosterId: number) => string | null
  /** both teams are still in the playoff race (simulation) */
  playoffRace?: boolean
  open: boolean
  onToggle: () => void
}) {
  const panel = useId()
  const mine = g.a.rosterId === m.myRosterId || g.b?.rosterId === m.myRosterId
  const st = STATUS[g.status]
  const aLead = !!g.b && g.aWinPct !== null && g.aWinPct > 50
  const bLead = !!g.b && g.aWinPct !== null && g.aWinPct < 50
  return (
    <article
      id={`game-${g.matchupId}`}
      aria-label={`${m.teamName(g.a.rosterId)} vs ${g.b ? m.teamName(g.b.rosterId) : 'no opponent'}`}
      className={`bg-card-2/70 grid gap-3 rounded-xl border p-4 ${mine ? 'border-accent/60 shadow-[0_0_0_1px_var(--accent)]' : 'border-line/70'}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={st.tone}>{st.label}</Pill>
        {mine && <Pill tone="prio">Your matchup</Pill>}
        {g.close && g.status !== 'final' && <Pill tone="caution">Close</Pill>}
        {g.upset && <Pill tone="caution">{g.status === 'final' ? 'Upset' : 'Upset alert'}</Pill>}
        {playoffRace && <Pill tone="neutral">Playoff race</Pill>}
      </div>
      <TeamRow m={m} s={g.a} winPct={g.aWinPct} status={g.status} record={record(g.a.rosterId)} leading={g.status === 'final' ? !!g.b && g.a.points > g.b.points : aLead} />
      {g.b && (
        <>
          {g.aWinPct !== null && g.status !== 'final' && (
            <div
              role="progressbar"
              aria-label={`${m.teamName(g.a.rosterId)} win probability`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={g.aWinPct}
              className="bg-bad/40 flex h-1.5 overflow-hidden rounded-full"
            >
              <span className="bg-accent-deep h-full" style={{ width: `${g.aWinPct}%` }} />
            </div>
          )}
          <TeamRow
            m={m}
            s={g.b}
            winPct={g.aWinPct === null ? null : 100 - g.aWinPct}
            status={g.status}
            record={record(g.b.rosterId)}
            leading={g.status === 'final' ? g.b.points > g.a.points : bLead}
          />
        </>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={onToggle}
        className="text-accent inline-flex items-center gap-1 justify-self-start text-sm font-bold hover:underline"
      >
        {open ? 'Hide starters' : 'Starters and points'}
        <ChevronDown size={15} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={panel} className="grid gap-3 sm:grid-cols-2">
          <Lineup m={m} s={g.a} />
          {g.b && <Lineup m={m} s={g.b} />}
        </div>
      )}
    </article>
  )
}
