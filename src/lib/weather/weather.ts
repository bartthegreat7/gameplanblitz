import type { ScheduleGame } from '../sleeper'
import { isIndoor, STADIUMS, type Stadium } from './stadiums'

/*
 * Game weather from Open-Meteo (free, no key, CC BY 4.0 attribution; non-commercial use).
 * Sleeper's schedule has no kickoff time, so the forecast is summarized over the game day's
 * 12 PM - 11 PM local window (covers early, late and night kickoffs) and labeled as such.
 * Weather is context only: no projection adjustment is applied until one is validated.
 */

export const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
export const FORECAST_DAYS = 16
export const WINDOW = { from: 12, to: 23, label: '12 PM – 11 PM local' } as const

/** Display thresholds for weather worth a look (not projection adjustments). */
export const RISK = { wind: 20, gust: 30, precipIn: 0.25, snowIn: 0.5, windyIcon: 15 } as const

export type Condition =
  'sunny' | 'partly-cloudy' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'storm' | 'indoor' | 'unknown'

export interface Hourly {
  time: string[]
  temperature_2m: number[]
  precipitation_probability: number[]
  precipitation: number[]
  snowfall: number[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
  weather_code: number[]
}

export interface Forecast {
  condition: Condition
  tempMin: number
  tempMax: number
  /** max sustained wind, mph */
  wind: number
  gusts: number
  /** max hourly precipitation probability, % */
  precipProb: number
  /** totals over the window, inches */
  precip: number
  snow: number
}

/** WMO weather codes -> condition, with a severity rank (higher wins within the window). */
export function conditionOf(code: number): { c: Condition; rank: number } {
  if (code >= 95 && code <= 99) return { c: 'storm', rank: 6 }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { c: 'snow', rank: 5 }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { c: 'rain', rank: 4 }
  if (code === 3 || code === 45 || code === 48) return { c: 'cloudy', rank: 2 }
  if (code === 1 || code === 2) return { c: 'partly-cloudy', rank: 1 }
  if (code === 0) return { c: 'sunny', rank: 0 }
  return { c: 'unknown', rank: -1 }
}

/** Summarize the hourly forecast for one local date's game window; null if the date isn't covered. */
export function summarize(h: Hourly, date: string): Forecast | null {
  const idx = h.time
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t }) =>
        t.startsWith(date) && +t.slice(11, 13) >= WINDOW.from && +t.slice(11, 13) <= WINDOW.to,
    )
    .map(({ i }) => i)
  if (idx.length === 0) return null
  const pick = (k: keyof Omit<Hourly, 'time'>) =>
    idx.map((i) => h[k][i]).filter((v) => typeof v === 'number')
  const worst = pick('weather_code')
    .map(conditionOf)
    .reduce((a, b) => (b.rank > a.rank ? b : a), { c: 'unknown' as Condition, rank: -1 })
  const wind = Math.max(0, ...pick('wind_speed_10m'))
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100
  const condition: Condition = worst.rank >= 4 ? worst.c : wind >= RISK.windyIcon ? 'wind' : worst.c
  return {
    condition,
    tempMin: Math.round(Math.min(...pick('temperature_2m'))),
    tempMax: Math.round(Math.max(...pick('temperature_2m'))),
    wind: Math.round(wind),
    gusts: Math.round(Math.max(0, ...pick('wind_gusts_10m'))),
    precipProb: Math.round(Math.max(0, ...pick('precipitation_probability'))),
    precip: sum(pick('precipitation')),
    snow: sum(pick('snowfall')),
  }
}

/** Conditions worth flagging. Context only; never applied to projections. */
export function risksOf(f: Forecast): string[] {
  const r: string[] = []
  if (f.wind >= RISK.wind || f.gusts >= RISK.gust)
    r.push(`Strong wind (${f.wind} mph, gusts ${f.gusts})`)
  if (f.snow >= RISK.snowIn) r.push(`Snow (${f.snow} in)`)
  else if (f.precip >= RISK.precipIn) r.push(`Heavy precipitation (${f.precip} in)`)
  if (f.condition === 'storm') r.push('Thunderstorms possible')
  return r
}

export type WeatherStatus =
  'forecast' | 'indoor' | 'too-early' | 'played' | 'unavailable' | 'no-game'

export interface GameWeather {
  game: ScheduleGame | null
  stadium: Stadium | null
  status: WeatherStatus
  roofNote: string | null
  forecast: Forecast | null
  risks: string[]
}

/** The team's game in a week (null on a bye or when the schedule has no game). */
export const gameFor = (schedule: ScheduleGame[] | null | undefined, team: string, week: number) =>
  (schedule ?? []).find((g) => g.week === week && (g.home === team || g.away === team)) ?? null

const dayDiff = (date: string, today: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)

/** What weather can be shown for a game, and whether a forecast is needed. Pure. */
export function weatherPlan(
  game: ScheduleGame | null,
  today: string,
): {
  stadium: Stadium | null
  status: WeatherStatus
  roofNote: string | null
  needsForecast: boolean
} {
  if (!game) return { stadium: null, status: 'no-game', roofNote: null, needsForecast: false }
  const stadium = STADIUMS[game.home] ?? null
  if (!stadium) return { stadium, status: 'unavailable', roofNote: null, needsForecast: false }
  const roofNote =
    stadium.roof === 'dome'
      ? 'Indoor (fixed roof)'
      : stadium.roof === 'canopy'
        ? 'Covered field (fixed roof canopy, open sides)'
        : stadium.roof === 'retractable'
          ? 'Retractable roof: open/closed not announced, outdoor forecast shown'
          : 'Outdoor stadium'
  if (isIndoor(stadium.roof)) return { stadium, status: 'indoor', roofNote, needsForecast: false }
  if (game.status === 'complete' || !game.date)
    return {
      stadium,
      status: game.status === 'complete' ? 'played' : 'unavailable',
      roofNote,
      needsForecast: false,
    }
  const d = dayDiff(game.date, today)
  if (d < 0) return { stadium, status: 'played', roofNote, needsForecast: false }
  if (d >= FORECAST_DAYS) return { stadium, status: 'too-early', roofNote, needsForecast: false }
  return { stadium, status: 'forecast', roofNote, needsForecast: true }
}

/** Forecasts change faster near kickoff: refresh every 6 h a week out, hourly within 3 days, every 20 min on game day. */
export function staleTimeFor(date: string, today: string): number {
  const d = dayDiff(date, today)
  return d <= 0 ? 20 * 60_000 : d <= 3 ? 60 * 60_000 : 6 * 60 * 60_000
}

export function forecastUrl(s: Stadium): string {
  const p = new URLSearchParams({
    latitude: String(s.lat),
    longitude: String(s.lon),
    hourly:
      'temperature_2m,precipitation_probability,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,weather_code',
    wind_speed_unit: 'mph',
    temperature_unit: 'fahrenheit',
    precipitation_unit: 'inch',
    timezone: s.tz,
    forecast_days: String(FORECAST_DAYS),
  })
  return `${OPEN_METEO}?${p}`
}

export interface ForecastResponse {
  hourly: Hourly
  fetchedAt: number
}

export async function getForecast(s: Stadium): Promise<ForecastResponse> {
  const r = await fetch(forecastUrl(s))
  if (!r.ok) throw new Error(`Weather service HTTP ${r.status}`)
  const body = (await r.json()) as { hourly?: Hourly }
  if (!body.hourly?.time) throw new Error('Unexpected weather response')
  return { hourly: body.hourly, fetchedAt: Date.now() }
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export const todayIn = (tz: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
