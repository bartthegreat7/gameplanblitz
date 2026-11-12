import type { ReactNode } from 'react'

type PillTone = 'warn' | 'caution' | 'info' | 'prio' | 'neutral'

const TONE: Record<PillTone, string> = {
  warn: 'bg-bad/15 text-bad',
  caution: 'bg-amber/15 text-amber',
  info: 'bg-blue/15 text-blue',
  prio: 'bg-accent/12 text-accent border border-accent/40',
  neutral: 'bg-line text-ink-2',
}

export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs leading-tight font-bold ${TONE[tone]}`}>
      {children}
    </span>
  )
}

const POS_COLOR: Record<string, string> = {
  QB: 'text-coral',
  RB: 'text-good',
  WR: 'text-blue',
  TE: 'text-amber',
  K: 'text-ink-2',
  DEF: 'text-ink-3',
}

export function PosTag({ pos }: { pos: string }) {
  return <span className={`font-extrabold ${POS_COLOR[pos] ?? 'text-ink-3'}`}>{pos || '?'}</span>
}
