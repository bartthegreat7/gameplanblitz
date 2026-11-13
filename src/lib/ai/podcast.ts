import { mulberry32 } from '../analytics/playoffs'
import { unsupportedNumbers, type Fact, type Topic } from './facts'

/* The Podcast Studio: an evidence-grounded outline, then a script whose every line is labeled fact,
   opinion or banter. The built-in writer only reads facts aloud (verbatim) and adds number-free
   opinions and transitions; AI-written scripts are checked line by line against the facts. The
   hosts are fictional; the disclosure lines are always added by the app, never by the writer. */

export type EpisodeType = 'preview' | 'recap' | 'moves' | 'kickoff'
export type Format = 'solo' | 'debate'
export type Tone = 'straight' | 'humor'
export type Length = 'short' | 'standard' | 'extended'

export const EPISODE_TYPES: { id: EpisodeType; label: string; blurb: string }[] = [
  { id: 'recap', label: 'Postgame Report', blurb: 'Last week around the league: results, upsets, the standings, power rankings and the race.' },
  { id: 'moves', label: 'Waiver War Room', blurb: 'Free agents, waiver priorities, roster weaknesses, trade partners and keeper notes.' },
  { id: 'preview', label: 'Game Plan Preview', blurb: 'Your matchup, lineup calls, injuries, weather and every matchup this week.' },
  { id: 'kickoff', label: 'Kickoff Briefing', blurb: 'Last checks before lock: designations, weather, lineup decisions, league storylines.' },
]

/** Editions. Minutes are targets: the real length depends on how much your league data supports. */
export const EDITIONS: { id: Length; label: string; minutes: number }[] = [
  { id: 'short', label: 'Quick', minutes: 5 },
  { id: 'standard', label: 'Standard', minutes: 10 },
  { id: 'extended', label: 'Extended', minutes: 20 },
]

export interface Host {
  name: string
  role: string
}

/** Fictional hosts. They are not modeled on any real broadcaster. */
export const HOSTS: Host[] = [
  { name: 'Jordan', role: 'Lead analyst' },
  { name: 'Casey', role: 'Co-host' },
]

export interface Chapter {
  id: string
  title: string
  facts: string[]
  include: boolean
}

export type LineKind = 'fact' | 'opinion' | 'banter' | 'disclosure'

export interface Line {
  speaker: 0 | 1
  kind: LineKind
  text: string
  cite: string[]
  chapter: string
  /** checker findings (AI-written lines) */
  flags?: string[]
}

interface ChapterSpec {
  id: string
  title: string
  topics: Topic[]
  max: number
  /** only facts the filter accepts */
  filter?: (f: Fact) => boolean
}

const isStarterInjury = (f: Fact) => f.topic !== 'injury' || f.text.includes('starting lineup') || f.kind === 'model'

const SPECS: Record<EpisodeType, ChapterSpec[]> = {
  preview: [
    { id: 'matchup', title: 'The matchup', topics: ['matchup'], max: 3 },
    { id: 'scout', title: 'Scouting the opponent', topics: ['scouting'], max: 4 },
    { id: 'lineup', title: 'Lineup decisions', topics: ['lineup'], max: 4, filter: (f) => f.data?.role === 'swap' || f.players.length === 0 || f.data?.role === 'starter' },
    { id: 'risk', title: 'Injuries and weather', topics: ['injury', 'weather'], max: 4, filter: isStarterInjury },
    { id: 'league', title: 'This Week Around the League', topics: ['league'], max: 8, filter: (f) => f.data?.segment === 'preview' },
    { id: 'race', title: 'What it means for the race', topics: ['playoffs'], max: 1 },
  ],
  kickoff: [
    { id: 'lock', title: 'Lineup lock check', topics: ['lineup'], max: 4, filter: (f) => f.data?.role === 'swap' || f.players.length === 0 },
    { id: 'injuries', title: 'Injury report', topics: ['injury'], max: 4, filter: isStarterInjury },
    { id: 'weather', title: 'Weather watch', topics: ['weather'], max: 3 },
    { id: 'odds', title: 'Projection and win odds', topics: ['matchup'], max: 2 },
    { id: 'news', title: 'Latest news', topics: ['news'], max: 3 },
  ],
  recap: [
    { id: 'result', title: 'Last week’s result', topics: ['recap'], max: 5 },
    { id: 'around', title: 'Around the League', topics: ['league'], max: 16, filter: (f) => f.data?.segment === 'around' },
    { id: 'power', title: 'Power rankings', topics: ['league'], max: 6, filter: (f) => f.data?.segment === 'power' },
    { id: 'table', title: 'The standings', topics: ['standings'], max: 5 },
    { id: 'race', title: 'Playoff picture', topics: ['playoffs'], max: 1 },
    { id: 'next', title: 'Looking ahead', topics: ['matchup'], max: 2 },
  ],
  moves: [
    { id: 'waivers', title: 'Waiver targets', topics: ['waivers'], max: 4 },
    { id: 'breakouts', title: 'Breakouts and openings', topics: ['breakout'], max: 3 },
    { id: 'partners', title: 'Roster fits and trade partners', topics: ['trades'], max: 2, filter: (f) => f.data?.role === 'partner' },
    { id: 'trades', title: 'Trade ideas', topics: ['trades'], max: 3, filter: (f) => f.data?.role !== 'partner' && f.data?.role !== 'impact' },
    { id: 'keepers', title: 'Keeper notes', topics: ['keepers'], max: 3 },
    { id: 'news', title: 'News that matters', topics: ['news'], max: 2 },
  ],
}

