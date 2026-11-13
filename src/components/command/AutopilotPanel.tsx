import { ArrowRight, BellRing, Gauge, Landmark, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { focusFor } from '../../lib/analytics/autopilot'
import type { GmAction } from '../../lib/analytics/gm'
import { CARD } from '../dashboard/styles'

/**
 * Right-column heads-up: today's Autopilot focus and how many "Do now" items the brief holds,
 * plus the league network pages. Recommendation-only, like Autopilot itself.
 */
export function AutopilotPanel({ actions, loading }: { actions: GmAction[]; loading: boolean }) {
  const [now] = useState(() => new Date())
  const today = focusFor(now.getDay())
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' })
  const urgent = actions.filter((a) => a.priority === 1)
  return (
    <section aria-label="Autopilot heads-up" className={`${CARD} p-4`}>
      <div className="flex items-center gap-2">
        <Gauge size={18} aria-hidden className="text-accent" />
        <h2 className="text-base font-extrabold">Autopilot</h2>
        <Link to="/autopilot" className="text-accent ml-auto inline-flex items-center gap-1 text-xs font-bold hover:underline">
          Open <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
      <p className="text-ink-3 mt-2 text-xs font-bold tracking-wide uppercase">Today ({weekday})</p>
      <Link to={today.to} className="hover:text-accent text-sm font-semibold">
        {today.focus}
      </Link>
      <p className={`mt-2 flex items-center gap-1.5 text-sm ${urgent.length ? 'text-bad font-bold' : 'text-ink-2'}`} role="status">
        <BellRing size={14} aria-hidden />
        {loading && !urgent.length
          ? 'Checking your lineup…'
          : urgent.length
            ? `${urgent.length} thing${urgent.length === 1 ? '' : 's'} to do now: ${urgent[0].title}`
            : 'No urgent changes recommended.'}
      </p>
      <nav aria-label="League network" className="mt-3 grid grid-cols-3 gap-2">
        {[
          { to: '/alerts', label: 'Alerts', icon: BellRing },
          { to: '/scores', label: 'Scores', icon: Trophy },
          { to: '/hq', label: 'League HQ', icon: Landmark },
        ].map((x) => (
          <Link
            key={x.to}
            to={x.to}
            className="border-line/70 bg-card-2/60 hover:bg-raised flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-xs font-bold"
          >
            <x.icon size={16} aria-hidden className="text-accent" />
            {x.label}
          </Link>
        ))}
      </nav>
    </section>
  )
}
