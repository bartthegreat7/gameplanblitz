import {
  ArrowRight,
  Check,
  ClipboardList,
  CloudSun,
  HeartPulse,
  Lock,
  Medal,
  Newspaper,
  Plus,
  Repeat2,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { Area, GmAction } from '../../lib/analytics/gm'
import { headshotUrl, type PlayerMap } from '../../lib/sleeper'
import { Skeleton } from '../ui/states'

const AREA: Record<Area, { icon: LucideIcon; ring: string }> = {
  lineup: { icon: Check, ring: 'bg-good text-bad-ink' },
  injury: { icon: HeartPulse, ring: 'bg-coral text-bad-ink' },
  weather: { icon: CloudSun, ring: 'bg-amber text-bad-ink' },
  waivers: { icon: Plus, ring: 'bg-good text-bad-ink' },
  breakout: { icon: TrendingUp, ring: 'bg-good text-bad-ink' },
  trades: { icon: Repeat2, ring: 'bg-accent text-accent-ink' },
  news: { icon: Newspaper, ring: 'bg-accent text-accent-ink' },
  playoffs: { icon: Medal, ring: 'bg-accent text-accent-ink' },
  keepers: { icon: Lock, ring: 'bg-purple text-accent-ink' },
}

const PLAN_ITEMS = 3
/** the verbs that lead an action ("Start", "Add", "Monitor", ...), highlighted like the reference */
const VERB =
  /^(Start|Add|Fill|Replace|Monitor|Investigate|Explore|Review|Read|Keeper outlook|Playoff race)\b/

function Title({ text }: { text: string }) {
  const m = VERB.exec(text)
  if (!m) return <>{text}</>
  return (
    <>
      <span className="text-good">{m[0]}</span>
      {text.slice(m[0].length)}
    </>
  )
}

/** The lead action's player, cut out on the right of the card (Sleeper headshot; hidden if it fails to load). */
function Spotlight({ players, id }: { players: PlayerMap; id?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const p = id ? players[id] : undefined
  if (!p || p.position === 'DEF' || failed === id) return null
  return (
    <img
      src={headshotUrl(p)}
      alt=""
      aria-hidden
      onError={() => setFailed(id!)}
      className="pointer-events-none absolute right-0 bottom-0 hidden h-[70%] max-h-56 w-[30%] object-contain object-right-bottom opacity-90 [mask-image:linear-gradient(to_left,black_60%,transparent)] sm:block"
    />
  )
}

/** Primary focal card: the Fantasy GM's top moves for the week. The dashboard's one gradient surface. */
export function WeeklyGamePlan({
  actions,
  week,
  pending,
  players,
  className = '',
}: {
  actions: GmAction[]
  week: number
  pending: boolean
  players: PlayerMap
  className?: string
}) {
  const top = actions.slice(0, PLAN_ITEMS)
  const lead = top.find((a) => a.playerId)?.playerId
  return (
    <section
      aria-label="Your Weekly Game Plan"
      className={`border-plan-line/80 from-plan-from/90 to-plan-to/80 relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.8)] backdrop-blur-md ${className}`}
    >
      <Spotlight players={players} id={lead} />
      <div className="relative flex flex-wrap items-start gap-3">
        <span className="bg-accent/15 text-accent grid size-11 shrink-0 place-items-center rounded-xl">
          <ClipboardList size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Your Weekly Game Plan</h2>
          <p className="text-ink-2">
            {top.length === 0
              ? pending
                ? 'Checking your lineup, waivers and trades…'
                : `No urgent moves for Week ${week}.`
              : `Week ${week} · ranked by urgency`}
          </p>
        </div>
        <Link
          to="/gm"
          title="A rules-based brief from your lineup, waiver, trade and news tools (no AI)"
          className="bg-accent text-accent-ink hover:bg-accent-deep z-10 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-extrabold transition-colors"
        >
          View Details <ArrowRight size={16} aria-hidden />
        </Link>
      </div>

      <ol className="border-line/60 bg-bg/45 relative mt-4 grid max-w-full rounded-xl border sm:max-w-[70%]">
        {top.length === 0 && pending
          ? Array.from({ length: PLAN_ITEMS }, (_, i) => (
              <li key={i} className="px-4 py-3">
                <Skeleton className="h-6" />
              </li>
            ))
          : top.map((a) => {
              const { icon: Icon, ring } = AREA[a.area]
              return (
                <li key={a.id} className="border-line/50 border-t first:border-t-0">
                  <Link
                    to={a.to}
                    className="group hover:bg-bg/40 flex min-h-11 items-center gap-3 px-4 py-2 transition-colors"
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full ${ring}`}
                    >
                      <Icon size={15} strokeWidth={3} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">
                      <span className="font-semibold">
                        <Title text={a.title} />
                      </span>{' '}
                      <span className="text-ink-2 text-sm">({a.impact})</span>
                    </span>
                    {a.priority === 1 && (
                      <span className="border-bad/40 bg-bad/10 text-bad shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold">
                        Do now
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
        {top.length === 0 && !pending && (
          <li className="text-ink-2 px-4 py-4">
            Your lineup is set and no tool found a clear upgrade.
          </li>
        )}
      </ol>
    </section>
  )
}
