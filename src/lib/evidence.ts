/**
 * Every recommendation carries its evidence (what number, from where) and a confidence
 * rating computed by a fixed, documented rubric: no free-form "AI" confidence.
 */

export interface Evidence {
  label: string
  value: string
  /** where the number comes from, e.g. "Sleeper projections" or "Model: ..." */
  source: string
}

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface Confidence {
  level: ConfidenceLevel
  points: number
  /** one line per rubric item that moved the score */
  notes: string[]
}

export interface ConfidenceFactors {
  /** projection gap divided by the combined volatility (sd) of both players */
  marginZ: number
  /** both players have at least MIN_GAMES of history behind their volatility estimate */
  sampleOk: boolean
  /** the recommended player carries a Questionable/Doubtful designation */
  injuryFlag: boolean
}

export const MIN_GAMES = 4

export const CONFIDENCE_RUBRIC = [
  'Projection gap ≥ 0.75 combined standard deviations: +2 (≥ 0.35: +1)',
  `Both players have ≥ ${MIN_GAMES} games of history: +1`,
  'Recommended player has no Questionable/Doubtful tag: +1 (otherwise −1)',
  'High: 4+ points · Medium: 2–3 · Low: 0–1',
]

export function rateConfidence(f: ConfidenceFactors): Confidence {
  let points = 0
  const notes: string[] = []
  if (f.marginZ >= 0.75) {
    points += 2
    notes.push('Large projection gap relative to week-to-week volatility')
  } else if (f.marginZ >= 0.35) {
    points += 1
    notes.push('Moderate projection gap relative to volatility')
  } else notes.push('Small projection gap relative to volatility (close call)')

  if (f.sampleOk) {
    points += 1
    notes.push(`Volatility estimated from ${MIN_GAMES}+ games for both players`)
  } else notes.push(`Limited game history (< ${MIN_GAMES} games) for at least one player`)

  if (f.injuryFlag) {
    points -= 1
    notes.push('Recommended player is Questionable/Doubtful')
  } else {
    points += 1
    notes.push('No injury designation on the recommended player')
  }
  return { level: points >= 4 ? 'high' : points >= 2 ? 'medium' : 'low', points, notes }
}
