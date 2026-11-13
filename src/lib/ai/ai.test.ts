import { rateConfidence } from '../evidence'
import type { LineupAnalysis } from '../analytics/lineupAnalysis'
import type { Candidate, SlotPlan } from '../analytics/lineupPlan'
import { f1 } from '../format'
import { gameDay } from '../insights'
import { buildModel, player, roster } from '../../test/fixtures'
import {
  answerLocally,
  checkAiAnswer,
  detectIntent,
  EMPTY_CONTEXT,
  findPlayers,
  parseQuestion,
  type AnswerDeps,
  type NameEntry,
} from './assistant'
import { buildFacts, numbersIn, unsupportedNumbers, type Fact, type FactInput } from './facts'
import { tickerItems } from './episode'
import { buildOutline, checkScript, EDITIONS, HOSTS, speakable, writeScript } from './podcast'
import { canSpend, LOCAL_LIMITS, record, remainingToday } from './quota'

/* League: my RBs Rusher Runnerson (8, Questionable) and Backup Benchwood (3), WR Wideout
   Catchwell (10); the rival starts Rival Runningback (6). Free agent Free Agentson. */
const P = {
  rb1: player('rb1', 'RB', { first_name: 'Rusher', last_name: 'Runnerson', injury_status: 'Questionable' }),
  rb2: player('rb2', 'RB', { first_name: 'Backup', last_name: 'Benchwood' }),
  wr1: player('wr1', 'WR', { first_name: 'Wideout', last_name: 'Catchwell' }),
  opp1: player('opp1', 'RB', { first_name: 'Rival', last_name: 'Runningback' }),
  fa1: player('fa1', 'RB', { first_name: 'Free', last_name: 'Agentson', team: 'BBB' }),
}
const m = buildModel({
  players: P,
  rosters: [
    roster(1, 'u1', ['rb1', 'rb2', 'wr1'], { wins: 3, losses: 1, fpts: 400 }),
    roster(2, 'u2', ['opp1'], { wins: 1, losses: 3, fpts: 300 }),
  ],
  startSlots: ['RB', 'WR'],
  proj: { rb1: 8, rb2: 3, wr1: 10, opp1: 6, fa1: 12 },
})
const matchups = [
  { roster_id: 1, matchup_id: 9, points: 0, starters: ['rb1', 'wr1'], players: ['rb1', 'rb2', 'wr1'] },
  { roster_id: 2, matchup_id: 9, points: 0, starters: ['opp1'], players: ['opp1'] },
]
const cand = (id: string, o: Partial<Candidate> = {}): Candidate => ({
  id, name: m.name(id), pos: m.pos(id), team: 'AAA', opponent: 'CCC', proj: m.projPts(id), sd: null, floor: null, ceiling: null, n: 4, injury: m.injury(id), out: false, bye: false, started: false, usage: null, matchup: null, ...o,
})
const slot = (o: Partial<SlotPlan>): SlotPlan => ({
  slot: 'RB', label: 'RB', current: null, recommended: null, locked: false, changed: false, move: false, partner: null, delta: 0, reasons: [], evidence: [], confidence: null, ...o,
})
const lineup = (slots: SlotPlan[], extra: Candidate[] = []): LineupAnalysis => ({
  plan: { mode: 'projection', slots, start: [], sit: [], current: { proj: 18, sd: null, floor: null, ceiling: null }, recommended: { proj: 18, sd: null, floor: null, ceiling: null } },
  candidates: [cand('rb1'), cand('rb2'), cand('wr1'), ...extra], provider: 'testco', historyWeeks: 4, hasSchedule: true,
})
const engine = (id: string) => ({ rb1: { value: 8.4, baseline: 8, floor: 4.1, ceiling: 12.6 }, rb2: { value: 3.2, baseline: 3, floor: 0.5, ceiling: 7.9 }, wr1: { value: 10.6, baseline: 10, floor: 5.2, ceiling: 16.3 } } as Record<string, { value: number; baseline: number; floor: number; ceiling: number }>)[id] ?? null

