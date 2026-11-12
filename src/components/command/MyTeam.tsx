import { HeartPulse } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import type { useGmBrief } from '../../hooks/useGmBrief'
import type { Ready } from '../../hooks/useLeagueData'
import { teamHealth } from '../../lib/analytics/command'
import { availabilityOf } from '../../lib/analytics/opportunity'
import { RosterCard } from '../cards/RosterCards'
import { CardLink, DashboardCard } from '../dashboard/DashboardCard'
import { OptimalLineup, WaiverTargets } from '../dashboard/Insights'
import { EmptyState } from '../ui/states'

const LEVEL_CLS = {
  empty: 'text-amber',
  out: 'text-bad',
  bye: 'text-ink-2',
  doubtful: 'text-bad',
  questionable: 'text-amber',
} as const

/** Lineup availability (Sleeper designations and byes) plus injured players on the bench. */
function HealthDetail({ data, gm }: { data: Ready; gm: ReturnType<typeof useGmBrief> }) {
  const m = data.model
  const plan = gm.lineup?.plan ?? null
  const health = useMemo(() => (plan ? teamHealth(plan) : null), [plan])
  const starters = new Set(plan?.slots.map((s) => s.current?.id).filter(Boolean))
  const bench = (m.myRoster()?.players ?? []).filter((id) => !starters.has(id) && m.injury(id))
  return (
    <DashboardCard
      title="Team Health"
      subtitle={
        health
          ? `${health.ready} of ${health.slots} starters available · Sleeper designations`
          : 'Sleeper designations'
      }
      icon={HeartPulse}
      tone="good"
      footer={<CardLink to="/injuries">Open Injury Center</CardLink>}
    >
      {!health ? (
        <EmptyState>No Week {data.week} lineup is posted yet.</EmptyState>
      ) : (
        <div className="grid gap-4">
          <div
            role="progressbar"
            aria-label="Starters available"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(health.readiness)}
            className="bg-panel h-2.5 overflow-hidden rounded-full"
          >
            <div
              className={`h-full rounded-full ${health.status === 'ready' ? 'bg-good' : health.status === 'monitor' ? 'bg-amber' : 'bg-bad'}`}
              style={{ width: `${health.readiness}%` }}
            />
          </div>
          <div>
            <h3 className="text-ink-3 mb-1.5 text-xs font-extrabold tracking-wide uppercase">In your lineup</h3>
            {health.concerns.length === 0 ? (
              <p className="text-good text-sm font-semibold">Every starter is available.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {health.concerns.map((c, i) => (
                  <li key={`${c.slot}-${i}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <b className="text-ink-3 mr-2 inline-block w-10">{c.slot}</b>
                      {c.id ? (
                        <Link to={`/players/${c.id}`} className="font-semibold hover:underline">
                          {c.name}
                        </Link>
                      ) : (
                        c.name
                      )}
                    </span>
                    <b className={LEVEL_CLS[c.level]}>{c.status}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-ink-3 mb-1.5 text-xs font-extrabold tracking-wide uppercase">On your bench</h3>
            {bench.length === 0 ? (
              <p className="text-ink-3 text-sm">No designations on your bench.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {bench.map((id) => (
                  <li key={id} className="flex justify-between gap-3">
                    <Link to={`/players/${id}`} className="truncate font-semibold hover:underline">
                      {m.name(id)}
                    </Link>
                    <b className={availabilityOf(m.injury(id)) === 'out' ? 'text-bad' : 'text-amber'}>
                      {m.injury(id)}
                    </b>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-ink-3 text-xs">
            Questionable players are game-time decisions and are never assumed out.
          </p>
        </div>
      )}
    </DashboardCard>
  )
}

/** Your team at a glance: availability, the lineup (as set vs optimized), the roster, upgrades. */
export function MyTeam({
  data,
  gm,
  projOf,
}: {
  data: Ready
  gm: ReturnType<typeof useGmBrief>
  projOf: (id: string) => number
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 @[52rem]/main:grid-cols-2">
        <OptimalLineup analysis={gm.lineup} week={data.week} projOf={projOf} />
        <HealthDetail data={data} gm={gm} />
      </div>
      <div className="grid gap-5 @[52rem]/main:grid-cols-2">
        <RosterCard data={data} />
        <WaiverTargets m={data.model} report={gm.waivers} loading={gm.waiversLoading} />
      </div>
    </div>
  )
}
