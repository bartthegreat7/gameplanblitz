import { TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'

import { LeagueGate } from '../components/LeagueGate'
import { PlayerLine } from '../components/opportunity/parts'
import { Segmented } from '../components/ui/Segmented'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useUsageBook } from '../hooks/useUsageBook'
import { BREAKOUT, breakouts } from '../lib/analytics/opportunity'

type Pos = 'ALL' | 'RB' | 'WR' | 'TE'
type Who = 'available' | 'all'

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

function BreakoutsView({ data }: { data: Ready }) {
  const { model: m, week } = data
  const { book, loading, failed, hasXfp } = useUsageBook(data)
  const [pos, setPos] = useState<Pos>('ALL')
  const [who, setWho] = useState<Who>('available')
  const rostered = useMemo(() => m.allRostered(), [m])
  const all = useMemo(() => breakouts(book, m.pos), [book, m])
  const list = all
    .filter((b) => (pos === 'ALL' || b.pos === pos) && (who === 'all' || !rostered.has(b.id)))
    .slice(0, 30)

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
        <TrendingUp size={24} aria-hidden className="text-accent" /> Breakout Radar
      </h1>
      <p className="text-ink-2 mt-1 max-w-3xl">
        Players whose last two games show clearly more opportunity than their earlier games, before
        the points necessarily follow. A player needs at least {BREAKOUT.minSignals} of these
        signals: snap share up {BREAKOUT.snap * 100}+ points, {BREAKOUT.targets}+ more targets,{' '}
        {BREAKOUT.touches}+ more touches, {BREAKOUT.rzOpps}+ more red-zone chances per game, or
        usage worth {BREAKOUT.xfpOverPts}+ more points than he scored. Evidence, not a prediction.
      </p>
      <div className="mt-4 flex flex-wrap gap-x-6">
        <Segmented
          label="Players"
          value={who}
          onChange={setWho}
          options={[
            { value: 'available', label: 'Free agents in my league' },
            { value: 'all', label: 'All players' },
          ]}
        />
        <Segmented
          label="Position"
          value={pos}
          onChange={setPos}
          options={(['ALL', 'RB', 'WR', 'TE'] as const).map((p) => ({
            value: p,
            label: p === 'ALL' ? 'All' : p,
          }))}
        />
      </div>
      {!hasXfp && !loading && (
        <Notice>
          The projection model isn't published yet, so the "usage worth more than his scoring"
          signal is off.
        </Notice>
      )}
      {failed && <Notice>Couldn't load this season's weekly stats from Sleeper.</Notice>}
      <section aria-label="Breakout candidates" className="mt-2">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : list.length === 0 ? (
          <EmptyState>
            {week <= 4
              ? 'Too early in the season: each player needs 4+ games to compare.'
              : 'No player meets the breakout criteria right now.'}
          </EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.map((b) => (
              <li key={b.id} className="border-line bg-card rounded-2xl border p-4 sm:p-5">
                <PlayerLine m={m} id={b.id} />
                <ul className="mt-3 grid gap-1 text-sm">
                  {b.signals.map((s) => (
                    <li key={s} className="text-good flex gap-2">
                      <TrendingUp size={15} aria-hidden className="mt-0.5 shrink-0" />
                      <span className="text-ink-2">{s}</span>
                    </li>
                  ))}
                </ul>
                <dl className="border-line text-ink-3 mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-center text-xs">
                  {(
                    [
                      ['Snaps', `${pct(b.earlier.snapShare)} → ${pct(b.recent.snapShare)}`],
                      [
                        'Targets',
                        `${b.earlier.targets.toFixed(1)} → ${b.recent.targets.toFixed(1)}`,
                      ],
                      [
                        'Touches',
                        `${b.earlier.touches.toFixed(1)} → ${b.recent.touches.toFixed(1)}`,
                      ],
                      ['Points', `${b.earlier.pts.toFixed(1)} → ${b.recent.pts.toFixed(1)}`],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dd className="text-ink font-bold tabular-nums">{v}</dd>
                      <dt>{k} per game</dt>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-ink-3 mt-4 text-xs">
        Earlier = all games before the last two. Route participation isn&apos;t available from
        Sleeper.
      </p>
    </div>
  )
}

export default function Breakouts() {
  return <LeagueGate>{(data) => <BreakoutsView data={data} />}</LeagueGate>
}