const input = (o: Partial<FactInput> = {}): FactInput => ({
  m,
  week: 5,
  gd: gameDay(m, matchups),
  live: null,
  lineup: lineup([
    slot({ current: cand('rb1', { floor: 4, ceiling: 12 }), recommended: cand('rb1') }),
    slot({ slot: 'WR', label: 'WR', current: cand('wr1'), recommended: cand('wr1') }),
  ]),
  waivers: null,
  trades: null,
  h2h: null,
  playoff: { rosterId: 1, playoffPct: 72.4, byePct: 0, firstSeedPct: 40, championPct: 31.2, avgWins: 8.1, avgSeed: 1.6, seedPct: [] },
  playoffTeams: 1,
  myNews: [],
  keepers: null,
  keeperLeague: false,
  extras: [],
  engine,
  lastWeek: {
    week: 4,
    matchups: [
      { roster_id: 1, matchup_id: 3, points: 101.5, starters: ['rb1', 'wr1'], players: [], players_points: { rb1: 22.4, wr1: 9.1 } },
      { roster_id: 2, matchup_id: 3, points: 88.2, starters: ['opp1'], players: [] },
    ],
  },
  stamps: { sleeper: 1_000, projections: 2_000, values: null, news: null, model: 3_000 },
  ...o,
})

const names: NameEntry[] = Object.keys(P).map((id) => ({ id, full: m.name(id), mine: ['rb1', 'rb2', 'wr1'].includes(id) }))
const deps = (facts: Fact[], o: Partial<AnswerDeps> = {}): AnswerDeps => ({ facts, name: m.name, pending: [], unavailable: [], ...o })
const cited = (facts: Fact[], ids: string[]) => facts.filter((f) => ids.includes(f.id))

describe('fact sheet', () => {
  const facts = buildFacts(input())

  it('numbers facts F1.. in topic order, each with a source and a kind', () => {
    expect(facts.map((f) => f.id)).toEqual(facts.map((_, i) => `F${i + 1}`))
    expect(facts[0].topic).toBe('matchup')
    for (const f of facts) {
      expect(f.source).not.toBe('')
      expect(['fact', 'model']).toContain(f.kind)
    }
  })

  it('states Sleeper facts and model outputs separately', () => {
    const opp = facts.find((f) => f.text.startsWith('Week 5 opponent'))!
    expect(opp).toMatchObject({ kind: 'fact', text: 'Week 5 opponent: Rival (1-3, 2nd place).' })
    const proj = facts.find((f) => f.text.startsWith('Projected Week 5 score'))!
    expect(proj.kind).toBe('model')
    expect(proj.text).toContain('My Team 18.0, Rival 6.0')
    expect(facts.find((f) => f.topic === 'injury')!.text).toBe(
      'Sleeper lists Rusher Runnerson (RB, AAA) as Questionable and in your starting lineup.',
    )
    expect(facts.filter((f) => f.topic === 'standings').map((f) => f.text)).toEqual([
      'Standings: 1st My Team (you), 3-1, 400.0 points for, 0.0 against.',
      'Standings: 2nd Rival, 1-3, 300.0 points for, 0.0 against.',
      '1 of 2 teams make the playoffs.',
    ])
  })

  it('includes the projection engine, last week and timestamps', () => {
    const e = facts.find((f) => f.topic === 'projection' && f.players[0] === 'rb1')!
    expect(e.text).toBe(
      "GameplanBlitz projection for Rusher Runnerson (RB) in Week 5: 8.4 pts, 80% range 4.1 to 12.6; Sleeper's projection 8.0.",
    )
    expect(e.asOf).toBe(3_000)
    expect(facts.filter((f) => f.topic === 'recap').map((f) => f.text)).toEqual([
      'Week 4 result: My Team 101.5, Rival 88.2: a win.',
      'Your top scorer in Week 4: Rusher Runnerson with 22.4 pts.',
      'Your second-best starter in Week 4: Wideout Catchwell with 9.1 pts.',
      'Week 4 high score: My Team with 101.5. Low score: Rival with 88.2.',
    ])
  })

  it("every machine-readable value is also written in the fact's text", () => {
    for (const f of facts)
      for (const v of Object.values(f.data ?? {}))
        if (typeof v === 'number') expect(unsupportedNumbers(f1(v), [f])).toEqual([])
  })

  it('omits engine facts when the model is not published and caps the sheet', () => {
    expect(buildFacts(input({ engine: null })).some((f) => f.topic === 'projection')).toBe(false)
  })
})

