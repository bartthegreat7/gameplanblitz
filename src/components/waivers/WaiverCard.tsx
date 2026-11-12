import { ArrowRight, Coins, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

import type { BidSuggestion } from '../../lib/analytics/bids'
import type { WaiverCandidate } from '../../lib/analytics/waivers'
import { f1, signed } from '../../lib/format'
import type { Model } from '../../lib/model'
import { PlayerAvatar } from '../ui/Avatar'
import { ConfidenceBadge, EvidenceList } from '../ui/badges'
import { Pill, PosTag } from '../ui/Pill'

const TIER = { must: 'Must add', strong: 'Strong add', upgrade: 'Upgrade' } as const

/** Everything behind one recommendation: reasons, evidence, confidence notes, bid logic. */
export function WaiverDetail({ c, bid }: { c: WaiverCandidate; bid: BidSuggestion | null }) {
  return (
    <div className="grid gap-3">
      <ul className="text-ink-2 list-disc space-y-1 pl-5 text-sm">
        {c.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <EvidenceList items={c.evidence} />
      <ul className="text-ink-3 list-disc space-y-0.5 pl-5 text-xs">
        {c.confidence.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      {bid && (
        <p className="border-line bg-panel rounded-xl border p-3 text-sm">
          <b>FAAB guidance ({bid.basis === 'league-history' ? 'from your league' : bid.basis === 'rule-of-thumb' ? 'rule of thumb' : 'marginal add'}): </b>
          {bid.explanation}
        </p>
      )}
      <Link to={`/players/${c.id}`} className="text-accent text-sm font-bold">
        Full player details →
      </Link>
    </div>
  )
}

export function WaiverCard({ c, model, bid }: { c: WaiverCandidate; model: Model; bid: BidSuggestion | null }) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <li className="border-line bg-card rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <PlayerAvatar player={model.players[c.id]} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-extrabold">{model.name(c.id)}</span>
            {c.tier && <Pill tone="prio">{TIER[c.tier]}</Pill>}
            {c.kind === 'speculative' && <Pill tone="info">Speculative stash</Pill>}
          </div>
          <div className="text-ink-3 flex flex-wrap items-center gap-1.5 text-xs">
            <PosTag pos={c.pos} />
            <span>{c.team || 'FA'}</span>
            {c.proj.map((p, i) => (
              <span key={i}>{i === 0 ? '' : '· '}{f1(p)}</span>
            ))}
            <span>proj / wk</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-xl font-extrabold ${c.net > 0.05 ? 'text-good' : ''}`}>{signed(c.net)}</div>
          <div className="text-ink-3 text-[11px]">{signed(c.gainPerWeek)}/wk lineup gain</div>
        </div>
      </div>

      <div className="border-line bg-panel mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-sm">
        <span className="text-good inline-flex items-center gap-1 font-bold">
          <Plus size={14} aria-hidden /> Add {c.name}
        </span>
        <ArrowRight size={14} className="text-ink-3" aria-hidden />
        {c.drop ? (
          <span>
            <b className="text-amber">Drop</b> {c.drop.name} <span className="text-ink-3">({c.drop.pos})</span>
          </span>
        ) : (
          <span className="text-ink-2">Open roster spot: no drop needed</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={c.confidence} />
        {bid && (
          <span
            title={bid.explanation}
            className="border-amber/40 bg-amber/10 text-amber inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold"
          >
            <Coins size={13} aria-hidden />
            FAAB ${bid.suggested}
            {bid.high > bid.low && <span className="font-semibold">(${bid.low}–${bid.high})</span>}
          </span>
        )}
        {c.signals.map((s) => (
          <Pill key={s} tone={/^(Snaps rising|Form rising|Next man up|Trending)/.test(s) ? 'prio' : /falling|Bye|Out|IR|Questionable|Doubtful/.test(s) ? 'caution' : 'neutral'}>
            {s}
          </Pill>
        ))}
      </div>

      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)} className="text-accent mt-3 text-sm font-bold">
        {open ? 'Hide reasoning' : 'Why?'}
      </button>
      <div id={panel} hidden={!open} className="mt-2">
        <WaiverDetail c={c} bid={bid} />
      </div>
    </li>
  )
}
