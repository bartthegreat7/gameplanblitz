import type { Fact } from './facts'
import { EPISODE_TYPES, type Line } from './podcast'
import type { Episode } from './storage'

/* Episode helpers: the playback timeline (line start times, seeking, chapters) and the plain-text
   transcript used for reading, copying and sharing. */

export function starts(durations: number[]): number[] {
  const out: number[] = []
  let t = 0
  for (const d of durations) {
    out.push(t)
    t += d
  }
  return out
}

export const total = (durations: number[]) => durations.reduce((a, b) => a + b, 0)

/** The line playing at time t (seconds), and how far into it. */
export function locate(durations: number[], t: number): { index: number; offset: number } {
  const s = starts(durations)
  const clamped = Math.max(0, Math.min(t, Math.max(0, total(durations) - 0.01)))
  let i = s.length - 1
  while (i > 0 && s[i] > clamped) i--
  return { index: Math.max(0, i), offset: clamped - (s[i] ?? 0) }
}

export interface ChapterMark {
  id: string
  title: string
  index: number
  at: number
}

/** First line of each chapter (the intro and outro included), with its start time. */
export function chapterMarks(ep: Pick<Episode, 'lines' | 'outline'>, durations: number[]): ChapterMark[] {
  const s = starts(durations)
  const titles = new Map(ep.outline.map((c) => [c.id, c.title]))
  titles.set('open', 'Intro')
  titles.set('close', 'Outro')
  const marks: ChapterMark[] = []
  ep.lines.forEach((l, i) => {
    if (marks.at(-1)?.id !== l.chapter) marks.push({ id: l.chapter, title: titles.get(l.chapter) ?? l.chapter, index: i, at: s[i] ?? 0 })
  })
  return marks
}

export const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const KIND: Record<Line['kind'], string> = { fact: 'Fact', opinion: 'Opinion', banter: 'Banter', disclosure: 'Disclosure' }

export const episodeTitle = (type: Episode['type'], week: number) =>
  `${EPISODE_TYPES.find((t) => t.id === type)?.label ?? 'Episode'} · Week ${week}`

/** Plain-text transcript with labels and sources, for copying or saving. */
export function transcriptText(ep: Episode): string {
  const byId = new Map(ep.facts.map((f) => [f.id, f]))
  const head = [
    `${ep.title} - The War Room`,
    `${ep.leagueName} · created ${new Date(ep.createdAt).toLocaleString()}`,
    `AI-generated: the hosts (${ep.hosts.map((h) => h.name).join(' and ')}) are fictional and their voices are synthetic. Script ${ep.writer === 'ai' ? 'written by AI (Claude)' : 'assembled by GameplanBlitz'} from league data. Facts are labeled; opinions are opinions.`,
    '',
  ]
  const body = ep.lines.map((l) => {
    const who = ep.hosts[l.speaker]?.name ?? 'Host'
    const refs = l.cite.length ? ` [${l.cite.join(', ')}]` : ''
    return `${who.toUpperCase()} (${KIND[l.kind]}): ${l.text}${refs}`
  })
  const cited = [...new Set(ep.lines.flatMap((l) => l.cite))].map((id) => byId.get(id)).filter(Boolean)
  const sources = cited.length
    ? ['', 'Sources', ...cited.map((f) => `${f!.id}: ${f!.text} (${f!.source}${f!.asOf ? `, ${new Date(f!.asOf).toLocaleString()}` : ''})`)]
    : []
  return [...head, ...body, ...sources].join('\n')
}

/** Reads an audio clip's length; null when the browser can't tell (then estimates are used). */
export function blobDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return resolve(null)
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    const timer = setTimeout(() => done(null), 4_000)
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      clearTimeout(timer)
      done(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null)
    }
    a.onerror = () => {
      clearTimeout(timer)
      done(null)
    }
    a.src = url
  })
}

/** Saves text or audio as a file (a user action in the user's own app). */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const fileName = (ep: Episode, ext: string) =>
  `war-room-${ep.leagueName}-week-${ep.week}-${ep.type}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + `.${ext}`

/** League results quoted in the episode, for the score ticker ("Team A 102.4 def. Team B 101.9"). */
export function tickerItems(facts: Fact[]): string[] {
  return facts
    .filter((f) => f.topic === 'league' && /^Week \d+: /.test(f.text))
    .map((f) => {
      const body = f.text.replace(/^Week \d+: /, '')
      // the result ends at the first period right after a score ("… 101.9."); "def." must not cut it
      return body.match(/^(.*?\d)\.(?:\s|$)/)?.[1] ?? body.replace(/\.$/, '')
    })
}
