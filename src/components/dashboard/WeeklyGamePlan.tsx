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

const AREA: Record<Area, { icon: LucideIcon; tone: IconTone; label: string }> = {
  lineup: { icon: Check, tone: 'good', label: 'Lineup' },
  waivers: { icon: Plus, tone: 'purple', label: 'Waivers' },
  trades: { icon: ArrowLeftRight, tone: 'amber', label: 'Trade' },
  news: { icon: Newspaper, tone: 'accent', label: 'News' },
  playoffs: { icon: Medal, tone: 'accent', label: 'Playoffs' },
  keepers: { icon: Lock, tone: 'coral', label: 'Keepers' },
}

const PLAN_ITEMS = 3

/** Primary focal card: the Fantasy GM's top moves for the week. The dashboard's one gradient surface. */
export function WeeklyGamePlan({
  actions,
  week,
  pending,
  className = '',
}: {
  actions: GmAction[]
  week: number
  pending: boolean
  className?: string
}) {
  const top = actions.slice(0, PLAN_ITEMS)
  return (
    <section
      aria-label="Your Weekly Game Plan"
      className={`border-plan-line from-plan-from to-plan-to flex min-w-0 flex-col rounded-2xl border bg-gradient-to-br p-5 sm:p-7 ${className}`}
    >
      <div className="flex items-start gap-4">
        <span className="bg-accent/15 text-accent grid size-12 shrink-0 place-items-center rounded-xl">
          <Route size={24} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">Your Weekly Game Plan</h2>
          <p className="text-ink-2 mt-0.5">
            {top.length === 0
              ? pending
                ? 'Checking your lineup, waivers and trades…'
                : `No urgent moves for Week ${week}.`
              : `Week ${week} · ${top.length} move${top.length === 1 ? '' : 's'}, most urgent first`}
          </p>
        </div>
        <Link
          to="/gm"
          title="A rules-based brief from your lineup, waiver, trade and news tools (no AI)"
          className="bg-accent text-accent-ink hover:bg-accent-deep inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 font-extrabold transition-colors"
        >
          <Briefcase size={17} aria-hidden /> Fantasy GM
        </Link>
      </div>

      <ol className="mt-6 grid flex-1 auto-rows-fr gap-2.5">
        {top.length === 0 && pending
          ? Array.from({ length: PLAN_ITEMS }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-[68px] !rounded-xl" />
              </li>
            ))
          : top.map((a) => {
              const { icon: Icon, tone, label } = AREA[a.area]
              return (
                <li key={a.id} className="flex">
                  <Link
                    to={a.to}
                    className="group border-plan-line/50 bg-bg/35 hover:border-accent/60 hover:bg-bg/55 flex min-h-[68px] w-full items-center gap-4 rounded-xl border px-4 py-3 transition-colors"
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-full ${ICON_TONE[tone]}`}
                    >
                      <Icon size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-snug">{a.title}</span>
                      <span className="text-ink-2 block text-sm">
                        {label} · {a.impact}
                      </span>
                    </span>
                    {a.priority === 1 && (
                      <span className="border-bad/40 bg-bad/10 text-bad shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold">
                        Do now
                      </span>
                    )}
                    <ChevronRight
                      size={20}
                      aria-hidden
                      className="text-ink-3 group-hover:text-ink shrink-0 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              )
            })}
        {top.length === 0 && !pending && (
          <li className="border-plan-line/50 bg-bg/35 text-ink-2 rounded-xl border px-4 py-4">
            Your lineup is set and no tool found a clear upgrade. Check back after waivers run.
          </li>
        )}
      </ol>
    </section>
  )
}
