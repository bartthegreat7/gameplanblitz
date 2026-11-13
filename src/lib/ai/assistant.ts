import { leanFor } from '../analytics/startsit'
import { f1 } from '../format'
import { unsupportedNumbers, type Fact, type Topic } from './facts'

/* The AI Fantasy GM's conversation logic: what a question is about (intent + players), follow-ups,
   and the built-in answer engine, which only arranges facts from the fact sheet (no AI). Also the
   checker for AI answers: unknown citations and numbers not found in the cited facts are flagged. */

export type Intent =
  | 'action'
  | 'startsit'
  | 'lineup'
  | 'matchup'
  | 'waivers'
  | 'trades'
  | 'injury'
  | 'weather'
  | 'keepers'
  | 'scouting'
  | 'playoffs'
  | 'standings'
  | 'projection'
  | 'news'
  | 'recap'
  | 'league'
  | 'summary'
  | 'unknown'

const RULES: [Intent, RegExp][] = [
  [
    'action',
    /\b(for me|on my behalf)\b|\b(make|submit|execute|place|accept|send|propose)\s+(the|a|my|that)?\s*(trade|claim|move|bid|offer|waiver)\b|\bset my lineup\b|\b(drop|add|claim|cut)\b.*\bnow\b/i,
  ],
  ['weather', /\b(weather|wind|windy|rain|snow|cold|forecast|dome|storm)/i],
  ['injury', /\b(injur|hurt|questionable|doubtful|status|health|is .* out\b|ruled out|\bir\b)/i],
  ['keepers', /\b(keeper|keep|dynasty)/i],
  ['trades', /\b(trade|offer|deal|buy low|sell high)/i],
  ['waivers', /\b(waiver|pick ?up|free agent|faab|stash|add)\b/i],
  ['playoffs', /\b(playoff|seed|bye|title|championship|make it)/i],
  ['league', /\b(around the league|league scores?|scores around|other (games|matchups|teams)|rest of the league|power rank|every matchup|who (won|lost|scored the most))/i],
  ['recap', /\b(last week|recap|how did (i|we)|result)/i],
  ['scouting', /\b(opponent|scout|facing|against|their (team|lineup|roster))/i],
  ['standings', /\b(standing|rank|record|what place|first place|last place)/i],
  ['news', /\b(news|article|report|headline|latest)/i],
  ['startsit', /\b(start|sit|bench|flex|play)\b/i],
  ['matchup', /\b(matchup|win|chance|odds|projected score|beat)\b/i],
  ['lineup', /\b(lineup|roster)\b/i],
  ['projection', /\b(project|expect|points|ceiling|floor|outlook|how many)/i],
  ['summary', /\b(what should i do|this week|priorit|summary|advice|help|focus)/i],
]

export function detectIntent(q: string): Intent | null {
  for (const [intent, re] of RULES) if (re.test(q)) return intent
  return null
}

const TOPICS: Partial<Record<Intent, Topic[]>> = {
  lineup: ['lineup'],
  matchup: ['matchup', 'scouting'],
  waivers: ['waivers', 'breakout'],
  trades: ['trades'],
  injury: ['injury'],
  weather: ['weather'],
  keepers: ['keepers'],
  scouting: ['scouting', 'matchup'],
  playoffs: ['playoffs', 'standings'],
  standings: ['standings'],
  projection: ['projection', 'lineup', 'injury', 'news'],
  news: ['news'],
  recap: ['recap'],
  league: ['league'],
}

/* ---------------- players ---------------- */

