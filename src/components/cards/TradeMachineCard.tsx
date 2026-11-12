import { ArrowLeftRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { clamp, f1, trunc } from '../../lib/format'
import { findTrades, type TradeDeal } from '../../lib/insights'
import type { Model } from '../../lib/model'
import { PlayerAvatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState, Notice } from '../ui/states'
import { ProjNotice, type CardProps } from './shared'

const LEAD = 'Every deal is fair by FantasyCalc market value and raises your starting lineup.'

export function TradeMachineCard({ data }: CardProps) {
  const { model, flags } = data
  const unavailable = flags.fcFailed || !model.fc
  const deals = useMemo(() => (unavailable ? [] : findTrades(model)), [model, unavailable])

  return (
    <Card id="trade" title="Trade Machine" context="Fair deals priced by FantasyCalc" icon={ArrowLeftRight} tone="blue">
      <ProjNotice data={data} />
      {unavailable ? (
        <>
          <p className="text-ink-2 mb-3">{LEAD}</p>
          <Notice>FantasyCalc values couldn't load, so trades can't be priced right now. Use Refresh to retry.</Notice>
        </>
      ) : deals.length === 0 ? (
        <>
          <p className="text-ink-2 mb-2">{LEAD}</p>
          <EmptyState>No clearly fair upgrade turned up right now. Add players to your trade block in Sleeper and refresh.</EmptyState>
        </>
      ) : (
        <>
          <p className="text-ink-2 mb-1">
            Each deal is fair by FantasyCalc market value and makes your starting lineup score more. The weekly change shows how hard the sell is.
          </p>
          {deals.map((d) => (
            <Deal key={d.get} deal={d} model={model} />
          ))}
        </>
      )}
    </Card>
  )
}

function Chip({ model, id, side }: { model: Model; id: string; side: 'get' | 'give' }) {
  return (
    <div
      className={`border-line bg-panel flex items-center gap-2 rounded-xl border p-2 ${
        side === 'get' ? 'border-l-coral border-l-[3px]' : 'border-r-blue flex-row-reverse border-r-[3px] text-right'
      }`}
    >
      <PlayerAvatar player={model.players[id]} className="size-9 text-xs" />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{model.shortName(id)}</div>
        <div className="text-ink-3 text-xs">
          {model.pos(id)} {model.team(id)} · {model.fcValue(id).toLocaleString()}
        </div>
      </div>
    </div>
  )
}

function Deal({ deal: d, model }: { deal: TradeDeal; model: Model }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const text = `Trade offer to ${d.theirName}:\nYou get ${model.name(d.get)}\nYou give ${d.give.map(model.name).join(', ')}\n(via GameplanBlitz · fair by FantasyCalc)`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const t = document.createElement('textarea')
      t.value = text
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <article className="border-line bg-panel mt-3.5 rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <h3 className="text-lg font-extrabold">{trunc(d.theirName)}</h3>
        <span className="text-ink-2 text-sm">
          You <b className="text-good">+{f1(d.you)}</b>/wk
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-mint text-xs font-extrabold tracking-wide">YOU GET</span>
          <Chip model={model} id={d.get} side="get" />
        </div>
        <ArrowLeftRight size={20} className="text-ink-2" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <span className="text-coral text-right text-xs font-extrabold tracking-wide">YOU GIVE</span>
          {d.give.map((g) => (
            <Chip key={g} model={model} id={g} side="give" />
          ))}
        </div>
      </div>
      <div
        role="img"
        aria-label={`${d.fair}% fair`}
        className="relative mt-4 mb-1.5 h-2 rounded-full bg-gradient-to-r from-bad via-amber to-mint-deep"
      >
        <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(10,15,29,0.6)]" style={{ left: `${clamp(d.fair, 5, 97)}%` }} />
      </div>
      <div className="text-ink-3 flex justify-between text-xs">
        <span>They win</span>
        <span className="text-ink-2 font-bold">{d.fair}% fair</span>
        <span>You win</span>
      </div>
      <p className="text-ink-2 mt-2.5 text-sm">Lifts your starting lineup by {f1(d.you)} points a week.</p>
      <button type="button" onClick={copy} className="bg-mint text-mint-ink mt-3 w-full rounded-xl py-3 font-extrabold">
        <span aria-live="polite">{copied ? 'Copied ✓' : 'Copy offer'}</span>
      </button>
    </article>
  )
}
