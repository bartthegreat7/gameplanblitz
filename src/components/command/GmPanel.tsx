import { ChevronRight, Send, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { FactSheet } from '../../hooks/useFactSheet'
import type { Ready } from '../../hooks/useLeagueData'
import { GmChat } from '../ai/GmChat'
import { CARD } from '../dashboard/styles'
import { Drawer } from '../ui/Overlay'
import { DASHBOARD_SEEDS } from './tabs'

const SHORT: Record<string, string> = { 'What are my playoff chances?': 'My playoff chances?' }

/**
 * The AI Fantasy GM, docked on the dashboard: ask here (typed or a suggested question) and the
 * conversation opens in a side panel with the answer. Same chat, history and sources as /ask.
 */
export function GmPanel({ data, sheet }: { data: Ready; sheet: FactSheet }) {
  const [input, setInput] = useState('')
  const [chat, setChat] = useState<{ q?: string; key: number } | null>(null)
  const open = (q?: string) => setChat({ q, key: Date.now() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    open(input.trim())
    setInput('')
  }
  return (
    <section aria-label="AI Fantasy GM" className={`${CARD} grid gap-3 p-4 sm:p-5`}>
      <div className="flex items-start gap-3">
        <Sparkles size={28} aria-hidden className="text-accent mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">AI Fantasy GM</h2>
          <p className="text-ink-2 text-sm">Get personalized advice for your team, trades, waivers, and more.</p>
        </div>
        <button
          type="button"
          onClick={() => open()}
          className="bg-select text-select-ink hover:bg-accent-deep shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
        >
          Chat Now
        </button>
      </div>
      <form onSubmit={submit} className="border-line/80 bg-bg/50 focus-within:border-accent flex items-center gap-2 rounded-xl border py-1.5 pr-1.5 pl-3.5">
        <label htmlFor="gm-dock-q" className="sr-only">
          Ask the Fantasy GM
        </label>
        <input
          id="gm-dock-q"
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything about your fantasy team…"
          className="text-ink placeholder:text-ink-3 min-h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Send question"
          className="bg-accent-deep text-select-ink grid size-9 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-50"
        >
          <Send size={16} aria-hidden />
        </button>
      </form>
      <div role="group" aria-label="Suggested questions" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DASHBOARD_SEEDS.map((q) => (
          <button
            key={q}
            type="button"
            aria-label={q}
            onClick={() => open(q)}
            className="border-line/80 bg-bg/40 hover:border-accent/60 hover:bg-raised flex min-h-10 items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-[12.5px] leading-tight font-semibold transition-colors"
          >
            <span className="min-w-0">{SHORT[q] ?? q}</span>
            <ChevronRight size={15} aria-hidden className="text-ink-3 shrink-0" />
          </button>
        ))}
      </div>
      <p className="text-ink-3 text-xs">
        {sheet.pending.length ? 'Loading your league data…' : 'Answers cite your league data and say how sure they are.'}
      </p>
      <Drawer open={!!chat} onClose={() => setChat(null)} title="AI Fantasy GM">
        {chat && (
          <div className="flex h-[68dvh] min-h-0 flex-col md:h-full">
            <GmChat key={chat.key} data={data} sheet={sheet} compact seeds={DASHBOARD_SEEDS} initialQuestion={chat.q} />
          </div>
        )}
      </Drawer>
    </section>
  )
}
