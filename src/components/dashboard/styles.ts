/* Shared dashboard styles (kept out of component files for fast refresh). */

export type IconTone = 'accent' | 'good' | 'amber' | 'purple' | 'coral'

export const ICON_TONE: Record<IconTone, string> = {
  accent: 'bg-accent/12 text-accent',
  good: 'bg-good/12 text-good',
  amber: 'bg-amber/12 text-amber',
  purple: 'bg-purple/12 text-purple',
  coral: 'bg-coral/12 text-coral',
}

/** One surface for every dashboard card: flat navy, hairline border, soft depth. Gradients are reserved for the Game Plan. */
export const CARD =
  'border-line bg-card rounded-2xl border shadow-[0_24px_48px_-36px_rgba(0,0,0,0.75)]'

/** Card padding: generous, and a step larger on wide screens. */
export const PAD = 'p-5 sm:p-6'
