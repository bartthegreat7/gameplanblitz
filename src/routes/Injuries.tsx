import { HeartPulse } from 'lucide-react'
import { useMemo } from 'react'

import { LeagueGate } from '../components/LeagueGate'
import { AvailabilityFacts, PlayerLine, RippleRow } from '../components/opportunity/parts'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useUsageBook } from '../hooks/useUsageBook'
import { AFFECTED, availabilityOf, domino } from '../lib/analytics/opportunity'

const MAX_INJURED = 12
const RIPPLES_SHOWN = 5

function InjuriesView({ data }: { data: Ready }) {
  const { model: m } = data
  const { book, loading, failed } = useUsageBook(data)
  const mine = (m.myRoster()?.players ?? []).filter((id) => m.injury(id))

  // injured (out or doubtful) skill players rostered in this league, biggest season scorers first
  const injured = useMemo(() => {
    const seasonPts = (id: string) => (book.games.get(id) ?? []).reduce((a, u) => a + u.pts, 0)
    return [...m.allRostered()]
      .filter(
        (id) =>
          AFFECTED[m.pos(id)] &&
          ['out', 'doubtful'].includes(availabilityOf(m.injury(id))) &&
          m.team(id),
      )
      .sort((a, b) => seasonPts(b) - seasonPts(a))
      .slice(0, MAX_INJURED)
  }, [m, book])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
        <HeartPulse size={24} aria-hidden className="text-accent" /> Injury Center
      </h1>
      <p className="text-ink-2 mt-1 max-w-3xl">
        Official designations from Sleeper, and how teammates were actually used in games an injured
        player missed this season. Questionable players are never assumed out, and no workload is
        assumed to move to one player.
      </p>
      {failed && (
        <Notice>
          Couldn&apos;t load this season&apos;s weekly stats, so teammate effects can&apos;t be
          measured.
        </Notice>
      )}

      <section
        aria-label="Your roster"
        className="border-line bg-card mt-5 rounded-2xl border p-5 sm:p-6"
      >
        <h2 className="mb-1 text-xl font-extrabold tracking-tight">Your roster</h2>
        <p className="text-ink-3 mb-4 text-sm">
          Players with an injury designation, with their team&apos;s quarterback and offensive-line
          situation.
        </p>
        {mine.length === 0 ? (
          <EmptyState>No one on your roster has an injury designation.</EmptyState>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {mine.map((id) => (
              <li key={id} className="border-line bg-panel rounded-xl border p-4">
                <PlayerLine m={m} id={id} />
                <div className="mt-3">
                  <AvailabilityFacts m={m} id={id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Injury domino effect"
        className="border-line bg-card mt-5 rounded-2xl border p-5 sm:p-6"
      >
        <h2 className="mb-1 text-xl font-extrabold tracking-tight">Injury domino effect</h2>
        <p className="text-ink-3 mb-4 text-sm">
          Rostered players who are out or doubtful, and their teammates&apos; per-game usage in
          games the injured player missed vs games he played. Games missed for any reason count
          (injury, inactive, or not yet on the team).
        </p>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : injured.length === 0 ? (
          <EmptyState>No rostered player in your league is out or doubtful.</EmptyState>
        ) : (
          <ul className="grid gap-4">
            {injured.map((id) => {
              const all = domino(book, m.players, id)
              const measured = all.some((r) => r.delta)
              // nothing measured yet: show only depth-chart backups at his position
              const ripples = (measured ? all : all.filter((r) => r.depth !== null)).slice(
                0,
                RIPPLES_SHOWN,
              )
              return (
                <li
                  key={id}
                  aria-label={`${m.name(id)} injury effects`}
                  className="border-line bg-panel rounded-xl border p-4"
                >
                  <PlayerLine m={m} id={id} />
                  {!measured && (
                    <p className="text-ink-3 mt-3 text-sm">
                      He hasn&apos;t missed a game this season, so there is no measured effect yet.
                      {ripples.length > 0 ? ' Next on the depth chart:' : ''}
                    </p>
                  )}
                  {ripples.length === 0 ? (
                    measured && (
                      <p className="text-ink-3 mt-3 text-sm">
                        No teammates at related positions to measure.
                      </p>
                    )
                  ) : (
                    <ul className="mt-2">
                      {ripples.map((r) => (
                        <RippleRow key={r.id} m={m} r={r} injuredName={m.shortName(id)} />
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function Injuries() {
  return <LeagueGate>{(data) => <InjuriesView data={data} />}</LeagueGate>
}