describe('numbers', () => {
  it('reads signed, decimal and percent numbers and ignores small counts', () => {
    expect(numbersIn('+4.0 pts, −1.5, 92% and 12')).toEqual([4, -1.5, 92, 12])
    const f = [{ text: 'projection 8.4 pts, win probability 92%' } as Fact]
    expect(unsupportedNumbers('He projects 8.4 and you are 92% to win with 2 starters', f)).toEqual([])
    expect(unsupportedNumbers('He projects 9.1', f)).toEqual([9.1])
  })
})

describe('questions', () => {
  it('detects intents', () => {
    expect(detectIntent('Should I start Runnerson?')).toBe('startsit')
    expect(detectIntent('Who should I pick up?')).toBe('waivers')
    expect(detectIntent('What are my playoff odds?')).toBe('playoffs')
    expect(detectIntent('Will I win this week?')).toBe('matchup')
    expect(detectIntent('Is it going to rain in Buffalo?')).toBe('weather')
    expect(detectIntent('Drop Benchwood for me')).toBe('action')
    expect(detectIntent('Make the trade with Rival')).toBe('action')
    // the GM's longer memory and new question types
    expect(detectIntent('What happens if I trade Derrick Henry?')).toBe('tradeImpact')
    expect(detectIntent('Find a realistic trade partner.')).toBe('partner')
    expect(detectIntent('Which players are trending upward?')).toBe('trend')
    expect(detectIntent('How can I improve my championship chances?')).toBe('improve')
    expect(detectIntent('What did you recommend last week?')).toBe('memory')
    expect(detectIntent('What is my strategy?')).toBe('memory')
    expect(detectIntent('How lucky have I been?')).toBe('history')
    expect(detectIntent('Who should I start this week?')).toBe('startsit')
  })

  it('finds players by full name, last name and possessive, in order', () => {
    expect(findPlayers('Catchwell or Rusher Runnerson?', names)).toEqual(['wr1', 'rb1'])
    expect(findPlayers("How's Benchwood's ankle?", names)).toEqual(['rb2'])
    expect(findPlayers('the runner', names)).toEqual([])
  })

  it('resolves two players with the same full name to one, preferring my roster', () => {
    const twins: NameEntry[] = [{ id: 'a', full: 'Mike Williams', mine: false }, { id: 'b', full: 'Mike Williams', mine: true }]
    expect(findPlayers('Should I start Mike Williams?', twins)).toEqual(['b'])
    expect(findPlayers('Mike Williams?', [{ ...twins[0] }, { ...twins[1], mine: false }])).toEqual(['a'])
  })

  it('leaves an ambiguous last name to the roster player, else unresolved', () => {
    const dup: NameEntry[] = [...names, { id: 'x', full: 'Other Runnerson', mine: false }]
    expect(findPlayers('Runnerson?', dup)).toEqual(['rb1'])
    const both: NameEntry[] = [{ id: 'a', full: 'Al Smithers', mine: false }, { id: 'b', full: 'Bo Smithers', mine: false }]
    expect(findPlayers('Smithers?', both)).toEqual([])
  })

  it('never reads an intent from a player name', () => {
    const idx: NameEntry[] = [...names, { id: 'qb', full: 'Jalen Hurts', mine: true }, { id: 'k', full: 'Harrison Butker', mine: false }]
    expect(parseQuestion('Should I start Catchwell or Jalen Hurts?', idx, EMPTY_CONTEXT)).toMatchObject({ intent: 'startsit', players: ['wr1', 'qb'] })
    expect(parseQuestion("How's Hurts' outlook?", idx, EMPTY_CONTEXT).intent).toBe('projection')
    expect(parseQuestion('Is Hurts injured?', idx, EMPTY_CONTEXT).intent).toBe('injury')
  })

  it('follows up on pronouns and "what about"', () => {
    const q1 = parseQuestion('Should I start Runnerson or Catchwell?', names, EMPTY_CONTEXT)
    expect(q1).toMatchObject({ intent: 'startsit', players: ['rb1', 'wr1'] })
    const q2 = parseQuestion('Is he hurt?', names, { players: ['rb1'], intent: 'startsit' })
    expect(q2).toMatchObject({ intent: 'injury', players: ['rb1'], followUp: true })
    const q3 = parseQuestion('What about Benchwood?', names, { players: ['rb1', 'wr1'], intent: 'startsit' })
    expect(q3).toMatchObject({ intent: 'startsit', players: ['rb2', 'wr1'] })
    const q4 = parseQuestion('and Agentson?', names, { players: ['rb1'], intent: 'projection' })
    expect(q4).toMatchObject({ intent: 'projection', players: ['fa1'] })
  })
})

