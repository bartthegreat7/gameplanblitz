import {
  ArrowLeftRight,
  Briefcase,
  Check,
  ChevronRight,
  Lock,
  Medal,
  Newspaper,
  Plus,
  Route,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import type { Area, GmAction } from '../../lib/analytics/gm'
import { Skeleton } from '../ui/states'
import { ICON_TONE, type IconTone } from './styles'

const AREA: Record<Area, { icon: LucideIcon; tone: IconTone }> = {
  lineup: { icon: Check, tone: 'good' },
  waivers: { icon: Plus, tone: 'purple' },
  trades: { icon: ArrowLeftRight, tone: 'amber' },
  news: { icon: Newspaper, tone: 'accent' },
  playoffs: { icon: Medal, tone: 'accent' },
  keepers: { icon: Lock, tone: 'coral' },
}

const PLAN_ITEMS = 3

/** The dashboard's focal card: the Fantasy GM's top actions for the week. */
export function WeeklyGamePlan({
  actions,
  week,
  pending,
}: {
  actions: GmAction[]
  week: number
  pending: boolean
}) {
  const top = actions.slice(0, PLAN_ITEMS)
  return (
    <section
      aria-label="Your Weekly Game Plan"
      className="border-plan-line from-plan-from to-plan-to relative min-w-0 overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-[0_20px_44px_-28px_var(--accent)] md:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-accent grid size-11 shrink-0 place-items-center rounded-xl bg-white/5">
          <Route size={24} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Your Weekly Game Plan</h2>
          <p className="text-ink-2 text-sm">
            {top.length === 0
              ? pending
                ? 'Checking your lineup, waivers and trades…'
                : `No urgent moves for Week ${week}.`
              : `${top.length} key action${top.length === 1 ? '' : 's'} for Week ${week}, ranked by urgency.`}
          </p>
        </div>
        <Link
          to="/gm"
          title="A rules-based brief built from this app's tools (no AI)"
          className="bg-accent text-accent-ink hover:bg-accent-deep inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-extrabold shadow-[0_8px_20px_-10px_var(--accent)] transition-colors"
        >
          <Briefcase size={16} aria-hidden /> Fantasy GM
        </Link>
      </div>
      <ul className="mt-3 grid">
        {top.length === 0 && pending
          ? Array.from({ length: PLAN_ITEMS }, (_, i) => (
              <li key={i} className="border-plan-line/60 border-t py-2.5">
                <Skeleton className="h-6" />
              </li>
            ))
          : top.map((a) => {
              const { icon: Icon, tone } = AREA[a.area]
              return (
                <li key={a.id} className="border-plan-line/60 border-t first:border-t">
                  <Link to={a.to} className="group flex min-h-12 items-center gap-3 py-2">
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full ${ICON_TONE[tone]}`}
                    >
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-[15px]">
                      <span className="font-semibold">{a.title}</span>
                      <span className="text-ink-2"> ({a.impact})</span>
                    </span>
                    {a.priority === 1 && (
                      <span className="border-bad/40 bg-bad/10 text-bad rounded-full border px-2 py-0.5 text-xs font-bold">
                        Do now
                      </span>
                    )}
                    <ChevronRight
                      size={18}
                      aria-hidden
                      className="text-ink-2 shrink-0 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              )
            })}
        {top.length === 0 && !pending && (
          <li className="border-plan-line/60 text-ink-2 border-t py-3 text-sm">
            Your lineup is set and no tool found a clear upgrade. Check back after waivers run.
          </li>
        )}
      </ul>
    </section>
  )
}