export interface NameEntry {
  id: string
  full: string
  /** on the user's roster (preferred when two players share a last name) */
  mine: boolean
}

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[.’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/** Players named in a question, in the order they appear. Full names first, then unique last names. */
export function findPlayers(q: string, index: NameEntry[]): string[] {
  const text = norm(q)
  const hits: { id: string; at: number }[] = []
  const taken = new Set<string>()
  // players can share a full name: prefer the one on my roster, else the first
  const byFull = new Map<string, NameEntry[]>()
  for (const e of index) {
    const k = norm(e.full)
    if (k.trim()) byFull.set(k, [...(byFull.get(k) ?? []), e])
  }
  for (const [full, entries] of byFull) {
    const at = text.indexOf(full)
    if (at < 0) continue
    const e = entries.find((x) => x.mine) ?? entries[0]
    hits.push({ id: e.id, at })
    for (const x of entries) taken.add(x.id)
  }
  const byLast = new Map<string, NameEntry[]>()
  for (const e of index) {
    const parts = norm(e.full).trim().split(' ')
    const last = parts[parts.length - 1]
    if (last.length < 4) continue
    byLast.set(last, [...(byLast.get(last) ?? []), e])
  }
  for (const [last, entries] of byLast) {
    const at = text.indexOf(` ${last} `)
    if (at < 0) continue
    if (entries.some((e) => taken.has(e.id))) continue
    const pick = entries.length === 1 ? entries : entries.filter((e) => e.mine)
    if (pick.length !== 1) continue // ambiguous: ask with the full name
    hits.push({ id: pick[0].id, at })
    taken.add(pick[0].id)
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The question with the named players' full and last names blanked out. */
export function maskNames(q: string, ids: string[], index: NameEntry[]): string {
  let out = q
  for (const id of ids) {
    const full = index.find((e) => e.id === id)?.full
    if (!full) continue
    const last = full.trim().split(/\s+/).at(-1)!
    for (const n of [full, last]) out = out.replace(new RegExp(`\\b${escapeRe(n)}(['’]s)?\\b`, 'gi'), ' ')
  }
  return out
}

/* ---------------- follow-ups ---------------- */

export interface Context {
  players: string[]
  intent: Intent | null
}

export const EMPTY_CONTEXT: Context = { players: [], intent: null }

const FOLLOW_UP =
  /^(and|what about|how about|ok(ay)?|also|so|then)\b|\b(he|him|his|she|her|they|them|that guy|that player|instead|either|both)\b/i

export interface Parsed {
  intent: Intent
  players: string[]
  followUp: boolean
}

/** Resolves a question against the conversation so far ("what about him?", "and Kelce?"). */
export function parseQuestion(q: string, index: NameEntry[], ctx: Context): Parsed {
  const named = findPlayers(q, index)
  const followUp = FOLLOW_UP.test(q.trim())
  let players = named
  if (named.length === 0 && followUp) players = ctx.players
  // "what about X?" keeps the earlier comparison and swaps in the new player
  if (named.length === 1 && /^(what|how) about\b/i.test(q.trim()) && ctx.intent === 'startsit' && ctx.players.length > 1)
    players = [named[0], ...ctx.players.filter((id) => id !== named[0]).slice(1)]
  // names never decide the intent ("Jalen Hurts" is not an injury question)
  let intent = detectIntent(maskNames(q, named, index))
  if (!intent && followUp && ctx.intent) intent = ctx.intent
  if (!intent && players.length > 1) intent = 'startsit'
  if (!intent && players.length === 1) intent = 'projection'
  return { intent: intent ?? 'unknown', players, followUp }
}

/* ---------------- answers ---------------- */

export interface Part {
  text: string
  cite: string[]
  /** problems the checker found (AI answers only) */
  flags?: string[]
}

export interface Answer {
  intent: Intent
  players: string[]
  parts: Part[]
  uncertainty: string | null
  links: { label: string; to: string }[]
}

export interface AnswerDeps {
  facts: Fact[]
  name: (id: string) => string
  /** tools still loading / failed, in plain words */
  pending: string[]
  unavailable: string[]
}

const LABEL: Record<string, string> = {
  '/lineup': 'Lineup Optimizer',
  '/startsit': 'Start/Sit Simulator',
  '/waivers': 'Waiver Wire',
  '/trades': 'Trade War Room',
  '/injuries': 'Injury Center',
  '/breakouts': 'Breakout Radar',
  '/playoffs': 'Playoff Simulator',
  '/standings': 'Standings',
  '/keepers': 'Keeper Tools',
  '/news': 'News & Articles',
  '/scouting': 'Opponent Scouting',
  '/gameday': 'Game Day Mode',
  '/edge': 'The Edge',
  '/accuracy': 'Prediction Trust',
}

const UNCERTAINTY: Partial<Record<Intent, string>> = {
  startsit:
    'Projections are estimates, and a single play can swing a week. The ranges show how far outcomes usually spread.',
  lineup: 'Projections are estimates; the optimizer maximizes projected points, not guaranteed points.',
  projection:
    'Projections are estimates. Prediction Trust shows how far they have missed in past weeks.',
  matchup: 'Win probability is a model estimate from projected totals, not a guarantee.',
  scouting: 'Their lineup can still change before kickoff.',
  waivers:
    'Gains assume the projections hold over the next few weeks; claims also depend on waiver priority or bids.',
  trades:
    'Fairness uses FantasyCalc market values; whether the other manager accepts is unknown.',
  playoffs:
    'Simulated from projected weekly scores; custom tiebreakers are not modeled.',
  keepers: 'Keeper costs come from the rules you entered; Sleeper does not store them.',
  news: 'Headlines are shown as published; GameplanBlitz does not verify them.',
  injury: 'Designations can change up to kickoff; Questionable players often play.',
  weather: 'Forecasts change; weather is context only and is not applied to projections.',
}

const of = (facts: Fact[], topics: Topic[]) => facts.filter((f) => topics.includes(f.topic))
const about = (facts: Fact[], ids: string[]) => facts.filter((f) => f.players.some((p) => ids.includes(p)))
const linksFor = (cited: Fact[]) =>
  [...new Set(cited.map((f) => f.to))]
    .filter((to) => LABEL[to])
    .slice(0, 3)
    .map((to) => ({ label: LABEL[to], to }))

function missingNote(intent: Intent, d: AnswerDeps): string {
  const words: Partial<Record<Intent, string>> = {
    waivers: 'waivers',
    trades: 'trades',
    playoffs: 'playoff odds',
    news: 'news',
    keepers: 'keepers',
  }
  const w = words[intent]
  if (w && d.pending.includes(w)) return `The ${w} analysis is still loading. Ask again in a moment.`
  const failed = d.unavailable.find((u) => w && u.startsWith(w === 'news' ? 'roster news' : w.replace(/s$/, '')))
  if (failed) return `That data is unavailable right now: ${failed}.`
  const none: Partial<Record<Intent, string>> = {
    weather: 'No weather risk is flagged for your starters. Forecasts appear about 16 days before a game.',
    injury: 'No one on your roster has an injury designation in Sleeper right now.',
    trades: 'The Trade War Room found no trade that is fair on market value and improves your lineup.',
    waivers: 'No free agent improves your best lineup right now.',
    keepers: 'Keeper notes only apply in keeper and dynasty leagues with FantasyCalc values loaded.',
    news: 'No recent articles mention your players.',
    recap: 'Last week has no completed results to recap yet.',
    playoffs: 'There are no regular-season weeks left to simulate.',
    scouting: 'No opponent is posted for this week.',
  }
  return none[intent] ?? "I don't have data on that right now."
}

/** Lead fact for a player: the engine projection when published, else Sleeper's via the lineup. */
function projOf(facts: Fact[], id: string): { f: Fact; value: number; floor?: number; ceiling?: number } | null {
  const e = facts.find((f) => f.topic === 'projection' && f.players[0] === id && f.data?.value !== undefined)
  if (e)
    return {
      f: e,
      value: Number(e.data!.value),
      floor: e.data!.floor !== undefined ? Number(e.data!.floor) : undefined,
      ceiling: e.data!.ceiling !== undefined ? Number(e.data!.ceiling) : undefined,
    }
  const l = facts.find((f) => f.topic === 'lineup' && f.players[0] === id && f.data?.proj !== undefined)
  if (l)
    return {
      f: l,
      value: Number(l.data!.proj),
      floor: l.data!.floor !== undefined ? Number(l.data!.floor) : undefined,
      ceiling: l.data!.ceiling !== undefined ? Number(l.data!.ceiling) : undefined,
    }
  return null
}

function compare(ids: string[], d: AnswerDeps): Answer | null {
  const rows = ids.map((id) => ({ id, p: projOf(d.facts, id) })).filter((r) => r.p) as {
    id: string
    p: NonNullable<ReturnType<typeof projOf>>
  }[]
  if (rows.length < 2) return null
  const matchup = d.facts.find((f) => f.topic === 'matchup' && f.data?.winPct !== undefined)
  const win = matchup ? Number(matchup.data!.winPct) : null
  const lean = leanFor(win)
  const key = (r: (typeof rows)[number]) =>
    lean === 'floor' && rows.every((x) => x.p.floor !== undefined)
      ? r.p.floor!
      : lean === 'ceiling' && rows.every((x) => x.p.ceiling !== undefined)
        ? r.p.ceiling!
        : r.p.value
  const sorted = [...rows].sort((a, b) => key(b) - key(a))
  const [best, next] = sorted
  const used = lean === 'floor' && best.p.floor !== undefined && next.p.floor !== undefined ? 'floor' : lean === 'ceiling' && best.p.ceiling !== undefined && next.p.ceiling !== undefined ? 'ceiling' : 'median'
  const parts: Part[] = [
    {
      text: `Start ${d.name(best.id)}. ${d.name(best.id)} projects ${f1(best.p.value)} pts to ${f1(next.p.value)} for ${d.name(next.id)}.`,
      cite: [best.p.f.id, next.p.f.id],
    },
  ]
  if (used !== 'median' && matchup)
    parts.push({
      text:
        used === 'floor'
          ? `You're favored this week (${win}% win probability), so the safer floor matters most: ${f1(best.p.floor)} for ${d.name(best.id)} vs ${f1(next.p.floor)}.`
          : `You're the underdog this week (${win}% win probability), so upside matters most: a ceiling of ${f1(best.p.ceiling)} for ${d.name(best.id)} vs ${f1(next.p.ceiling)}.`,
      cite: [matchup.id, best.p.f.id, next.p.f.id],
    })
  for (const r of rows.slice(2))
    parts.push({ text: `${d.name(r.id)} projects ${f1(r.p.value)} pts.`, cite: [r.p.f.id] })
  for (const f of of(about(d.facts, ids), ['injury', 'weather', 'news']).slice(0, 3))
    parts.push({ text: f.text, cite: [f.id] })
  const overlap =
    best.p.floor !== undefined && next.p.ceiling !== undefined && next.p.ceiling > best.p.floor
  return {
    intent: 'startsit',
    players: ids,
    parts,
    uncertainty: overlap
      ? 'Their ranges overlap, so either player can outscore the other. The Start/Sit Simulator shows how often.'
      : UNCERTAINTY.startsit!,
    links: [{ label: 'Start/Sit Simulator', to: '/startsit' }, { label: 'Lineup Optimizer', to: '/lineup' }],
  }
}

function single(id: string, d: AnswerDeps): Answer {
  const mine = about(d.facts, [id])
  const swapIn = mine.find((f) => f.data?.role === 'swap' && f.players[0] === id)
  const swapOut = mine.find((f) => f.data?.role === 'swap' && f.players[1] === id)
  const starter = mine.find((f) => f.data?.role === 'starter')
  const bench = mine.find((f) => f.data?.role === 'bench')
  const waiver = mine.find((f) => f.topic === 'waivers' && f.players[0] === id)
  const p = projOf(d.facts, id)
  const lead: Part = swapIn
    ? { text: `Yes. ${swapIn.text}`, cite: [swapIn.id] }
    : swapOut
      ? { text: `No. ${swapOut.text}`, cite: [swapOut.id] }
      : starter
        ? { text: `Yes, ${d.name(id)} is in your best projected lineup. ${starter.text}`, cite: [starter.id] }
        : bench
          ? { text: `No, ${d.name(id)} isn't in your best projected lineup. ${bench.text}`, cite: [bench.id] }
          : waiver
            ? { text: `${d.name(id)} isn't on your roster. ${waiver.text}`, cite: [waiver.id] }
            : p
              ? { text: p.f.text, cite: [p.f.id] }
              : { text: `${d.name(id)} isn't on your roster, and the tools have no recommendation about that player this week.`, cite: [] }
  const extra = mine.filter((f) => !lead.cite.includes(f.id) && ['projection', 'injury', 'weather', 'news'].includes(f.topic)).slice(0, 3)
  const used = mine.filter((f) => lead.cite.includes(f.id) || extra.includes(f))
  return {
    intent: 'startsit',
    players: [id],
    parts: [lead, ...extra.map((f) => ({ text: f.text, cite: [f.id] }))],
    uncertainty: UNCERTAINTY.lineup!,
    links: linksFor(used).length ? linksFor(used) : [{ label: 'Lineup Optimizer', to: '/lineup' }],
  }
}

/** The built-in engine: arranges cited facts into an answer. It never writes a number of its own. */
export function answerLocally(q: Parsed, d: AnswerDeps): Answer {
  const { players } = q
  // a start/sit question without a player is a lineup question
  const intent: Intent = q.intent === 'startsit' && players.length === 0 ? 'lineup' : q.intent
  if (intent === 'action') {
    const facts = [...of(d.facts, ['lineup']).filter((f) => f.data?.role === 'swap'), ...of(d.facts, ['waivers', 'trades'])].slice(0, 3)
    return {
      intent,
      players,
      parts: [
        {
          text: "GameplanBlitz is read-only: I can't add, drop, trade or change your lineup, and nothing has been changed. Make moves in the Sleeper app. Here is what the tools recommend:",
          cite: [],
        },
        ...facts.map((f) => ({ text: f.text, cite: [f.id] })),
      ],
      uncertainty: null,
      links: linksFor(facts),
    }
  }
  if (intent === 'startsit') {
    if (players.length >= 2) {
      const c = compare(players, d)
      if (c) return c
    }
    if (players.length >= 1) return single(players[0], d)
  }
  if (intent === 'summary') {
    const pick = [
      d.facts.find((f) => f.topic === 'matchup' && f.kind === 'model'),
      ...d.facts.filter((f) => f.data?.role === 'swap').slice(0, 2),
      ...d.facts.filter((f) => f.topic === 'injury' && f.text.includes('starting lineup')).slice(0, 2),
      d.facts.find((f) => f.topic === 'waivers'),
      d.facts.find((f) => f.topic === 'playoffs'),
    ].filter((f): f is Fact => !!f)
    if (pick.length === 0)
      return { intent, players, parts: [{ text: "The tools haven't produced anything for this week yet.", cite: [] }], uncertainty: null, links: [] }
    return {
      intent,
      players,
      parts: [{ text: 'Here is your week, most urgent first:', cite: [] }, ...pick.map((f) => ({ text: f.text, cite: [f.id] }))],
      uncertainty: UNCERTAINTY.lineup!,
      links: [{ label: 'The Edge', to: '/edge' }, ...linksFor(pick)].slice(0, 3),
    }
  }
  if (intent === 'unknown')
    return {
      intent,
      players,
      parts: [
        {
          text: 'I can answer questions about your lineup, start/sit calls, projections, injuries, weather, waivers, trades, keepers, your opponent, standings and playoff odds, using your league data. Try "Who should I start at RB?" or "Should I pick anyone up?"',
          cite: [],
        },
      ],
      uncertainty: null,
      links: [],
    }

  const topics = TOPICS[intent] ?? []
  let pool = of(d.facts, topics)
  if (players.length) {
    const focused = about(pool, players)
    if (focused.length) pool = [...focused, ...pool.filter((f) => !focused.includes(f) && f.players.length === 0)]
    else if (intent === 'injury')
      // the player book has no designation for them: say so rather than list other players
      return {
        intent,
        players,
        parts: [{ text: `Sleeper lists no injury designation for ${players.map(d.name).join(' or ')}.`, cite: [] }],
        uncertainty: UNCERTAINTY.injury!,
        links: [{ label: 'Injury Center', to: '/injuries' }],
      }
  }
  if (intent === 'lineup') pool = [...pool.filter((f) => f.data?.role === 'swap' || !f.players.length), ...pool.filter((f) => f.data?.role === 'starter')]
  if (pool.length === 0)
    return {
      intent,
      players,
      parts: [{ text: missingNote(intent, d), cite: [] }],
      uncertainty: null,
      links: [],
    }
  const picked = pool.slice(0, intent === 'standings' ? 12 : 5)
  return {
    intent,
    players,
    parts: picked.map((f) => ({ text: f.text, cite: [f.id] })),
    uncertainty: UNCERTAINTY[intent] ?? null,
    links: linksFor(picked),
  }
}

/* ---------------- checking AI answers ---------------- */

const CITE = /\[(F\d{1,4})\]/g

/**
 * Splits an AI answer into paragraphs/bullets, pulls out [F#] citations and flags anything the
 * fact sheet doesn't support: citations to facts that don't exist, and numbers that none of the
 * paragraph's cited facts contain (or any number at all in a paragraph that cites nothing).
 */
export function checkAiAnswer(text: string, facts: Fact[]): Part[] {
  const byId = new Map(facts.map((f) => [f.id, f]))
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const ids = [...raw.matchAll(CITE)].map((x) => x[1])
      const cite = [...new Set(ids.filter((id) => byId.has(id)))]
      const unknown = [...new Set(ids.filter((id) => !byId.has(id)))]
      const clean = raw.replace(CITE, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
      const flags: string[] = []
      if (unknown.length) flags.push(`Cites facts that don't exist (${unknown.join(', ')}).`)
      const nums = unsupportedNumbers(clean, cite.map((id) => byId.get(id)!))
      if (nums.length)
        flags.push(
          `Couldn't verify ${nums.map((n) => String(n)).join(', ')} against ${cite.length ? 'the cited facts' : 'any cited fact'}.`,
        )
      return { text: clean, cite, ...(flags.length ? { flags } : {}) }
    })
}

/** An AI answer, checked against the facts, in the same shape as a built-in one. */
export function aiAnswer(q: Parsed, text: string, facts: Fact[]): Answer {
  const parts = checkAiAnswer(text, facts)
  const ids = new Set(parts.flatMap((p) => p.cite))
  return {
    intent: q.intent,
    players: q.players,
    parts,
    uncertainty: UNCERTAINTY[q.intent] ?? null,
    links: linksFor(facts.filter((f) => ids.has(f.id))),
  }
}

/** Suggested questions from the user's own data (the closest start/sit call first). */
export function suggestions(facts: Fact[], name: (id: string) => string): string[] {
  const out: string[] = []
  const swap = facts.find((f) => f.data?.role === 'swap' && f.players.length === 2)
  const starters = facts.filter((f) => f.data?.role === 'starter' && /\((RB|WR|TE),/.test(f.text))
  const bench = facts.filter((f) => f.data?.role === 'bench' && /\((RB|WR|TE),/.test(f.text))
  if (swap) out.push(`Should I start ${name(swap.players[0])} or ${name(swap.players[1])}?`)
  else if (starters.length && bench.length) {
    const weakest = [...starters].sort((a, b) => Number(a.data!.proj) - Number(b.data!.proj))[0]
    out.push(`Should I start ${name(weakest.players[0])} or ${name(bench[0].players[0])}?`)
  }
  out.push('What should I focus on this week?')
  if (facts.some((f) => f.topic === 'waivers')) out.push('Who should I pick up?')
  if (facts.some((f) => f.topic === 'injury')) out.push('Any injury concerns in my lineup?')
  if (facts.some((f) => f.topic === 'matchup')) out.push('How does my matchup look?')
  if (facts.some((f) => f.topic === 'playoffs')) out.push('What are my playoff odds?')
  if (facts.some((f) => f.topic === 'trades')) out.push('Any trade ideas?')
  return out.slice(0, 6)
}