describe('built-in answers', () => {
  const facts = buildFacts(input())
  const ask = (q: string, o?: Partial<AnswerDeps>, ctx = EMPTY_CONTEXT) =>
    answerLocally(parseQuestion(q, names, ctx), deps(facts, o))

  it('compares two players on the engine projection and leans to the floor when favored', () => {
    const a = ask('Runnerson or Benchwood at RB?')
    expect(a.parts[0].text).toBe('Start Rusher Runnerson. Rusher Runnerson projects 8.4 pts to 3.2 for Backup Benchwood.')
    expect(a.parts[1].text).toMatch(/^You're favored this week \(\d+% win probability\), so the safer floor matters most: 4.1 for Rusher Runnerson vs 0.5\.$/)
    expect(a.links[0]).toEqual({ label: 'Start/Sit Simulator', to: '/startsit' })
    expect(a.parts.some((p) => p.text.includes('Questionable'))).toBe(true)
  })

  it('never writes a number that its cited facts do not contain', () => {
    const qs = [
      'Runnerson or Benchwood?',
      'Should I start Catchwell?',
      'Should I start Benchwood?',
      'What are my playoff odds?',
      'How did I do last week?',
      'What should I do this week?',
      'Will I win?',
      'Who should I start?',
      'What does the model project for Catchwell?',
      'Standings?',
      'Is anyone injured?',
    ]
    for (const q of qs) {
      const a = ask(q)
      for (const p of a.parts) expect([q, unsupportedNumbers(p.text, cited(facts, p.cite))]).toEqual([q, []])
    }
  })

  it('answers single-player start questions from the optimizer', () => {
    expect(ask('Should I start Benchwood?').parts[0].text).toMatch(/^No, Backup Benchwood isn't in your best projected lineup\./)
    expect(ask('Should I start Catchwell?').parts[0].text).toMatch(/^Yes, Wideout Catchwell is in your best projected lineup\./)
  })

  it('says when a named player has no injury designation instead of listing others', () => {
    const a = ask('Is he hurt?', {}, { players: ['wr1'], intent: 'startsit' })
    expect(a.parts).toEqual([{ text: 'Sleeper lists no injury designation for Wideout Catchwell.', cite: [] }])
  })

  it('is read-only: it never claims to make a move', () => {
    const a = ask('Drop Benchwood for me')
    expect(a.intent).toBe('action')
    expect(a.parts[0].text).toContain("can't add, drop, trade or change your lineup, and nothing has been changed")
  })

  it('says what is missing instead of guessing', () => {
    expect(ask('Who should I pick up?', { pending: ['waivers'] }).parts[0].text).toBe(
      'The waivers analysis is still loading. Ask again in a moment.',
    )
    expect(ask('Any trade ideas?', { unavailable: ['trade ideas (FantasyCalc values failed to load)'] }).parts[0].text).toBe(
      'That data is unavailable right now: trade ideas (FantasyCalc values failed to load).',
    )
    expect(ask('What is the weather?').parts[0].text).toMatch(/^No weather risk is flagged/)
    expect(ask('Who wins the Super Bowl lottery jackpot?').intent).toBe('unknown')
  })

  it('cites the swap the optimizer recommends', () => {
    const swap = buildFacts(
      input({
        lineup: lineup([
          slot({ changed: true, current: cand('rb1', { out: true, injury: 'Out' }), recommended: cand('rb2'), partner: cand('rb1'), delta: 3, confidence: rateConfidence({ marginZ: 1, sampleOk: true, injuryFlag: false }) }),
          slot({ slot: 'WR', label: 'WR', current: cand('wr1'), recommended: cand('wr1') }),
        ]),
      }),
    )
    const a = answerLocally(parseQuestion('Should I start Benchwood?', names, EMPTY_CONTEXT), deps(swap))
    expect(a.parts[0].text).toMatch(/^Yes\. Lineup Optimizer recommends starting Backup Benchwood at RB instead of Rusher Runnerson: \+3\.0 projected pts/)
  })
})

describe('checking AI answers', () => {
  const facts = buildFacts(input())
  const proj = facts.find((f) => f.topic === 'projection' && f.players[0] === 'rb1')!

  it('extracts citations and strips the markers', () => {
    const parts = checkAiAnswer(`Runnerson projects 8.4 pts [${proj.id}].\n\nMy take: start him.`, facts)
    expect(parts).toEqual([
      { text: 'Runnerson projects 8.4 pts.', cite: [proj.id] },
      { text: 'My take: start him.', cite: [] },
    ])
  })

  it('flags unknown citations and numbers the cited facts do not contain', () => {
    const [p] = checkAiAnswer(`Runnerson projects 14.5 pts [${proj.id}][F999].`, facts)
    expect(p.flags).toEqual(["Cites facts that don't exist (F999).", "Couldn't verify 14.5 against the cited facts."])
    const [q] = checkAiAnswer('He scores 30 points.', facts)
    expect(q.flags).toEqual(["Couldn't verify 30 against any cited fact."])
  })
})

describe('podcast', () => {
  const facts = buildFacts(input())
  const opts = { type: 'preview' as const, format: 'debate' as const, tone: 'humor' as const, leagueName: 'Test League', week: 5, seed: 7 }

  it('outlines only chapters the tools have facts for', () => {
    const o = buildOutline('preview', facts)
    expect(o.chapters.map((c) => c.id)).toEqual(['matchup', 'lineup', 'risk', 'race'])
    expect(o.skipped).toEqual(['Scouting the opponent', 'This Week Around the League']) // no league facts in this fixture
    const recap = buildOutline('recap', facts)
    expect(recap.chapters[0]).toMatchObject({ id: 'result', title: 'Last week’s result' })
    expect(buildOutline('moves', facts).chapters).toEqual([])
  })

  it('opens and closes with the AI disclosure and reads facts verbatim with citations', () => {
    const lines = writeScript(buildOutline('preview', facts).chapters, facts, opts)
    expect(lines[0]).toMatchObject({ kind: 'disclosure' })
    expect(lines[0].text).toContain('fictional hosts with AI-generated voices')
    expect(lines.at(-1)!.text).toContain('the hosts and voices are AI-generated, nothing here changes your roster')
    const byId = new Map(facts.map((f) => [f.id, f]))
    for (const l of lines.filter((l) => l.kind === 'fact')) {
      expect(l.cite).toHaveLength(1)
      expect(l.text.endsWith(byId.get(l.cite[0])!.text)).toBe(true)
    }
  })

  it('keeps opinions and banter free of numbers and alternates hosts in a debate', () => {
    const lines = writeScript(buildOutline('preview', facts).chapters, facts, opts)
    for (const l of lines.filter((l) => l.kind === 'opinion' || l.kind === 'banter'))
      expect([l.text, unsupportedNumbers(l.text, [])]).toEqual([l.text, []])
    expect(new Set(lines.map((l) => l.speaker))).toEqual(new Set([0, 1]))
    expect(lines.some((l) => l.speaker === 1 && l.kind === 'opinion')).toBe(true)
    // deterministic for the same seed; solo uses one host
    expect(writeScript(buildOutline('preview', facts).chapters, facts, opts)).toEqual(lines)
    expect(new Set(writeScript(buildOutline('preview', facts).chapters, facts, { ...opts, format: 'solo' }).map((l) => l.speaker))).toEqual(new Set([0]))
  })

  it('leaves out chapters the user unticked', () => {
    const chapters = buildOutline('preview', facts).chapters.map((c) => ({ ...c, include: c.id !== 'lineup' }))
    expect(writeScript(chapters, facts, opts).some((l) => l.chapter === 'lineup')).toBe(false)
  })

  it('checks AI-written lines against the facts', () => {
    const proj = facts.find((f) => f.topic === 'projection')!
    const lines = checkScript(
      [
        { speaker: 'A', kind: 'fact', chapter: 'matchup', text: 'Runnerson projects 8.4.', cite: [proj.id] },
        { speaker: 'B', kind: 'fact', chapter: 'matchup', text: 'He will score 40.', cite: [] },
        { speaker: 'B', kind: 'banter', chapter: 'matchup', text: 'Big week!', cite: ['F999'] },
      ],
      facts,
      { hosts: HOSTS, format: 'debate', leagueName: 'L', week: 5 },
    )
    expect(lines[0].kind).toBe('disclosure')
    expect(lines.at(-1)!.kind).toBe('disclosure')
    expect(lines[1].flags).toBeUndefined()
    expect(lines[2]).toMatchObject({ speaker: 1, flags: ['Stated as fact without a citation.', "Couldn't verify 40 against the cited facts."] })
    expect(lines[3].flags).toEqual(["Cites facts that don't exist (F999)."])
  })

  it('makes text speakable without changing the transcript', () => {
    expect(speakable('+3.0 pts vs CCC; −1.5 per wk')).toBe('plus 3.0 points versus CCC, minus 1.5 per week')
  })
})

describe('local AI allowance', () => {
  beforeEach(() => localStorage.clear())
  it('counts per day and resets the next day', () => {
    const d1 = new Date(2026, 10, 12, 10)
    record('chat', LOCAL_LIMITS.chat - 1, d1)
    expect(remainingToday('chat', d1)).toBe(1)
    expect(canSpend('chat', 2, d1)).toBe(false)
    expect(remainingToday('chat', new Date(2026, 10, 13, 9))).toBe(LOCAL_LIMITS.chat)
  })
})

describe('broadcast view and editions', () => {
  it('builds the score ticker from the league results quoted in an episode', () => {
    const f = (topic: Fact['topic'], text: string) => ({ id: 'F1', topic, kind: 'fact', text, source: '', asOf: null, players: [], to: '' }) as Fact
    expect(
      tickerItems([
        f('league', 'Week 4: Gridiron Gang 102.4 def. Rival 101.9. Rusher Runnerson led Gridiron Gang with 30.0.'),
        f('league', 'Week 4 highest score: Gridiron Gang with 102.4.'),
        f('recap', 'Week 4: you won.'),
      ]),
    ).toEqual(['Gridiron Gang 102.4 def. Rival 101.9'])
  })

  it('offers 5, 10 and 20 minute editions, and the extended one adds chapters', () => {
    expect(EDITIONS.map((e) => e.minutes)).toEqual([5, 10, 20])
    const facts = [
      { id: 'F1', topic: 'recap', kind: 'fact', text: 'You won.', source: '', asOf: null, players: [], to: '' },
      { id: 'F2', topic: 'history', kind: 'fact', text: 'Your moves this season: 1 trade.', source: '', asOf: null, players: [], to: '' },
    ] as Fact[]
    expect(buildOutline('recap', facts, 'standard').chapters.map((c) => c.id)).toEqual(['result'])
    expect(buildOutline('recap', facts, 'extended').chapters.map((c) => c.id)).toEqual(['result', 'season'])
  })
})
