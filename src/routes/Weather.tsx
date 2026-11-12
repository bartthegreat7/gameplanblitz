import { CloudSun, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { LeagueGate } from '../components/LeagueGate'
import { TeamLogo } from '../components/command/GameDayStrip'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import { ART, labelOf } from '../components/weather/art'
import type { Ready } from '../hooks/useLeagueData'
import { useWeekWeather, type GameForecast } from '../hooks/useWeekWeather'
import { gameDate } from '../lib/analytics/command'
import { relTime } from '../lib/format'
import { findMyMatchup, findOpponent } from '../lib/insights'
import { RISK } from '../lib/weather/weather'

type Filter = 'all' | 'concerns' | 'mine'

const ROOF: Record<string, string> = {
  open: 'Open air',
  dome: 'Dome',
  retractable: 'Retractable (status not announced)',
  canopy: 'Fixed canopy',
}

function Conditions({ g }: { g: GameForecast }) {
  if (g.status === 'indoor')
    return (
      <span className="text-ink-2 inline-flex items-center gap-1.5 text-sm">
        <Warehouse size={16} aria-hidden /> Indoors
      </span>
    )
  if (!g.forecast)
    return (
      <span className="text-ink-3 text-sm">
        {g.status === 'too-early'
          ? 'Forecast not out yet'
          : g.status === 'played'
            ? 'Game played'
            : 'Forecast unavailable'}
      </span>
    )
  const f = g.forecast
  return (
    <span className="inline-flex items-center gap-2">
      <img src={f.condition === 'indoor' ? ART.unknown.src : ART[f.condition].src} alt="" aria-hidden className="size-9" />
      <span className="text-sm">
        <b>{labelOf(f.condition)}</b>
        <span className="text-ink-3 block text-xs">
          {f.tempMin}–{f.tempMax}°F
        </span>
      </span>
    </span>
  )
}

function WeatherView({ data }: { data: Ready }) {
  const { model: m, matchups, week } = data
  const { games, loading, scheduleFailed } = useWeekWeather(week)
  const [filter, setFilter] = useState<Filter>('all')
  const involved = useMemo(() => {
    const by = new Map<string, { mine: string[]; theirs: string[] }>()
    const add = (ids: string[] | undefined, side: 'mine' | 'theirs') =>
      (ids ?? []).filter((id) => id && id !== '0').forEach((id) => {
        const t = m.team(id)
        if (!t) return
        const e = by.get(t) ?? { mine: [], theirs: [] }
        e[side].push(m.shortName(id))
        by.set(t, e)
      })
    add(findMyMatchup(matchups, m.myRosterId)?.starters, 'mine')
    add(findOpponent(matchups, m.myRosterId)?.starters, 'theirs')
    return by
  }, [m, matchups])
  const playersIn = (g: GameForecast) => {
    const a = involved.get(g.game.away) ?? { mine: [], theirs: [] }
    const h = involved.get(g.game.home) ?? { mine: [], theirs: [] }
    return { mine: [...a.mine, ...h.mine], theirs: [...a.theirs, ...h.theirs] }
  }
  const shown = games.filter((g) =>
    filter === 'concerns' ? g.risks.length > 0 : filter === 'mine' ? playersIn(g).mine.length + playersIn(g).theirs.length > 0 : true,
  )
  const flagged = games.filter((g) => g.risks.length).length
  const fetched = Math.max(0, ...games.map((g) => g.fetchedAt ?? 0))

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <CloudSun size={22} aria-hidden className="text-accent" /> Weather Watch
        </h1>
        <p className="text-ink-3 text-sm">
          Week {week} forecasts for every NFL game at the home team&apos;s stadium, {flagged} with a weather
          concern. Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Open-Meteo.com
          </a>
          {fetched ? ` · updated ${relTime(fetched)}` : ''}.
        </p>
      </div>
      <Notice tone="ok">
        Sleeper publishes no kickoff times, so each forecast covers game day from 12 PM to 11 PM local time.
        Concerns: sustained wind {RISK.wind}+ mph or gusts {RISK.gust}+, {RISK.precipIn}+ in of rain, {RISK.snowIn}+ in of
        snow, or storms. Weather is context only: it is not applied to any projection.
      </Notice>
      <div role="group" aria-label="Show games" className="border-line bg-panel inline-flex w-fit rounded-xl border p-0.5 text-sm font-bold">
        {(
          [
            ['all', 'All games'],
            ['concerns', 'Weather concerns'],
            ['mine', 'My matchup'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
            className={`min-h-9 rounded-lg px-3 ${filter === v ? 'bg-select text-select-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {scheduleFailed ? (
        <EmptyState>The NFL schedule could not be loaded.</EmptyState>
      ) : loading && games.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : shown.length === 0 ? (
        <EmptyState>
          {filter === 'concerns' ? 'No game this week has a weather concern.' : 'No games to show.'}
        </EmptyState>
      ) : (
        <div className="border-line bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Week {week} game weather</caption>
            <thead>
              <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                <th scope="col" className="p-3 font-semibold">Game</th>
                <th scope="col" className="p-3 font-semibold">Stadium</th>
                <th scope="col" className="p-3 font-semibold">Conditions</th>
                <th scope="col" className="p-3 text-right font-semibold">Wind</th>
                <th scope="col" className="p-3 text-right font-semibold">Gusts</th>
                <th scope="col" className="p-3 text-right font-semibold">Rain / snow</th>
                <th scope="col" className="p-3 font-semibold">Fantasy impact</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => {
                const f = g.forecast
                const p = playersIn(g)
                return (
                  <tr key={g.game.game_id} className="border-line/60 border-b align-top last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-extrabold">
                        <TeamLogo team={g.game.away} className="size-6" /> {g.game.away}
                        <span className="text-ink-3">@</span>
                        <TeamLogo team={g.game.home} className="size-6" /> {g.game.home}
                      </div>
                      <div className="text-ink-3 text-xs">{gameDate(g.game.date)} · kickoff time not published</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold">{g.stadium?.name ?? 'Unknown stadium'}</div>
                      <div className="text-ink-3 text-xs">
                        {g.stadium ? `${g.stadium.city} · ${ROOF[g.stadium.roof]}` : 'Not in the stadium table'}
                      </div>
                    </td>
                    <td className="p-3">
                      <Conditions g={g} />
                    </td>
                    <td className="p-3 text-right tabular-nums">{f ? `${f.wind} mph` : '—'}</td>
                    <td className="p-3 text-right tabular-nums">{f ? `${f.gusts} mph` : '—'}</td>
                    <td className="p-3 text-right tabular-nums">
                      {f ? (
                        <>
                          {f.precipProb}%
                          <span className="text-ink-3 block text-xs">
                            {f.precip} in{f.snow > 0 ? ` · ${f.snow} in snow` : ''}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      {g.risks.length > 0 ? (
                        <ul className="text-amber grid gap-0.5 text-xs font-bold">
                          {g.risks.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-ink-3 text-xs">{f ? 'No concern flagged' : ''}</span>
                      )}
                      {(p.mine.length > 0 || p.theirs.length > 0) && (
                        <div className="text-ink-2 mt-1 text-xs">
                          {p.mine.length > 0 && (
                            <div>
                              <b className="text-ink">Yours:</b> {p.mine.join(', ')}
                            </div>
                          )}
                          {p.theirs.length > 0 && (
                            <div>
                              <b className="text-ink">Opponent:</b> {p.theirs.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-ink-3 text-xs">
        Games are assumed at the home team&apos;s stadium (Sleeper does not identify neutral sites). Stadium
        coordinates are approximate. Want to act on it? Compare players in{' '}
        <Link to="/startsit" className="text-accent font-bold hover:underline">
          Start/Sit
        </Link>
        .
      </p>
    </div>
  )
}

export default function Weather() {
  return <LeagueGate>{(data) => <WeatherView data={data} />}</LeagueGate>
}
