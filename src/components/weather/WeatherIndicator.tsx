import {
  CalendarClock,
  Cloud,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Warehouse,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useGameWeather } from '../../hooks/useGameWeather'
import { useSession } from '../../hooks/useSession'
import { relTime } from '../../lib/format'
import { WINDOW, type Condition } from '../../lib/weather/weather'

const ICON: Record<Condition, { icon: LucideIcon; label: string }> = {
  sunny: { icon: Sun, label: 'Sunny' },
  'partly-cloudy': { icon: CloudSun, label: 'Partly cloudy' },
  cloudy: { icon: Cloud, label: 'Cloudy' },
  rain: { icon: CloudRain, label: 'Rain' },
  snow: { icon: CloudSnow, label: 'Snow' },
  wind: { icon: Wind, label: 'Windy' },
  storm: { icon: CloudLightning, label: 'Thunderstorms' },
  indoor: { icon: Warehouse, label: 'Indoors' },
  unknown: { icon: Cloud, label: 'Forecast' },
}

const fmtDate = (d: string) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : 'Date not published'

/**
 * Compact weather icon for a player's upcoming game, with a details tooltip on hover, keyboard
 * focus, or tap. Renders nothing for byes and games already played.
 */
export function WeatherIndicator({
  team,
  week,
  className = '',
}: {
  team: string | null | undefined
  week?: number
  className?: string
}) {
  const session = useSession()
  const w = useGameWeather(team, week ?? session.week)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const id = useId()
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) return
    const b = btn.current.getBoundingClientRect()
    const t = tip.current.getBoundingClientRect()
    const below = b.bottom + 8 + t.height <= window.innerHeight
    setPos({
      top: below ? b.bottom + 8 : Math.max(8, b.top - 8 - t.height),
      left: Math.min(
        Math.max(8, b.left + b.width / 2 - t.width / 2),
        window.innerWidth - t.width - 8,
      ),
    })
  }, [open])

  if (!team || w.status === 'no-game' || w.status === 'played' || !w.game) return null

  const cond: Condition = w.status === 'indoor' ? 'indoor' : (w.forecast?.condition ?? 'unknown')
  const { icon: Icon, label } =
    w.status === 'too-early'
      ? { icon: CalendarClock, label: 'Forecast not out yet' }
      : w.status === 'unavailable'
        ? { icon: CloudOff, label: 'Forecast unavailable' }
        : ICON[cond]
  const risky = w.risks.length > 0
  const g = w.game
  const matchup = `${g.away} @ ${g.home}`
  const f = w.forecast
  const summary = f ? `${label}, ${f.tempMin}–${f.tempMax}°F, wind ${f.wind} mph` : label

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Weather for ${matchup}: ${summary}${risky ? `. ${w.risks.join('. ')}` : ''}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-grid size-7 shrink-0 place-items-center rounded-md border align-middle transition-colors ${
          risky
            ? 'border-amber/50 bg-amber/12 text-amber'
            : 'border-line bg-panel text-ink-2 hover:text-ink'
        } ${w.loading ? 'animate-pulse' : ''} ${className}`}
      >
        <Icon size={15} aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="border-line bg-card text-ink fixed z-[60] w-72 rounded-xl border p-3.5 text-left text-sm shadow-2xl"
          >
            <div className="font-extrabold">
              {matchup} · Week {g.week}
            </div>
            <div className="text-ink-2">
              {w.stadium ? `${w.stadium.name}, ${w.stadium.city}` : 'Stadium unknown'}
            </div>
            <div className="text-ink-3 mt-0.5 text-xs">
              {fmtDate(g.date)} · kickoff time not published by Sleeper
            </div>
            {w.roofNote && <div className="text-ink-2 mt-2">{w.roofNote}</div>}
            {f ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {(
                  [
                    ['Conditions', ICON[f.condition].label],
                    ['Temperature', `${f.tempMin}–${f.tempMax}°F`],
                    ['Wind', `${f.wind} mph`],
                    ['Gusts', `${f.gusts} mph`],
                    ['Precip. chance', `${f.precipProb}%`],
                    [f.snow > 0 ? 'Snowfall' : 'Rainfall', `${f.snow > 0 ? f.snow : f.precip} in`],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-right font-bold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-ink-2 mt-2">
                {w.status === 'indoor'
                  ? 'No outdoor weather on the field.'
                  : w.status === 'too-early'
                    ? 'Forecasts are available within 16 days of the game.'
                    : w.loading
                      ? 'Loading forecast…'
                      : 'The weather service did not return a forecast for this game.'}
              </p>
            )}
            {risky && (
              <ul className="text-amber mt-2 grid gap-0.5 text-xs font-bold">
                {w.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {f && (
              <p className="text-ink-3 mt-2 text-xs">
                Forecast for {WINDOW.label}
                {w.fetchedAt ? `, updated ${relTime(w.fetchedAt, now)}` : ''}. Context only: not
                applied to projections.
              </p>
            )}
            <p className="text-ink-3 mt-1 text-xs">
              Assumes the home team&apos;s stadium. Weather data by Open-Meteo.com.
            </p>
          </div>,
          document.body,
        )}
    </>
  )
}
