import { Bot, Database, MessageSquareText, ShieldCheck, Sparkles } from 'lucide-react'

import { GmChat } from '../components/ai/GmChat'
import { CARD, PAD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { useFactSheet, type FactSheet } from '../hooks/useFactSheet'
import type { Ready } from '../hooks/useLeagueData'
import { aiConfigured } from '../lib/ai/client'
import type { Topic } from '../lib/ai/facts'
import { LOCAL_LIMITS } from '../lib/ai/quota'
import { relTime } from '../lib/format'
import { useAppStore } from '../store/app'

const TOPIC_LABEL: Record<Topic, string> = {
  matchup: 'Matchup',
  lineup: 'Lineup',
  injury: 'Injuries',
  weather: 'Weather',
  projection: 'Projections',
  waivers: 'Waivers',
  breakout: 'Breakouts',
  trades: 'Trades',
  playoffs: 'Playoff odds',
  standings: 'Standings',
  keepers: 'Keepers',
  news: 'News',
  recap: 'Last week',
  scouting: 'Opponent',
}

function Knowledge({ sheet }: { sheet: FactSheet }) {
  const counts = new Map<Topic, number>()
  for (const f of sheet.facts) counts.set(f.topic, (counts.get(f.topic) ?? 0) + 1)
  const latest = (pred: (s: string) => boolean) =>
    Math.max(0, ...sheet.facts.filter((f) => pred(f.source)).map((f) => f.asOf ?? 0)) || null
  const fresh = [
    ['Sleeper rosters & standings', latest((s) => s.startsWith('Sleeper') && !s.includes('projection'))],
    ['Sleeper projections', latest((s) => s.includes('Sleeper projections'))],
    ['GameplanBlitz model', latest((s) => s.includes('projection engine'))],
    ['News feed', Math.max(0, ...sheet.facts.filter((f) => f.topic === 'news').map((f) => f.asOf ?? 0)) || null],
  ] as const
  return (
    <section aria-label="What the GM knows" className={`${CARD} ${PAD}`}>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
        <Database size={18} aria-hidden className="text-accent" /> What the GM knows
      </h2>
      <p className="text-ink-3 mb-3 text-sm">
        {sheet.facts.length} facts for Week {sheet.week}, built from your league by the GameplanBlitz tools. Answers may use these and nothing else.
      </p>
      <ul className="mb-4 flex flex-wrap gap-1.5">
        {[...counts].map(([t, n]) => (
          <li key={t} className="border-line bg-panel rounded-full border px-2.5 py-1 text-xs font-bold">
            {TOPIC_LABEL[t]} <span className="text-ink-3">{n}</span>
          </li>
        ))}
      </ul>
      <dl className="grid gap-1.5 text-sm">
        {fresh.map(([label, at]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-ink-2">{label}</dt>
            <dd className="text-ink-3 text-right">{at ? relTime(at) : 'n/a'}</dd>
          </div>
        ))}
      </dl>
      {sheet.pending.length > 0 && <p className="text-ink-3 mt-3 text-xs">Still loading: {sheet.pending.join(', ')}.</p>}
      {sheet.unavailable.length > 0 && <p className="text-amber mt-2 text-xs">Not available: {sheet.unavailable.join('; ')}.</p>}
    </section>
  )
}

function HowItWorks() {
  const consent = useAppStore((s) => s.aiConsent)
  const configured = aiConfigured()
  return (
    <section aria-label="How answers work" className={`${CARD} ${PAD} text-sm`}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        <ShieldCheck size={18} aria-hidden className="text-good" /> How answers work
      </h2>
      <ul className="text-ink-2 grid gap-3">
        <li className="flex gap-2">
          <Bot size={16} aria-hidden className="text-ink-3 mt-0.5 shrink-0" />
          <span>
            <b className="text-ink">Built-in answers</b> use no AI. They pick the facts that match your question and quote them with their sources, so every number is one a tool computed.
          </span>
        </li>
        <li className="flex gap-2">
          <Sparkles size={16} aria-hidden className="text-purple mt-0.5 shrink-0" />
          <span>
            <b className="text-ink">AI answers</b> (Claude){' '}
            {configured
              ? consent
                ? 'are on. They may only use the fact sheet; any number not found in the cited facts is flagged as unverified.'
                : 'are available after you allow sending your league facts to the AI service.'
              : 'are not set up on this site. They need the GameplanBlitz AI Worker (see Settings).'}{' '}
            Up to {LOCAL_LIMITS.chat} AI questions a day on this device.
          </span>
        </li>
        <li className="flex gap-2">
          <MessageSquareText size={16} aria-hidden className="text-ink-3 mt-0.5 shrink-0" />
          <span>
            Follow-ups work: “what about him?”, “and Kelce?”. The GM is read-only and never makes or confirms roster moves. Your conversation stays in this browser.
          </span>
        </li>
      </ul>
    </section>
  )
}

function AskPage({ data }: { data: Ready }) {
  const sheet = useFactSheet(data)
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
          <MessageSquareText aria-hidden className="text-accent size-7" /> AI Fantasy GM
        </h1>
        <p className="text-ink-2 mt-1">
          Ask anything about Week {data.week} in {data.league.name}. Every answer cites your league data, with timestamps and how sure it is.
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-label="Conversation with the Fantasy GM" className={`${CARD} ${PAD}`}>
          <GmChat data={data} sheet={sheet} />
        </section>
        <aside className="grid content-start gap-4">
          <Knowledge sheet={sheet} />
          <HowItWorks />
        </aside>
      </div>
    </div>
  )
}

export default function Ask() {
  return <LeagueGate>{(data) => <AskPage data={data} />}</LeagueGate>
}
