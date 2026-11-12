import { useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getSchedule, type ScheduleGame } from '../lib/sleeper'
import { STADIUMS, type Stadium } from '../lib/weather/stadiums'
import {
  getForecast,
  risksOf,
  staleTimeFor,
  summarize,
  todayIn,
  weatherPlan,
  type Forecast,
  type WeatherStatus,
} from '../lib/weather/weather'
import { useSession } from './useSession'

export interface GameForecast {
  game: ScheduleGame
  stadium: Stadium | null
  status: WeatherStatus
  roofNote: string | null
  forecast: Forecast | null
  risks: string[]
  /** when the forecast was fetched (ms), null when none */
  fetchedAt: number | null
}

/**
 * Weather for every NFL game in a week: the schedule, then one Open-Meteo forecast per outdoor
 * stadium (the same cache entries the weather chips use). Indoor games, games already played and
 * games beyond the forecast range request nothing. Games are assumed at the home team's stadium.
 */
export function useWeekWeather(week: number) {
  const { season } = useSession()
  const [now] = useState(() => new Date())
  const scheduleQ = useQuery({
    queryKey: ['schedule', season],
    queryFn: () => getSchedule(season!),
    enabled: !!season,
    staleTime: 30 * 60_000,
    retry: 1,
  })
  const plans = (scheduleQ.data ?? [])
    .filter((g) => g.week === week)
    .map((game) => {
      const today = todayIn(STADIUMS[game.home]?.tz ?? 'America/New_York', now)
      return { game, today, plan: weatherPlan(game, today) }
    })
  const stadiums = [
    ...new Map(
      plans
        .filter((p) => p.plan.needsForecast && p.plan.stadium)
        .map((p) => [`${p.plan.stadium!.lat},${p.plan.stadium!.lon}`, p] as const),
    ).values(),
  ]
  const qs = useQueries({
    queries: stadiums.map((p) => ({
      queryKey: ['forecast', p.plan.stadium!.lat, p.plan.stadium!.lon],
      queryFn: () => getForecast(p.plan.stadium!),
      staleTime: staleTimeFor(p.game.date, p.today),
      retry: 1,
    })),
  })
  const games: GameForecast[] = plans.map(({ game, plan }) => {
    const k = stadiums.findIndex(
      (p) => p.plan.stadium!.lat === plan.stadium?.lat && p.plan.stadium!.lon === plan.stadium?.lon,
    )
    const q = plan.needsForecast && k >= 0 ? qs[k] : null
    const forecast = q?.data ? summarize(q.data.hourly, game.date) : null
    const failed = !!q && (q.isError || (q.isSuccess && !forecast))
    return {
      game,
      stadium: plan.stadium,
      status: failed ? 'unavailable' : plan.status,
      roofNote: plan.roofNote,
      forecast,
      risks: forecast ? risksOf(forecast) : [],
      fetchedAt: q?.dataUpdatedAt || null,
    }
  })
  return {
    games: games.sort((a, b) => a.game.date.localeCompare(b.game.date) || a.game.home.localeCompare(b.game.home)),
    loading: scheduleQ.isPending || qs.some((q) => q.isPending),
    scheduleFailed: scheduleQ.isError,
  }
}
