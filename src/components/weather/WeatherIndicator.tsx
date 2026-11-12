import { CalendarClock, CloudOff, Warehouse, Wind } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useGameWeather } from '../../hooks/useGameWeather'
import { useSession } from '../../hooks/useSession'
import { relTime } from '../../lib/format'
import { WINDOW, type Condition } from '../../lib/weather/weather'
import { ART, labelOf, notAvailable } from './art'

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
  compact = false,
  iconOnly = false,
  className = '',
}: {
  team: string | null | undefined
  week?: number
  /** icon + high only (for tight table columns); wind stays in the tooltip and the amber border */
  compact?: boolean
  /** just the art (a "Weather" table column); everything else is in the tooltip and the amber border */
  iconOnly?: boolean
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
  const label =
    w.status === 'too-early'
      ? 'Forecast not out yet'
      : w.status === 'unavailable'
        ? 'Forecast unavailable'
        : labelOf(cond)
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
        className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border align-middle ${iconOnly ? 'size-9 justify-center px-0' : 'pr-2.5 pl-0.5'} text-xs font-bold whitespace-nowrap tabular-nums transition-colors ${
          risky
            ? 'border-amber/60 bg-amber/12 text-amber'
            : 'border-line bg-panel text-ink-2 hover:text-ink'
        } ${w.loading ? 'animate-pulse' : ''} ${className}`}
      >
        {w.status === 'indoor' ? (
          <>
            <Warehouse size={14} aria-hidden className={iconOnly ? '' : 'mx-1'} />
            {!iconOnly && 'Dome'}
          </>
        ) : !f && w.status !== 'too-early' ? (
          <>
            <CloudOff size={14} aria-hidden className={iconOnly ? '' : 'mx-1'} />
            {!iconOnly && '—'}
          </>
        ) : w.status === 'too-early' ? (
          <>
            <CalendarClock size={14} aria-hidden className={iconOnly ? '' : 'mx-1'} />
            {!iconOnly && 'Later'}
          </>
        ) : (
          <>
            <img
              src={
                f ? (f.condition === 'indoor' ? notAvailable : ART[f.condition].src) : notAvailable
              }
              alt=""
              aria-hidden
              className={iconOnly ? 'size-8' : compact ? '-my-1 size-8' : '-my-1.5 size-10'}
              draggable={false}
            />
            {!iconOnly && (f ? `${f.tempMax}°` : '—')}
            {f && f.wind >= 15 && !compact && !iconOnly && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                <Wind size={11} aria-hidden />
                {f.wind}
              </span>
            )}
          </>
        )}
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
            {f && (
              <div className="border-line -mx-3.5 -mt-3.5 mb-3 flex items-center gap-2 rounded-t-xl border-b bg-panel px-3 py-2">
                <img
                  src={f.condition === 'indoor' ? notAvailable : ART[f.condition].src}
                  alt=""
                  aria-hidden
                  className="size-16"
                  draggable={false}
                />
                <div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {f.tempMax}°
                    <span className="text-ink-3 text-base font-bold"> / {f.tempMin}°</span>
                  </div>
                  <div className="text-ink-2 font-semibold">{labelOf(f.condition)}</div>
                </div>
              </div>
            )}
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
                    ['Conditions', labelOf(f.condition)],
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
