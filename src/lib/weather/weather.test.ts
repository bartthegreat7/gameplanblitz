import { STADIUMS } from './stadiums'
import {
  conditionOf,
  forecastUrl,
  gameFor,
  risksOf,
  staleTimeFor,
  summarize,
  todayIn,
  weatherPlan,
  type Hourly,
} from './weather'

/** 24 hourly values for one date, with overrides by hour */
function day(
  date: string,
  base: Partial<Record<keyof Omit<Hourly, 'time'>, number>>,
  byHour: Record<number, Partial<Record<keyof Omit<Hourly, 'time'>, number>>> = {},
): Hourly {
  const h: Hourly = {
    time: [],
    temperature_2m: [],
    precipitation_probability: [],
    precipitation: [],
    snowfall: [],
    wind_speed_10m: [],
    wind_gusts_10m: [],
    weather_code: [],
  }
  for (let i = 0; i < 24; i++) {
    const v = {
      temperature_2m: 50,
      precipitation_probability: 0,
      precipitation: 0,
      snowfall: 0,
      wind_speed_10m: 5,
      wind_gusts_10m: 8,
      weather_code: 0,
      ...base,
      ...byHour[i],
    }
    h.time.push(`${date}T${String(i).padStart(2, '0')}:00`)
    for (const k of Object.keys(v) as (keyof typeof v)[]) h[k].push(v[k])
  }
  return h
}

describe('conditions', () => {
  it('maps WMO weather codes', () => {
    expect([0, 2, 3, 45, 61, 81, 73, 86, 95, 999].map((c) => conditionOf(c).c)).toEqual([
      'sunny',
      'partly-cloudy',
      'cloudy',
      'cloudy',
      'rain',
      'rain',
      'snow',
      'snow',
      'storm',
      'unknown',
    ])
  })
})

describe('summarize', () => {
  it('uses only the 12 PM - 11 PM game window of the game date', () => {
    // a 40 mph gust at 3 AM and rain at 8 AM are outside the window
    const h = day(
      '2026-11-15',
      {},
      {
        3: { wind_gusts_10m: 40 },
        8: { weather_code: 61, precipitation: 0.5 },
        13: { temperature_2m: 41 },
        20: { temperature_2m: 35 },
      },
    )
    expect(summarize(h, '2026-11-15')).toEqual({
      condition: 'sunny',
      tempMin: 35,
      tempMax: 50,
      wind: 5,
      gusts: 8,
      precipProb: 0,
      precip: 0,
      snow: 0,
    })
    expect(summarize(h, '2026-11-16')).toBeNull()
  })
  it('reports the most severe weather in the window, and wind when it is otherwise dry', () => {
    expect(
      summarize(
        day(
          '2026-11-15',
          {},
          { 14: { weather_code: 3 }, 17: { weather_code: 63, precipitation: 0.2 } },
        ),
        '2026-11-15',
      )!.condition,
    ).toBe('rain')
    expect(
      summarize(day('2026-11-15', { wind_speed_10m: 16, weather_code: 3 }), '2026-11-15')!
        .condition,
    ).toBe('wind')
    expect(
      summarize(
        day('2026-11-15', { wind_speed_10m: 16 }, { 15: { weather_code: 75, snowfall: 0.3 } }),
        '2026-11-15',
      )!.condition,
    ).toBe('snow')
  })
  it('totals precipitation across the window', () => {
    const f = summarize(
      day('2026-11-15', { precipitation: 0.05, precipitation_probability: 70 }),
      '2026-11-15',
    )!
    expect(f.precip).toBe(0.6) // 12 hours x 0.05
    expect(f.precipProb).toBe(70)
  })
})

