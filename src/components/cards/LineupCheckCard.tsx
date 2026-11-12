import { Check, ChevronRight, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'

import { lineupCheck } from '../../lib/insights'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/states'
import type { CardProps } from './shared'

export function LineupCheckCard({ data }: CardProps) {
  const { model, matchups, week } = data
  const issues = lineupCheck(model, matchups)
  const [open, setOpen] = useState(false)

  if (!issues)
    return (
      <Card id="lineup" title="Lineup Check" icon={ClipboardCheck} tone="gold">
        <EmptyState>Set your Week {week} lineup in Sleeper to run a check.</EmptyState>
      </Card>
    )

  const n = issues.length
  return (
    <Card id="lineup" title="Lineup Check" context={`Week ${week}`} icon={ClipboardCheck} tone="gold">
      {n === 0 ? (
        <div className="border-good/30 bg-panel flex items-center gap-3.5 rounded-2xl border p-4">
          <span className="border-good/40 bg-good/14 text-good grid size-14 place-items-center rounded-full border">
            <Check size={28} aria-hidden />
          </span>
          <div>
            <div className="text-3xl leading-none font-extrabold">0</div>
            <div className="text-ink-2 text-sm">Your lineup is set — no fixes needed</div>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="border-bad/30 bg-panel flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left"
          >
            <span className="border-bad/40 bg-bad/14 text-bad grid size-14 place-items-center rounded-full border text-2xl font-extrabold">!</span>
            <span>
              <span className="block text-3xl leading-none font-extrabold">{n}</span>
              <span className="text-ink-2 text-sm">thing{n > 1 ? 's' : ''} to fix before kickoff</span>
            </span>
            <ChevronRight size={22} aria-hidden className={`text-ink-3 ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
          {open && (
            <ul className="mt-3 flex flex-col gap-2.5">
              {issues.map((x, i) => (
                <li key={i} className="border-line bg-panel rounded-2xl border p-3.5">
                  <div className="mb-1 font-bold">{x.title}</div>
                  <div className="text-ink-2 text-sm">{x.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