/** Extra chapters for the extended (20-minute) edition. */
const EXTENDED: Record<EpisodeType, ChapterSpec[]> = {
  recap: [
    { id: 'season', title: 'Your season so far', topics: ['history'], max: 4 },
    { id: 'news', title: 'News that matters', topics: ['news'], max: 3 },
    { id: 'ahead', title: 'This Week Around the League', topics: ['league'], max: 6, filter: (f) => f.data?.segment === 'preview' },
  ],
  moves: [
    { id: 'impact', title: 'What your stars are worth to your lineup', topics: ['trades'], max: 3, filter: (f) => f.data?.role === 'impact' },
    { id: 'standing', title: 'Where you stand', topics: ['standings', 'playoffs'], max: 3 },
  ],
  preview: [
    { id: 'news', title: 'News that matters', topics: ['news'], max: 3 },
    { id: 'pickups', title: 'Late pickups', topics: ['waivers'], max: 2 },
    { id: 'power', title: 'Power rankings check', topics: ['league'], max: 4, filter: (f) => f.data?.segment === 'power' },
  ],
  kickoff: [
    { id: 'league', title: 'League storylines', topics: ['league'], max: 6, filter: (f) => f.data?.segment === 'preview' },
    { id: 'race', title: 'What it means for the race', topics: ['playoffs'], max: 1 },
  ],
}

const SCALE: Record<Length, number> = { short: 0.6, standard: 1, extended: 1.6 }

export interface Outline {
  chapters: Chapter[]
  /** chapters left out because the tools had nothing for them */
  skipped: string[]
}

export function buildOutline(type: EpisodeType, facts: Fact[], length: Length = 'standard'): Outline {
  const chapters: Chapter[] = []
  const skipped: string[] = []
  const scale = SCALE[length]
  for (const s of length === 'extended' ? [...SPECS[type], ...EXTENDED[type]] : SPECS[type]) {
    const pool = facts.filter((f) => s.topics.includes(f.topic) && (s.filter ? s.filter(f) : true))
    const pick = pool.slice(0, Math.max(1, Math.round(s.max * scale)))
    if (pick.length === 0) skipped.push(s.title)
    else chapters.push({ id: s.id, title: s.title, facts: pick.map((f) => f.id), include: true })
  }
  return { chapters, skipped }
}

/* ---------------- the built-in writer ---------------- */

const pick = <T,>(rng: () => number, xs: T[]): T => xs[Math.floor(rng() * xs.length) % xs.length]

const OPENERS: Record<EpisodeType, string[]> = {
  preview: ['Let’s break down the week ahead.', 'Big week. Let’s get into the matchup.'],
  kickoff: ['Kickoff is close, so this one is quick.', 'Coffee’s on. Let’s run the final checks.'],
  recap: ['Let’s look back at how last week went.', 'Time to grade the week.'],
  moves: ['Let’s talk roster moves.', 'The wire is open. Let’s see who’s worth a look.'],
}

const INTRO: Record<string, string[]> = {
  matchup: ['First, the matchup.', 'Start with who you’re facing.'],
  scout: ['Now, the scouting report.', 'Let’s look across the field.'],
  lineup: ['Now the lineup calls.', 'On to the lineup.'],
  lock: ['Lineup first.', 'Before anything locks, the lineup.'],
  risk: ['Next, the risk report.', 'Let’s check injuries and weather.'],
  injuries: ['Injury report.', 'Here’s who’s banged up.'],
  weather: ['Weather watch.', 'A look at the skies.'],
  odds: ['The numbers on the game.', 'Where the model has this one.'],
  news: ['A few headlines.', 'News worth knowing.'],
  race: ['Zooming out to the playoff race.', 'And the bigger picture.'],
  result: ['The result first.', 'Here’s how it went.'],
  table: ['The standings.', 'Around the league table.'],
  next: ['Looking ahead.', 'And next up.'],
  waivers: ['Waiver targets.', 'Who to put a claim on.'],
  breakouts: ['Rising usage.', 'Players getting more work.'],
  trades: ['Trade ideas.', 'Let’s talk trades.'],
  keepers: ['Keeper notes.', 'Thinking about next season.'],
  around: ['Now let’s go around the league.', 'Time for Around the League: every matchup from last week.'],
  power: ['Power rankings and the standings.', 'Let’s see how the league stacks up.'],
  league: ['This week around the league.', 'Now a look at every other matchup this week.'],
}

