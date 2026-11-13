import { episodeTitle } from './episode'
import type { Fact } from './facts'
import { buildOutline, estimateSeconds, HOSTS, speakable, writeScript, type EpisodeType, type Format, type Length, type Tone } from './podcast'
import type { Episode } from './storage'

/**
 * An episode written by the built-in writer from the fact sheet (every fact line cites a fact; the
 * app adds AI disclosures at both ends) with device-voice timing. Used for automatic weekly shows;
 * null when the tools have no facts for any of the show's chapters.
 */
export function buildEpisode(o: {
  id: string
  type: EpisodeType
  facts: Fact[]
  factsAsOf: number
  leagueId: string
  leagueName: string
  season: string
  week: number
  length: Length
  format: Format
  tone: Tone
  now: number
  auto: boolean
}): Episode | null {
  const outline = buildOutline(o.type, o.facts, o.length)
  const chapters = outline.chapters.filter((c) => c.include)
  if (chapters.length === 0) return null
  const hosts = o.format === 'debate' ? HOSTS : [HOSTS[0]]
  const lines = writeScript(chapters, o.facts, {
    type: o.type,
    format: o.format,
    tone: o.tone,
    leagueName: o.leagueName,
    week: o.week,
    hosts,
    seed: o.week * 31 + o.type.length,
  })
  const cited = new Set(lines.flatMap((l) => l.cite))
  return {
    id: o.id,
    leagueId: o.leagueId,
    leagueName: o.leagueName,
    season: o.season,
    week: o.week,
    createdAt: o.now,
    type: o.type,
    format: o.format,
    tone: o.tone,
    title: episodeTitle(o.type, o.week),
    hosts,
    outline: chapters,
    lines,
    writer: 'built-in',
    facts: o.facts.filter((f) => cited.has(f.id)),
    factsAsOf: o.factsAsOf,
    audio: { engine: 'device', voices: [], durations: lines.map((l) => estimateSeconds(speakable(l.text))) },
    saved: false,
    auto: o.auto,
  }
}
