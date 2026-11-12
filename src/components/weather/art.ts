import type { Condition } from '../../lib/weather/weather'
import clearDay from '../../assets/weather/clear-day.svg'
import notAvailable from '../../assets/weather/not-available.svg'
import overcast from '../../assets/weather/overcast.svg'
import partlyCloudy from '../../assets/weather/partly-cloudy-day.svg'
import rain from '../../assets/weather/rain.svg'
import snow from '../../assets/weather/snow.svg'
import storm from '../../assets/weather/thunderstorms-rain.svg'
import wind from '../../assets/weather/wind.svg'

/* Full-color weather art: "Weather Icons" by Bas Milius (MIT, see src/assets/weather/LICENSE.txt). */
export const ART: Record<Exclude<Condition, 'indoor'>, { src: string; label: string }> = {
  sunny: { src: clearDay, label: 'Sunny' },
  'partly-cloudy': { src: partlyCloudy, label: 'Partly cloudy' },
  cloudy: { src: overcast, label: 'Cloudy' },
  rain: { src: rain, label: 'Rain' },
  snow: { src: snow, label: 'Snow' },
  wind: { src: wind, label: 'Windy' },
  storm: { src: storm, label: 'Thunderstorms' },
  unknown: { src: notAvailable, label: 'Forecast' },
}
export const labelOf = (c: Condition) => (c === 'indoor' ? 'Indoors' : ART[c].label)

export { notAvailable }
