/*
 * NFL home stadiums (2026 season) keyed by Sleeper team code. Coordinates are the stadium site
 * (approximate, for weather lookup). Roof: 'dome' = fixed roof, 'retractable' = may open or close
 * (status is not published in advance, so it is never assumed), 'canopy' = fixed translucent roof
 * over the field with open sides (SoFi Stadium), 'open' = outdoors.
 * Limitation: Sleeper's schedule has no venue, so games are assumed to be at the home team's
 * stadium. Neutral-site games (international series etc.) are not identified.
 */
export type Roof = 'open' | 'dome' | 'retractable' | 'canopy'

export interface Stadium {
  name: string
  city: string
  lat: number
  lon: number
  roof: Roof
  /** IANA time zone, for the game-day forecast window */
  tz: string
}

const S = (
  name: string,
  city: string,
  lat: number,
  lon: number,
  roof: Roof,
  tz: string,
): Stadium => ({ name, city, lat, lon, roof, tz })
const ET = 'America/New_York'
const CT = 'America/Chicago'
const MT = 'America/Denver'
const PT = 'America/Los_Angeles'

export const STADIUMS: Record<string, Stadium> = {
  ARI: S(
    'State Farm Stadium',
    'Glendale, AZ',
    33.5276,
    -112.2626,
    'retractable',
    'America/Phoenix',
  ),
  ATL: S('Mercedes-Benz Stadium', 'Atlanta, GA', 33.7554, -84.4008, 'retractable', ET),
  BAL: S('M&T Bank Stadium', 'Baltimore, MD', 39.278, -76.6227, 'open', ET),
  BUF: S('Highmark Stadium', 'Orchard Park, NY', 42.7738, -78.787, 'open', ET),
  CAR: S('Bank of America Stadium', 'Charlotte, NC', 35.2258, -80.8528, 'open', ET),
  CHI: S('Soldier Field', 'Chicago, IL', 41.8623, -87.6167, 'open', CT),
  CIN: S('Paycor Stadium', 'Cincinnati, OH', 39.0955, -84.5161, 'open', ET),
  CLE: S('Huntington Bank Field', 'Cleveland, OH', 41.5061, -81.6995, 'open', ET),
  DAL: S('AT&T Stadium', 'Arlington, TX', 32.7473, -97.0945, 'retractable', CT),
  DEN: S('Empower Field at Mile High', 'Denver, CO', 39.7439, -105.0201, 'open', MT),
  DET: S('Ford Field', 'Detroit, MI', 42.34, -83.0456, 'dome', ET),
  GB: S('Lambeau Field', 'Green Bay, WI', 44.5013, -88.0622, 'open', CT),
  HOU: S('NRG Stadium', 'Houston, TX', 29.6847, -95.4107, 'retractable', CT),
  IND: S(
    'Lucas Oil Stadium',
    'Indianapolis, IN',
    39.7601,
    -86.1639,
    'retractable',
    'America/Indiana/Indianapolis',
  ),
  JAX: S('EverBank Stadium', 'Jacksonville, FL', 30.3239, -81.6373, 'open', ET),
  KC: S('GEHA Field at Arrowhead Stadium', 'Kansas City, MO', 39.0489, -94.4839, 'open', CT),
  LV: S('Allegiant Stadium', 'Las Vegas, NV', 36.0909, -115.1833, 'dome', PT),
  LAC: S('SoFi Stadium', 'Inglewood, CA', 33.9535, -118.3392, 'canopy', PT),
  LAR: S('SoFi Stadium', 'Inglewood, CA', 33.9535, -118.3392, 'canopy', PT),
  MIA: S('Hard Rock Stadium', 'Miami Gardens, FL', 25.958, -80.2389, 'open', ET),
  MIN: S('U.S. Bank Stadium', 'Minneapolis, MN', 44.9737, -93.2581, 'dome', CT),
  NE: S('Gillette Stadium', 'Foxborough, MA', 42.0909, -71.2643, 'open', ET),
  NO: S('Caesars Superdome', 'New Orleans, LA', 29.9511, -90.0812, 'dome', CT),
  NYG: S('MetLife Stadium', 'East Rutherford, NJ', 40.8135, -74.0745, 'open', ET),
  NYJ: S('MetLife Stadium', 'East Rutherford, NJ', 40.8135, -74.0745, 'open', ET),
  PHI: S('Lincoln Financial Field', 'Philadelphia, PA', 39.9008, -75.1675, 'open', ET),
  PIT: S('Acrisure Stadium', 'Pittsburgh, PA', 40.4468, -80.0158, 'open', ET),
  SF: S("Levi's Stadium", 'Santa Clara, CA', 37.403, -121.97, 'open', PT),
  SEA: S('Lumen Field', 'Seattle, WA', 47.5952, -122.3316, 'open', PT),
  TB: S('Raymond James Stadium', 'Tampa, FL', 27.9759, -82.5033, 'open', ET),
  TEN: S('Nissan Stadium', 'Nashville, TN', 36.1665, -86.7713, 'open', CT),
  WAS: S('Northwest Stadium', 'Landover, MD', 38.9078, -76.8645, 'open', ET),
}

/** Fixed roofs: no outdoor weather reaches the field. */
export const isIndoor = (roof: Roof) => roof === 'dome' || roof === 'canopy'
