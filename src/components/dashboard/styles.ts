/* Shared dashboard styles (kept out of component files for fast refresh). */

export type IconTone = 'accent' | 'good' | 'amber' | 'purple' | 'coral'

export const ICON_TONE: Record<IconTone, string> = {
  accent: 'bg-accent/15 text-accent',
  good: 'bg-good/15 text-good',
  amber: 'bg-amber/15 text-amber',
  purple: 'bg-purple/15 text-purple',
  coral: 'bg-coral/15 text-coral',
}

export const CARD =
  'border-line bg-card rounded-2xl border shadow-[0_16px_36px_-28px_rgba(0,0,0,0.65)] transition-colors hover:border-plan-line'
