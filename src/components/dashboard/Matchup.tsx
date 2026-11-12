import { Swords, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useGameWeather } from '../../hooks/useGameWeather'
import { f1, ordinal } from '../../lib/format'
import { findMyMatchup, findOpponent, standings, type GameDay } from '../../lib/insights'
import type { Model } from '../../lib/model'
import type { SleeperMatchup } from '../../lib/sleeper'
import { TeamAvatar } from '../ui/Avatar'
import { EmptyState } from '../ui/states'
import { ART, labelOf } from '../weather/art'
import { ModelTag } from './DashboardCard'
import { CARD } from './styles'

function Team({
  m,
  rosterId,
  proj,
  live,
}: {
  m: Model
  rosterId: number
  proj: number
  live: number | null
}) {
  const rows = standings(m)
  const rank = rows.findIndex((r) => r.rosterId === rosterId) + 1
  const r = rows.find((x) => x.rosterId === rosterId)
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <TeamAvatar user={m.ownerOf(rosterId)} className="size-10 text-sm" />
      <div className="mt-2 line-clamp-2 w-full leading-tight font-extrabold">
        {m.teamName(rosterId)}
      </div>
      {r && (
        <div className="text-ink-3 text-sm font-semibold">
          {r.w}-{r.l}
          {r.t ? `-${r.t}` : ''} ({ordinal(rank)})
        </div>
      )}
      <div className="mt-1.5 text-4xl font-extrabold tracking-tight tabular-nums">
        {f1(live ?? proj)}
      </div>
      <div className="text-ink-3 text-sm font-semibold">
        {live !== null ? `Live · proj. ${f1(proj)}` : 'Proj. Points'}
      </div>
    </div>
  )
}

/** The featured game's forecast: big art, temperature, conditions, stadium. */
function GameWeather({ m, playerId, week }: { m: Model; playerId: string | null; week: number }) {
  const team = playerId ? m.team(playerId) : null
  const w = useGameWeather(team, week)
  if (!playerId || !w.game || w.status === 'no-game' || w.status === 'played') return null
  const f = w.forecast
  return (
    <div className="border-line/60 bg-bg/40 flex flex-col items-center justify-center rounded-xl border px-4 py-3 text-center">
      <div className="text-ink-3 text-xs font-bold tracking-wide uppercase">Game weather</div>
      {w.status === 'indoor' ? (
        <>
          <Warehouse size={44} aria-hidden className="text-ink-2 my-2" />
          <div className="text-lg font-extrabold">Indoors</div>
        </>
      ) : f ? (
        <>
          <img
            src={f.condition === 'indoor' ? ART.unknown.src : ART[f.condition].src}
            alt=""
            aria-hidden
            className="size-16"
          />
          <div className="text-3xl font-extrabold tabular-nums">{f.tempMax}°F</div>
          <div className={`text-sm font-semibold ${w.risks.length ? 'text-amber' : 'text-ink-2'}`}>
            {labelOf(f.condition)} · {f.wind} mph
          </div>
        </>
      ) : (
        <div className="text-ink-2 my-4 text-sm">
          {w.status === 'too-early'
            ? 'Forecast not out yet'
            : w.loading
              ? 'Loading forecast…'
              : 'Forecast unavailable'}
        </div>
      )}
      <div className="mt-1 text-sm font-bold">
        {w.stadium?.name ?? `${w.game.away} @ ${w.game.home}`}
      </div>
      <div className="text-ink-3 text-xs">
        {m.shortName(playerId)} · {w.game.away} @ {w.game.home}
      </div>
    </div>
  )
}

/** Primary focal card: both teams, projected (or live) scores, the win chance and the key game's weather. */
export function MatchupHero({
  m,
  matchups,
  gd,
  week,
  weatherPlayer,
  className = '',
}: {
  m: Model
  matchups: SleeperMatchup[]
  gd: GameDay | null
  week: number
  /** whose game to show the weather for (a starter with flagged weather, else the QB) */
  weatherPlayer: string | null
  className?: string
}) {
  const mine = findMyMatchup(matchups, m.myRosterId)
  const opp = findOpponent(matchups, m.myRosterId)
  const started = (mine?.points ?? 0) > 0 || (opp?.points ?? 0) > 0
  const hasOpp = !!gd && gd.oppRosterId !== null
  return (
    <section
      aria-label="This Week's Matchup"
      className={`${CARD} flex min-w-0 flex-col p-5 ${className}`}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="bg-amber/12 text-amber grid size-11 shrink-0 place-items-center rounded-xl">
          <Swords size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">This Week&apos;s Matchup</h2>
          <p className="text-ink-2">{started ? 'Live now' : `Week ${week} · get the edge`}</p>
        </div>
        {gd && (
          <div className="flex shrink-0 flex-col items-end gap-1 text-sm font-bold">
            <Link to="/gameday" className="text-accent hover:underline">
              Game Day
            </Link>
            {hasOpp && (
              <Link to="/scouting" className="text-accent hover:underline">
                Scout
              </Link>
            )}
          </div>
        )}
      </div>
      {!gd || !mine ? (
        <EmptyState>No Week {week} matchup is posted for your team yet.</EmptyState>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="border-line/60 bg-bg/40 flex flex-col justify-center rounded-xl border px-4 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <Team
                m={m}
                rosterId={m.myRosterId}
                proj={gd.myProj}
                live={started ? (mine.points ?? 0) : null}
              />
              <span className="border-line bg-card text-ink-2 grid size-11 place-items-center rounded-full border text-sm font-extrabold">
                VS
              </span>
              {hasOpp ? (
                <Team
                  m={m}
                  rosterId={gd.oppRosterId!}
                  proj={gd.oppProj}
                  live={started ? (opp?.points ?? 0) : null}
                />
              ) : (
                <div className="text-ink-3 text-center">Bye week</div>
              )}
            </div>
            {hasOpp && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span
                  role="progressbar"
                  aria-label="Win probability"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={gd.winPct}
                  className="border-good/50 bg-good/15 text-good rounded-full border px-3.5 py-1 text-sm font-extrabold"
                >
                  {gd.winPct}% Win Chance
                </span>
                <ModelTag />
              </div>
            )}
          </div>
          <GameWeather m={m} playerId={weatherPlayer} week={week} />
        </div>
      )}
    </section>
  )
}
