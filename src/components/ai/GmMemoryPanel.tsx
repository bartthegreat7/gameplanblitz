import { Brain } from 'lucide-react'
import { useState } from 'react'

import { DEFAULT_MEMORY, NOTES_MAX, type GmMemory } from '../../lib/ai/gmFacts'
import { useAppStore } from '../../store/app'
import { CARD } from '../dashboard/styles'

const OPTIONS = {
  goal: [
    ['win-now', 'Win this season'],
    ['balanced', 'Balance now and later'],
    ['rebuild', 'Build for future seasons'],
  ],
  risk: [
    ['safe', 'Safer, higher floor'],
    ['balanced', 'Balanced'],
    ['aggressive', 'Take risks for upside'],
  ],
  trades: [
    ['open', 'Open to trades'],
    ['selective', 'Selective'],
    ['closed', 'Prefer not to trade'],
  ],
} as const

const LABEL = { goal: 'Season goal', risk: 'Risk', trades: 'Trading' } as const

/**
 * What the GM remembers about you for this league: your saved strategy and a short note. Stored in
 * this browser only; you can change or clear it at any time. The GM quotes it, labeled as yours.
 */
export function GmMemoryPanel({ leagueId }: { leagueId: string }) {
  const saved = useAppStore((s) => s.gmMemory[leagueId] ?? null)
  const setMemory = useAppStore((s) => s.setGmMemory)
  const [draft, setDraft] = useState<Omit<GmMemory, 'updatedAt'>>(() => (saved ? { goal: saved.goal, risk: saved.risk, trades: saved.trades, notes: saved.notes } : DEFAULT_MEMORY))
  const [status, setStatus] = useState<string>('')
  const dirty = !saved || saved.goal !== draft.goal || saved.risk !== draft.risk || saved.trades !== draft.trades || saved.notes !== draft.notes

  return (
    <section aria-label="What the GM remembers" className={`${CARD} p-4 sm:p-5`}>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
        <Brain size={18} aria-hidden className="text-accent" /> What the GM remembers
      </h2>
      <p className="text-ink-3 mb-3 text-xs">
        Your strategy for this league, quoted in answers as your preference (never as data). Saved in this browser only
        {saved ? `, last changed ${new Date(saved.updatedAt).toLocaleDateString()}` : ''}. The GM also recalls earlier Autopilot recommendations
        and your Sleeper moves.
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setMemory(leagueId, { ...draft, notes: draft.notes.slice(0, NOTES_MAX), updatedAt: Date.now() })
          setStatus('Saved. New answers use it.')
        }}
      >
        {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map((k) => (
          <label key={k} className="grid gap-1 text-sm">
            <span className="text-ink-2 font-semibold">{LABEL[k]}</span>
            <select
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              className="border-line bg-card-2 min-h-10 rounded-lg border px-2"
            >
              {OPTIONS[k].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          <span className="text-ink-2 font-semibold">Note to the GM (optional)</span>
          <textarea
            value={draft.notes}
            maxLength={NOTES_MAX}
            rows={3}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="e.g. I'm keeping my rookie WR no matter what."
            className="border-line bg-card-2 rounded-lg border p-2"
          />
          <span className="text-ink-3 text-right text-xs">
            {draft.notes.length}/{NOTES_MAX}
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!dirty} className="bg-select text-select-ink min-h-10 rounded-lg px-4 text-sm font-bold disabled:opacity-50">
            Save
          </button>
          {saved && (
            <button
              type="button"
              onClick={() => {
                setMemory(leagueId, null)
                setDraft(DEFAULT_MEMORY)
                setStatus('Cleared. The GM no longer uses a saved strategy.')
              }}
              className="border-line hover:bg-raised min-h-10 rounded-lg border px-4 text-sm font-bold"
            >
              Clear memory
            </button>
          )}
          <span role="status" className="text-ink-3 text-xs">
            {status}
          </span>
        </div>
      </form>
    </section>
  )
}