describe('risks', () => {
  const f = {
    condition: 'sunny' as const,
    tempMin: 20,
    tempMax: 28,
    wind: 8,
    gusts: 12,
    precipProb: 10,
    precip: 0,
    snow: 0,
  }
  it('does not flag ordinary cold or light rain', () => {
    expect(risksOf(f)).toEqual([])
    expect(risksOf({ ...f, condition: 'rain', precip: 0.1 })).toEqual([])
  })
  it('flags strong wind, heavy precipitation, snow and storms', () => {
    expect(risksOf({ ...f, wind: 21, gusts: 33 })).toEqual(['Strong wind (21 mph, gusts 33)'])
    expect(risksOf({ ...f, gusts: 30 })).toHaveLength(1)
    expect(risksOf({ ...f, precip: 0.4 })).toEqual(['Heavy precipitation (0.4 in)'])
    expect(risksOf({ ...f, snow: 1.2, precip: 1 })).toEqual(['Snow (1.2 in)'])
    expect(risksOf({ ...f, condition: 'storm' })).toEqual(['Thunderstorms possible'])
  })
})

describe('weatherPlan', () => {
  const g = (home: string, date: string, status = 'pre_game') => ({
    game_id: '1',
    week: 6,
    status,
    date,
    home,
    away: 'XXX',
  })
  it('never requests weather for fixed roofs and labels retractable roofs honestly', () => {
    expect(weatherPlan(g('DET', '2026-11-15'), '2026-11-12')).toMatchObject({
      status: 'indoor',
      needsForecast: false,
    })
    expect(weatherPlan(g('LAR', '2026-11-15'), '2026-11-12')).toMatchObject({
      status: 'indoor',
      roofNote: expect.stringMatching(/canopy/),
    })
    expect(weatherPlan(g('DAL', '2026-11-15'), '2026-11-12')).toMatchObject({
      status: 'forecast',
      needsForecast: true,
      roofNote: expect.stringMatching(/not announced/),
    })
  })
  it('handles played games, games beyond the forecast range, byes and unknown teams', () => {
    expect(weatherPlan(g('BUF', '2026-11-08', 'complete'), '2026-11-12').status).toBe('played')
    expect(weatherPlan(g('BUF', '2026-11-08'), '2026-11-12').status).toBe('played')
    expect(weatherPlan(g('BUF', '2026-12-20'), '2026-11-12').status).toBe('too-early')
    expect(weatherPlan(g('BUF', '2026-11-15'), '2026-11-12').status).toBe('forecast')
    expect(weatherPlan(null, '2026-11-12').status).toBe('no-game')
    expect(weatherPlan(g('ZZZ', '2026-11-15'), '2026-11-12').status).toBe('unavailable')
  })
  it('finds a team’s game home or away', () => {
    const s = [g('BUF', '2026-11-15')]
    expect(gameFor(s, 'XXX', 6)).toBe(s[0])
    expect(gameFor(s, 'BUF', 7)).toBeNull()
  })
  it('refreshes more often as kickoff approaches', () => {
    expect(staleTimeFor('2026-11-12', '2026-11-12')).toBeLessThan(
      staleTimeFor('2026-11-14', '2026-11-12'),
    )
    expect(staleTimeFor('2026-11-14', '2026-11-12')).toBeLessThan(
      staleTimeFor('2026-11-20', '2026-11-12'),
    )
  })
})

describe('stadiums and request', () => {
  it('covers all 32 teams with valid coordinates and time zones', () => {
    const teams = Object.keys(STADIUMS)
    expect(teams).toHaveLength(32)
    for (const s of Object.values(STADIUMS)) {
      expect(s.lat).toBeGreaterThan(24)
      expect(s.lat).toBeLessThan(49)
      expect(s.lon).toBeLessThan(-70)
      expect(() => todayIn(s.tz)).not.toThrow()
    }
  })
  it('asks Open-Meteo for imperial units in the stadium time zone', () => {
    const u = new URL(forecastUrl(STADIUMS.GB))
    expect(u.searchParams.get('wind_speed_unit')).toBe('mph')
    expect(u.searchParams.get('temperature_unit')).toBe('fahrenheit')
    expect(u.searchParams.get('timezone')).toBe('America/Chicago')
  })
})
