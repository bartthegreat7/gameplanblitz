import { ArrowLeftRight } from 'lucide-react'
import { useId, useState } from 'react'

import { offerText, type Impact, type TradeEvaluation } from '../../lib/analytics/trades'
import { clamp, signed } from '../../lib/format'
import type { Model } from '../../lib/model'
import { PlayerAvatar } from '../ui/Avatar'
import { ConfidenceBadge, EvidenceList } from '../ui/badges'
import { Pill } from '../ui/Pill'

const VERDICT_TONE: Record<string, 'prio' | 'info' | 'caution' | 'neutral'> = {
  'Win-win': 'prio',
  'Helps you': 'info',
  'Helps them': 'caution',
  'Costs your lineup': 'caution',
  'Hurts both lineups': 'caution',
}

function AssetList({ model, e, side, values }: { model: Model; e: TradeEvaluation; side: 'give' | 'get'; values?: Map<string, number> }) {
  const s = e[side]
  return (
    <ul className="flex flex-col gap-1.5">
      {s.players.map((id) => (
        <li key={id} className={`border-line bg-panel flex items-center gap-2 rounded-xl border p-2 ${side === 'get' ? 'border-l-good border-l-[3px]' : 'border-l-amber border-l-[3px]'}`}>
          <PlayerAvatar player={model.players[id]} className="size-8 text-xs" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{model.shortName(id)}</span>
            <span className="text-ink-3 text-xs">
              {model.pos(id)} {model.team(id)}
              {model.injury(id) ? ` · ${model.injury(id)}` : ''}
              {values?.has(id) ? ` · ${Math.round(values.get(id)!).toLocaleString()}` : ''}
            </span>
          </span>
        </li>
      ))}
      {s.picks.map((p) => (
        <li key={p.key} className="border-line bg-panel rounded-xl border p-2 text-sm font-semibold">
          {p.label}
          <span className="text-ink-3 block text-xs">{p.value !== null ? `value ${Math.round(p.value).toLocaleString()}` : 'no market value'}</span>
        </li>
      ))}
      {s.players.length + s.picks.length === 0 && <li className="text-ink-3 text-sm italic">Nothing</li>}
    </ul>
  )
}

function ImpactTile({ title, i, weeks }: { title: string; i: Impact; weeks: number }) {
  const tone = i.total >= 0.15 * weeks ? 'text-good' : i.total <= -0.15 * weeks ? 'text-amber' : ''
  return (
    <div className="border-line bg-panel rounded-xl border p-3">
      <div className="text-ink-3 text-xs font-bold tracking-wide uppercase">{title}</div>
      <div className={`text-2xl font-extrabold ${tone}`}>{signed(i.total)}</div>
      <div className="text-ink-3 text-xs">over {weeks} week{weeks === 1 ? '' : 's'}</div>
      {i.starts.length > 0 && <div className="text-ink-2 mt-1 text-xs">Starts: {i.starts.map((s) => `${s.name} (${s.slot})`).join(', ')}</div>}
      {i.benches.length > 0 && <div className="text-ink-3 text-xs">Benched: {i.benches.map((b) => b.name).join(', ')}</div>}
    </div>
  )
}

/** The full picture of one trade: assets, both lineups, value fairness, verdict, reasons. */
export function TradeBody({ model, e, values }: { model: Model; e: TradeEvaluation; values?: Map<string, number> }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const panel = useId()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(offerText(model, e))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <div>
          <div className="text-good mb-1.5 text-xs font-extrabold tracking-wide">YOU GET</div>
          <AssetList model={model} e={e} side="get" values={values} />
        </div>
        <ArrowLeftRight size={18} className="text-ink-3 mt-7" aria-hidden />
        <div>
          <div className="text-amber mb-1.5 text-xs font-extrabold tracking-wide">YOU GIVE</div>
          <AssetList model={model} e={e} side="give" values={values} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ImpactTile title="Your lineup" i={e.you} weeks={e.activeWeeks} />
        <ImpactTile title="Their lineup" i={e.them} weeks={e.activeWeeks} />
      </div>

      {e.fairness !== null ? (
        <div className="mt-3">
          <div role="img" aria-label={`${Math.round(e.fairness * 100)}% fair on market value`} className="from-bad via-amber to-good relative h-2 rounded-full bg-gradient-to-r">
            <span
              className="bg-ink absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--card)]"
              // position: center = fair; left = you overpay, right = you get more value
              style={{ left: `${clamp(50 + ((e.getValue! - e.giveValue!) / Math.max(e.getValue!, e.giveValue!)) * 50, 3, 97)}%` }}
            />
          </div>
          <div className="text-ink-3 mt-1 flex justify-between text-xs">
            <span>You overpay</span>
            <span className="text-ink-2 font-bold">{Math.round(e.fairness * 100)}% fair on value</span>
            <span>You get more</span>
          </div>
        </div>
      ) : (
        <p className="text-amber mt-3 text-xs font-semibold">Fairness unknown: an asset has no market value.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone={VERDICT_TONE[e.verdict.label] ?? 'neutral'}>{e.verdict.label}</Pill>
        <ConfidenceBadge confidence={e.confidence} />
        <span className="text-ink-3 text-xs">
          Acceptance: {e.verdict.acceptable === 'likely' ? 'looks acceptable (estimate)' : e.verdict.acceptable === 'unlikely' ? 'may need more (estimate)' : 'unknown'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)} className="text-accent text-sm font-bold">
          {open ? 'Hide reasoning' : 'Why?'}
        </button>
        <button type="button" onClick={copy} className="text-accent text-sm font-bold">
          <span aria-live="polite">{copied ? 'Copied ✓' : 'Copy offer text'}</span>
        </button>
      </div>
      <div id={panel} hidden={!open} className="mt-2 grid gap-3">
        <ul className="text-ink-2 list-disc space-y-1 pl-5 text-sm">
          {e.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <EvidenceList items={e.evidence} />
        <ul className="text-ink-3 list-disc space-y-0.5 pl-5 text-xs">
          {e.confidence.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function TradeCard({ model, e, values }: { model: Model; e: TradeEvaluation; values?: Map<string, number> }) {
  return (
    <li className="border-line bg-card rounded-2xl border p-4">
      <h3 className="mb-3 text-lg font-extrabold">With {e.theirName}</h3>
      <TradeBody model={model} e={e} values={values} />
    </li>
  )
}
