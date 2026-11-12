import { ChevronRight, CloudSun } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useWeekWeather } from '../../hooks/useWeekWeather'
import { CARD } from '../dashboard/styles'
import { Skeleton } from '../ui/states'

/** How many of this week's games have a flagged forecast; opens the full weather view. */
export function WeatherWatch({ week, className = '' }: { week: number; className?: string }) {
  const { games, loading, scheduleFailed } = useWeekWeather(week)
  const upcoming = games.filter((g) => g.status === 'forecast' || g.status === 'too-early' || g.status === 'unavailable')
  const forecast = games.filter((g) => g.forecast)
  const flagged = forecast.filter((g) => g.risks.length > 0)
  const indoor = games.filter((g) => g.status === 'indoor').length
  return (
    <Link
      to="/weather"
      aria-label={`Weather Watch: ${flagged.length} game${flagged.length === 1 ? '' : 's'} with weather concerns. Open weather analysis`}
      className={`${CARD} group hover:border-accent/50 flex min-w-0 flex-col gap-3 p-5 transition-colors ${className}`}
    >
      <span className="flex items-center gap-3">
        <span className="bg-accent/12 text-accent grid size-10 shrink-0 place-items-center rounded-xl">
          <CloudSun size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-xl font-extrabold tracking-tight">Weather Watch</span>
        <ChevronRight size={20} aria-hidden className="text-ink-3 group-hover:text-ink" />
      </span>
      {loading && !games.length ? (
        <Skeleton className="h-16" />
      ) : scheduleFailed ? (
        <span className="text-ink-3 text-sm">The NFL schedule could not be loaded.</span>
      ) : (
        <>
          <span className="flex items-baseline gap-2">
            <span className={`text-4xl font-extrabold tabular-nums ${flagged.length ? 'text-amber' : 'text-good'}`}>
              {flagged.length}
            </span>
            <span className="text-ink-2 text-sm font-semibold">
              game{flagged.length === 1 ? '' : 's'} with weather concerns
            </span>
          </span>
          <span className="text-ink-3 text-xs">
            {forecast.length} outdoor forecast{forecast.length === 1 ? '' : 's'} checked · {indoor} indoor
            {upcoming.length > forecast.length ? ` · ${upcoming.length - forecast.length} not out yet` : ''}
            {loading ? ' · loading…' : ''}
          </span>
          <span className="text-ink-3 text-xs">Wind 20+ mph, heavy rain, snow or storms. Context only.</span>
        </>
      )}
    </Link>
  )
}
