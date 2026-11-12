import { ShieldCheck } from 'lucide-react'

/** Explicit opt-in before any league data goes to the AI service. */
export function AiConsent({ onAllow, onCancel, what = 'answers' }: { onAllow: () => void; onCancel: () => void; what?: 'answers' | 'scripts' }) {
  return (
    <div role="region" aria-label="Allow the AI service" className="border-purple/40 bg-purple/10 mb-3 rounded-2xl border p-4 text-sm">
      <p className="flex items-start gap-2 font-bold">
        <ShieldCheck size={18} aria-hidden className="text-purple mt-0.5 shrink-0" />
        Send your league facts to the AI service?
      </p>
      <p className="text-ink-2 mt-1.5">
        To write {what}, your question and the fact sheet (team and player names, projections, standings, injury designations, headlines) go to this site's GameplanBlitz AI Worker and Anthropic's Claude API. GameplanBlitz stores none of it there. Built-in {what} never leave your browser.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onAllow} className="bg-accent text-accent-ink min-h-10 rounded-xl px-4 font-extrabold">
          Allow
        </button>
        <button type="button" onClick={onCancel} className="border-line bg-panel min-h-10 rounded-xl border px-4 font-bold">
          Keep built-in
        </button>
      </div>
    </div>
  )
}