/** Number-free, good-natured league ribbing for the humorous tone (never about a real person). */
const LEAGUE_JOKES = [
  'Somewhere in this league, a manager is refreshing the stat corrections page right now.',
  'If your bench outscored your starters, we are not judging. Much.',
  'Group chat is going to be lively this week.',
]

const LEAD_IN: Record<'fact' | 'model', string[]> = {
  fact: ['From Sleeper:', 'The facts:', 'For the record:'],
  model: ['The model says:', 'Here’s the projection:', 'Our tools have it like this:'],
}

/** Opinions are deliberately number-free: the numbers live in the cited fact lines. */
function opinionFor(f: Fact): string | null {
  if (f.data?.role === 'swap') return 'I’d make that swap before lock.'
  if (f.topic === 'waivers' && f.text.startsWith('Waiver target')) return 'I’d put in a claim if the roster spot is there.'
  if (f.topic === 'trades') return 'Worth sending, as long as you’re comfortable with what you give up.'
  if (f.topic === 'injury' && f.text.includes('starting lineup')) return 'Keep an eye on that one up to kickoff, and have the backup ready.'
  if (f.topic === 'weather') return 'Weather is context, not a reason to bench a good player on its own.'
  if (f.topic === 'keepers' && f.text.includes('Recommended')) return 'That’s the kind of value keeper rules are made for.'
  if (f.topic === 'breakout') return 'Usage leads points, so I like getting there early.'
  return null
}

const PUSHBACK: Partial<Record<Topic, string[]>> = {
  lineup: ['Devil’s advocate: projections are estimates, and one big play swings these.', 'I hear you, but the gap is small enough that it could go either way.'],
  waivers: ['Counterpoint: claims depend on your waiver priority or budget, so have a backup plan.'],
  trades: ['Pushback: market value isn’t the same as what the other manager will accept.'],
  injury: ['To be fair, Questionable players play more often than not.'],
  matchup: ['Win probability isn’t destiny. Projections miss every week.'],
  breakout: ['I’d be careful. A couple of games is a small sample.'],
  playoffs: ['Simulations are only as good as the projections behind them.'],
}

const JOKES = [
  'If bench points counted, everyone would be a contender.',
  'Somewhere a manager is refreshing the injury report for the fortieth time.',
  'Fantasy football: where a backup tight end can ruin your whole weekend.',
  'Reminder: the trade deadline doesn’t care about your feelings.',
]

export interface WriteOptions {
  type: EpisodeType
  format: Format
  tone: Tone
  leagueName: string
  week: number
  hosts?: Host[]
  /** voices are synthetic either way; the disclosure says so */
  seed?: number
}

export function disclosure(o: { hosts: Host[]; format: Format; leagueName: string; week: number }): { open: string; close: string } {
  const who =
    o.format === 'debate'
      ? `I’m ${o.hosts[0].name}, with ${o.hosts[1].name}. We’re fictional hosts with AI-generated voices`
      : `I’m ${o.hosts[0].name}, a fictional host with an AI-generated voice`
  return {
    open: `Welcome to The War Room for ${o.leagueName}, Week ${o.week}. ${who}, reading a computer-generated script built from your league data. Facts come from Sleeper and the GameplanBlitz tools; opinions are labeled as opinions.`,
    close: `That’s the show. Remember: the hosts and voices are AI-generated, nothing here changes your roster, and every move is yours to make in Sleeper.`,
  }
}

