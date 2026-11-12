import { ArrowRight, ArrowRightLeft, Check, Lock, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'

import { f1, signed } from '../../lib/format'
import { effectiveProj, type Candidate, type SlotPlan } from '../../lib/analytics/lineupPlan'
import { ConfidenceBadge, EvidenceList } from '../ui/badges'
import { PosTag } from '../ui/Pill'
import { RangeBar } from '../ui/RangeBar'
import { StatusPills } from './PlayerInsight'

function PlayerButton({ c, onSelect, tone }: { c: Candidate | null; onSelect: (c: Candidate) => void; tone?: 'new' }) {
  if (!c) return <span className="text-ink-3 text-sm italic">Empty</span>
  return (
    <button
      type="button"
      onClick={() => onSelect(c)}
      aria-label={`${c.name}, details`}
      className={`min-w-0 rounded-xl border px-3 py-2 text-left ${tone === 'new' ? 'border-accent/50 bg-accent/10' : 'border-line bg-panel'}`}
    >
      <span className="flex items-center gap-1.5">
        <PosTag pos={c.pos} />
        <span className="truncate font-bold">{c.name}</span>
      </span>
      <span className="text-ink-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-ink-2 font-bold">{f1(effectiveProj(c))} proj</span>
        <StatusPills c={c} />
      </span>
    </button>
  )
}

export function SlotRow({
  slot,
  domainMax,
  onSelect,
}: {
  slot: SlotPlan
  domainMax: number
  onSelect: (c: Candidate) => void
}) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  // nobody eligible and available (e.g. only TE is on a bye): show who is there now, flagged
  const noReplacement = !slot.recommended && !slot.locked
  const shown = slot.recommended ?? slot.current
  return (
    <li className="border-line bg-card rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="bg-line text-ink-2 rounded-full px-2.5 py-0.5 text-xs font-extrabold tracking-wide">{slot.label}</span>
        {slot.locked ? (
          <span className="text-ink-2 inline-flex items-center gap-1 text-sm font-semibold">
            <Lock size={14} aria-hidden /> Locked
          </span>
        ) : noReplacement ? (
          <span className="text-amber inline-flex items-center gap-1 text-sm font-semibold">
            <TriangleAlert size={14} aria-hidden /> No available player
          </span>
        ) : slot.move ? (
          <span className="text-ink-2 inline-flex items-center gap-1 text-sm font-semibold">
            <ArrowRightLeft size={14} aria-hidden /> Moves
          </span>
        ) : slot.changed ? (
          <span className="flex items-center gap-2">
            <span className={`text-sm font-extrabold ${slot.delta >= 0 ? 'text-good' : 'text-amber'}`}>{signed(slot.delta)} pts</span>
            {slot.confidence && <ConfidenceBadge confidence={slot.confidence} />}
          </span>
        ) : (
          <span className="text-good inline-flex items-center gap-1 text-sm font-semibold">
            <Check size={14} aria-hidden /> Best option
          </span>
        )}
      </div>

      {slot.changed ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <PlayerButton c={slot.current} onSelect={onSelect} />
          <ArrowRight size={18} className="text-ink-3" aria-label="replace with" role="img" />
          <PlayerButton c={slot.recommended} onSelect={onSelect} tone="new" />
        </div>
      ) : (
        <PlayerButton c={shown} onSelect={onSelect} />
      )}

      {shown && (
        <div className="mt-3">
          <RangeBar proj={shown.proj} floor={shown.floor} ceiling={shown.ceiling} domainMax={domainMax} />
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="text-accent mt-3 text-sm font-bold"
      >
        {open ? 'Hide reasoning' : 'Why?'}
      </button>
      <div id={panel} hidden={!open} className="mt-2 grid gap-3">
        <ul className="text-ink-2 list-disc space-y-1 pl-5 text-sm">
          {slot.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <EvidenceList items={slot.evidence} />
        {slot.confidence && (
          <ul className="text-ink-3 list-disc space-y-0.5 pl-5 text-xs">
            {slot.confidence.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
