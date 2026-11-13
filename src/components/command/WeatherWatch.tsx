import { ArrowRight, CloudRainWind } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useWeekWeather } from '../../hooks/useWeekWeather'
import { CARD } from '../dashboard/styles'

/** How many of this week's games have a flagged forecast; opens the full weather view. */
export function WeatherWatch({ week, className = '' }: { week: number; className?: string }) {
  const { games, loading, scheduleFailed } = useWeekWeather(week)
  const forecast = games.filter((g) => g.forecast)
  const flagged = forecast.filter((g) => g.risks.length > 0).length
  const summary = scheduleFailed
    ? 'Schedule unavailable'
    : loading && !forecast.length
      ? 'Checking forecasts…'
      : `${flagged} game${flagged === 1 ? '' : 's'} with weather impact`
  return (
    <Link
      to="/weather"
      aria-label={`Weather Watch: ${flagged} game${flagged === 1 ? '' : 's'} with weather concerns. Open weather analysis`}
      title={`${forecast.length} outdoor forecasts checked. Wind 20+ mph, heavy rain, snow or storms. Context only.`}
      className={`${CARD} group hover:border-accent/50 flex min-w-0 items-center gap-3 p-4 transition-colors ${className}`}
    >
      <CloudRainWind size={38} aria-hidden className="text-accent shrink-0" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-lg font-extrabold tracking-tight">Weather Watch</span>
        <span className={`block truncate text-[13px] ${flagged ? 'text-amber font-semibold' : 'text-ink-2'}`}>{summary}</span>
      </span>
      <ArrowRight size={18} aria-hidden className="text-accent shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