/** Writes a script from the approved outline using only the facts' own sentences. */
export function writeScript(outline: Chapter[], facts: Fact[], o: WriteOptions): Line[] {
  const hosts = o.hosts ?? HOSTS
  const rng = mulberry32(o.seed ?? o.week * 7919 + o.leagueName.length)
  const byId = new Map(facts.map((f) => [f.id, f]))
  const two = o.format === 'debate'
  const d = disclosure({ hosts, format: o.format, leagueName: o.leagueName, week: o.week })
  const lines: Line[] = [{ speaker: 0, kind: 'disclosure', text: d.open, cite: [], chapter: 'open' }]
  lines.push({ speaker: 0, kind: 'banter', text: pick(rng, OPENERS[o.type]), cite: [], chapter: 'open' })
  let turn: 0 | 1 = 0
  const next = (): 0 | 1 => {
    if (two) turn = turn === 0 ? 1 : 0
    return turn
  }

  for (const c of outline.filter((c) => c.include)) {
    lines.push({ speaker: 0, kind: 'banter', text: pick(rng, INTRO[c.id] ?? ['Next up.']), cite: [], chapter: c.id })
    turn = 0
    let opinions = 0
    let pushed = false
    for (const id of c.facts) {
      const f = byId.get(id)
      if (!f) continue
      lines.push({
        speaker: two ? next() : 0,
        kind: 'fact',
        text: `${pick(rng, LEAD_IN[f.kind])} ${f.text}`,
        cite: [f.id],
        chapter: c.id,
      })
      const op = opinions < 2 ? opinionFor(f) : null
      if (op) {
        opinions++
        lines.push({ speaker: 0, kind: 'opinion', text: `My take: ${op}`, cite: [f.id], chapter: c.id })
        const pb = PUSHBACK[f.topic]
        if (two && pb && !pushed) {
          pushed = true
          lines.push({ speaker: 1, kind: 'opinion', text: pick(rng, pb), cite: [f.id], chapter: c.id })
        }
      }
    }
    if (o.tone === 'humor' && rng() < 0.6)
      lines.push({ speaker: two ? 1 : 0, kind: 'banter', text: pick(rng, c.id === 'around' || c.id === 'power' ? LEAGUE_JOKES : JOKES), cite: [], chapter: c.id })
  }
  lines.push({ speaker: 0, kind: 'disclosure', text: d.close, cite: [], chapter: 'close' })
  return lines
}

/* ---------------- checking AI-written scripts ---------------- */

export interface RawLine {
  speaker: 'A' | 'B'
  kind: 'fact' | 'opinion' | 'banter'
  chapter: string
  text: string
  cite: string[]
}

/**
 * Turns an AI-written script into lines, flagging anything not supported by the facts: fact lines
 * without citations, unknown citations, and numbers the cited facts don't contain (banter must
 * have no numbers at all). The app adds its own disclosure lines at both ends.
 */
export function checkScript(raw: RawLine[], facts: Fact[], o: { hosts: Host[]; format: Format; leagueName: string; week: number }): Line[] {
  const byId = new Map(facts.map((f) => [f.id, f]))
  const d = disclosure(o)
  const body = raw.map((l): Line => {
    const cite = l.cite.filter((id) => byId.has(id))
    const flags: string[] = []
    const unknown = l.cite.filter((id) => !byId.has(id))
    if (unknown.length) flags.push(`Cites facts that don't exist (${unknown.join(', ')}).`)
    if (l.kind === 'fact' && cite.length === 0) flags.push('Stated as fact without a citation.')
    const nums = unsupportedNumbers(l.text, cite.map((id) => byId.get(id)!))
    if (nums.length) flags.push(`Couldn't verify ${nums.join(', ')} against the cited facts.`)
    return {
      speaker: l.speaker === 'B' && o.format === 'debate' ? 1 : 0,
      kind: l.kind,
      text: l.text,
      cite,
      chapter: l.chapter,
      ...(flags.length ? { flags } : {}),
    }
  })
  return [
    { speaker: 0, kind: 'disclosure', text: d.open, cite: [], chapter: 'open' },
    ...body,
    { speaker: 0, kind: 'disclosure', text: d.close, cite: [], chapter: 'close' },
  ]
}

/** Lines that would be spoken: flagged lines are left out unless the user keeps them. */
export const flaggedCount = (lines: Line[]) => lines.filter((l) => l.flags?.length).length

/** Spoken form: symbols a speech engine reads badly. The transcript keeps the written form. */
export function speakable(text: string): string {
  return text
    .replace(/\+(\d)/g, 'plus $1')
    .replace(/−(\d)/g, 'minus $1')
    .replace(/\bpts\b/g, 'points')
    .replace(/\bwk\b/g, 'week')
    .replace(/\bvs\b\.?/g, 'versus')
    .replace(/\s*;\s*/g, ', ')
}

/** About 2.6 words a second at normal speed. */
export const estimateSeconds = (text: string, rate = 1) =>
  Math.max(1.2, text.split(/\s+/).filter(Boolean).length / (2.6 * rate))

/** Episode length options, in lines of script (the built-in writer is driven by the outline). */
export const TARGET_LINES: Record<Length, number> = { short: 18, standard: 34, extended: 64 }
