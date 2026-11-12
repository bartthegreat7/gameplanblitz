import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mockFetch, renderApp, resetStore, SCHEDULE } from './test/mockSleeper'

/* rb1 plays for AAA. Put AAA's week-5 game at Lambeau (outdoors) two days from now, or at Ford Field (indoors). */
const SLOW = { timeout: 15_000 }
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const scheduleAt = (home: string) => [
  ...SCHEDULE.filter((g) => !(g.week === 5 && (g.home === 'AAA' || g.away === 'AAA'))),
  { game_id: 'x', week: 5, status: 'pre_game', date: inDays(2), home, away: 'AAA' },
]

function hourly(date: string) {
  const h = {
    time: [] as string[],
    temperature_2m: [] as number[],
    precipitation_probability: [] as number[],
    precipitation: [] as number[],
    snowfall: [] as number[],
    wind_speed_10m: [] as number[],
    wind_gusts_10m: [] as number[],
    weather_code: [] as number[],
  }
  for (let i = 0; i < 24; i++) {
    h.time.push(`${date}T${String(i).padStart(2, '0')}:00`)
    h.temperature_2m.push(30 + i / 2)
    h.precipitation_probability.push(20)
    h.precipitation.push(0)
    h.snowfall.push(0)
    h.wind_speed_10m.push(22)
    h.wind_gusts_10m.push(34)
    h.weather_code.push(3)
  }
  return { hourly: h }
}

beforeEach(() => resetStore({ username: 'me' }))
afterEach(() => vi.unstubAllGlobals())

describe('weather indicator', () => {
  it('shows the forecast for the game window with risks flagged as context, on hover and keyboard focus', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      '/schedule/nfl/regular/2025': scheduleAt('GB'),
      '/v1/forecast': hourly(inDays(2)),
    })
    renderApp('#/players/rb1')
    const btn = await screen.findByRole(
      'button',
      {
        name: /Weather for AAA @ GB: Windy, 36–42°F, wind 22 mph\. Strong wind \(22 mph, gusts 34\)/,
      },
      SLOW,
    )
    await user.hover(btn)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Lambeau Field, Green Bay, WI')
    expect(tip).toHaveTextContent('kickoff time not published by Sleeper')
    expect(tip).toHaveTextContent('Outdoor stadium')
    expect(tip).toHaveTextContent(/Gusts\s*34 mph/)
    expect(tip).toHaveTextContent('Context only: not applied to projections')
    expect(tip).toHaveTextContent('Weather data by Open-Meteo.com')
    await user.unhover(btn)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    btn.focus()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    // one request for the stadium, in its own time zone and imperial units
    const calls = fetchMock.mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.includes('open-meteo'))
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0]).toContain('timezone=America%2FChicago')
  }, 30_000)

  it('marks indoor games without requesting a forecast', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({ '/schedule/nfl/regular/2025': scheduleAt('DET') })
    renderApp('#/players/rb1')
    const btn = await screen.findByRole('button', { name: /Weather for AAA @ DET: Indoors/ }, SLOW)
    await user.click(btn) // tap
    expect(
      within(await screen.findByRole('tooltip')).getByText('Indoor (fixed roof)'),
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('open-meteo'))).toBe(false)
  }, 30_000)

  it('shows nothing for games already played', async () => {
    mockFetch() // the mock schedule's week-5 game is in 2025
    renderApp('#/players/rb1')
    await screen.findByRole('heading', { name: 'Rusher Runnerson', level: 1 }, SLOW)
    expect(screen.queryByRole('button', { name: /^Weather for/ })).not.toBeInTheDocument()
  }, 30_000)
})
