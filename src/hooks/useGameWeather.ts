import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getSchedule } from '../lib/sleeper'
import { STADIUMS } from '../lib/weather/stadiums'
import {
  gameFor,
  getForecast,
  risksOf,
  staleTimeFor,
  summarize,
  todayIn,
  weatherPlan,
  type GameWeather,
} from '../lib/weather/weather'
import { useSession } from './useSession'

const tzOf = (home: string) => STADIUMS[home]?.tz ?? 'America/New_York'

/**
 * Weather for a team's game in a week: the schedule (shared, cached), then one Open-Meteo forecast
 * per stadium (shared by every player at that stadium). Indoor games and games that already
 * happened never request a forecast.
 */
export function useGameWeather(
  team: string | null | undefined,
  week: number,
): GameWeather & { loading: boolean; fetchedAt: number | null } {
  const { season } = useSession()
  const [now] = useState(() => new Date())
  const scheduleQ = useQuery({
    queryKey: ['schedule', season],
    queryFn: () => getSchedule(season!),
    enabled: !!season,
    staleTime: 30 * 60_000,
    retry: 1,
  })
  const game = team ? gameFor(scheduleQ.data, team, week) : null
  const today = game ? todayIn(tzOf(game.home), now) : ''
  const plan = weatherPlan(game, today)
  const forecastQ = useQuery({
    queryKey: ['forecast', plan.stadium?.lat, plan.stadium?.lon],
    queryFn: () => getForecast(plan.stadium!),
    enabled: plan.needsForecast,
    staleTime: game?.date ? staleTimeFor(game.date, today) : Infinity,
    retry: 1,
  })
  const forecast =
    plan.needsForecast && forecastQ.data && game
      ? summarize(forecastQ.data.hourly, game.date)
      : null
  const failed = plan.needsForecast && (forecastQ.isError || (forecastQ.isSuccess && !forecast))
  return {
    game,
    stadium: plan.stadium,
    status: failed ? 'unavailable' : plan.status,
    roofNote: plan.roofNote,
    forecast,
    risks: forecast ? risksOf(forecast) : [],
    loading: scheduleQ.isPending || (plan.needsForecast && forecastQ.isPending),
    fetchedAt: forecastQ.data?.fetchedAt ?? null,
  }
}
