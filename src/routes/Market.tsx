import { useQuery } from '@tanstack/react-query'
import { get, set } from 'idb-keyval'
import { LineChart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { LeagueGate } from '../components/LeagueGate'
import { InjuryTag, Ownership } from '../components/opportunity/parts'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Pill, PosTag } from '../components/ui/Pill'
import { Segmented } from '../components/ui/Segmented'
import { Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useProjectionEngine } from '../hooks/useProjectionEngine'
import { useProjectionHorizon } from '../hooks/useProjectionHorizon'
import { useUsageBook } from '../hooks/useUsageBook'
import {
  addSnapshot,
  MARKET,
  oppTrend,
  pctChange,
  signalFor,
  trackedChange,
  type Signal,
  type Snapshot,
} from '../lib/analytics/market'
import { f1 } from '../lib/format'
import { pointsFor } from '../lib/scoring'

const POS = new Set(['QB', 'RB', 'WR', 'TE'])
const UNIVERSE = 250
type View = 'all' | 'mine' | 'fa' | 'buy-low' | 'sell-high'

interface Row {
  id: string
  name: string
  pos: string
  value: number
  trend30: number | null
  pct: number | null
  posRank: number | null
  proj: number
  next: number
  opp: { recent: number; earlier: number } | null
  injury: string
  signal: Signal
  reason: string | null
  tracked: { change: number; since: string } | null
  mine: boolean
  fa: boolean
}

/** Today's values saved in this browser (IndexedDB), one per day, last 60 days. Best effort. */
function useSnapshots(key: string, today: string, values: Record<string, number> | null) {
  const q = useQuery({
    queryKey: ['marketSnapshots', key, today],
    enabled: !!values,
    staleTime: Infinity,
    queryFn: async () => {
      let list: Snapshot[] = []
      try {
        list = ((await get(key)) as Snapshot[] | undefined) ?? []
      } catch {
        /* storage blocked */
      }
      const next = addSnapshot(list, { date: today, values: values! })
      try {
        await set(key, next)
      } catch {
        /* best effort */
      }
      return next
    },
  })
  return q.data ?? []
}

const signed = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString()}`

function MarketView({ data }: { data: Ready }) {
  const { model: m, season, week, league } = data
  const engine = useProjectionEngine(data)
  const { book } = useUsageBook(data)
  const horizon = useProjectionHorizon(season, week)
  const [view, setView] = useState<View>('all')
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  const ids = useMemo(() => {
    const rostered = m.allRostered()
    const fc = m.fc
    if (!fc) return []
    return [...fc.entries()]
      .filter(([id]) => POS.has(m.pos(id)) && m.players[id])
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, UNIVERSE)
      .map(([id]) => id)
      .concat([...rostered].filter((id) => POS.has(m.pos(id)) && !fc.has(id)))
  }, [m])
  const values = useMemo(
    () =>
      m.fc
        ? Object.fromEntries(
            ids.flatMap((id) => (m.fc!.get(id) ? [[id, m.fc!.get(id)!.value]] : [])),
          )
        : null,
    [ids, m],
  )
  const snaps = useSnapshots(`gb-market-${league.league_id}`, today, values)

  const mine = useMemo(() => new Set(m.myRoster()?.players ?? []), [m])
  const rostered = useMemo(() => m.allRostered(), [m])
  const rows: Row[] = ids.map((id) => {
    const fc = m.fc?.get(id)
    const t = oppTrend(book.games.get(id))
    const sig = signalFor(fc, t, m.injury(id))
    return {
      id,
      name: m.name(id),
      pos: m.pos(id),
      value: fc?.value ?? 0,
      trend30: typeof fc?.trend30 === 'number' ? fc.trend30 : null,
      pct: pctChange(fc),
      posRank: fc?.positionRank ?? null,
      proj: engine.projectionFor(id).value,
      next: horizon.horizon.reduce((a, w) => a + pointsFor(w.proj.get(id), m.scoring), 0),
      opp: t ? { recent: t.recent, earlier: t.earlier } : null,
      injury: m.injury(id),
      signal: sig.signal,
      reason: sig.reason,
      tracked: trackedChange(snaps, id),
      mine: mine.has(id),
      fa: !rostered.has(id),
    }
  })
  const shown = rows.filter((r) =>
    view === 'all' ? true : view === 'mine' ? r.mine : view === 'fa' ? r.fa : r.signal === view,
  )
  const days = new Set(snaps.map((s) => s.date)).size
  const weeksAhead = horizon.horizon.length

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Player',
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <Link to={`/players/${r.id}`} className="truncate font-bold hover:underline">
            {r.name}
          </Link>
          <span className="flex flex-wrap items-center gap-1.5">
            <PosTag pos={r.pos} />
            {r.posRank && (
              <span className="text-ink-3 text-xs">
                {r.pos}
                {r.posRank}
              </span>
            )}
            <InjuryTag status={r.injury} />
            <Ownership m={m} id={r.id} />
          </span>
          {r.reason && <span className="text-ink-2 mt-1 max-w-md text-xs">{r.reason}</span>}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      sortValue: (r) => r.value,
      cell: (r) => <b className="tabular-nums">{r.value.toLocaleString()}</b>,
    },
    {
      key: 'trend',
      header: '30 days',
      align: 'right',
      sortValue: (r) => r.pct ?? 0,
      cell: (r) =>
        r.trend30 === null ? (
          '—'
        ) : (
          <span
            className={`tabular-nums ${r.trend30 > 0 ? 'text-good' : r.trend30 < 0 ? 'text-bad' : ''}`}
          >
            {signed(r.trend30)}
            {r.pct !== null && (
              <span className="text-ink-3 block text-xs">{`${r.pct > 0 ? '+' : ''}${Math.round(r.pct * 100)}%`}</span>
            )}
          </span>
        ),
    },
    {
      key: 'proj',
      header: 'This week',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.proj,
      cell: (r) => <span className="tabular-nums">{f1(r.proj)}</span>,
    },
    {
      key: 'next',
      header: `Next ${weeksAhead} wks`,
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.next,
      cell: (r) => <span className="tabular-nums">{weeksAhead ? f1(r.next) : '—'}</span>,
    },
    {
      key: 'opp',
      header: 'Opportunity',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => (r.opp ? r.opp.recent - r.opp.earlier : -99),
      cell: (r) =>
        r.opp ? (
          <span className="tabular-nums text-xs">{`${r.opp.earlier.toFixed(1)} → ${r.opp.recent.toFixed(1)}`}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'tracked',
      header: 'Tracked',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.tracked?.change ?? 0,
      cell: (r) =>
        r.tracked ? (
          <span className="tabular-nums text-xs" title={`since ${r.tracked.since}`}>
            {signed(r.tracked.change)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'signal',
      header: 'Signal',
      sortValue: (r) => (r.signal === 'buy-low' ? 2 : r.signal === 'sell-high' ? 1 : 0),
      cell: (r) =>
        r.signal === 'buy-low' ? (
          <Pill tone="info">Buy low</Pill>
        ) : r.signal === 'sell-high' ? (
          <Pill tone="caution">Sell high</Pill>
        ) : null,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
        <LineChart size={24} aria-hidden className="text-accent" /> Player Stock Market
      </h1>
      <p className="text-ink-2 mt-1 max-w-3xl">
        Trade-market value and its 30-day change from FantasyCalc, next to this week&apos;s
        projection, the next {weeksAhead || 3} weeks of Sleeper projections, and opportunity
        (touches + targets per game, last 2 games vs earlier). Buy low: value down{' '}
        {MARKET.move * 100}%+ while opportunity holds. Sell high: value up {MARKET.move * 100}%+ on
        scoring {MARKET.efficiency}+ pts per game above what usage usually produces, or on shrinking
        opportunity. Evidence for a trade conversation, not a prediction.
      </p>
      {!m.fc && (
        <Notice>
          FantasyCalc values couldn&apos;t load, so the market is unavailable. Use Refresh to retry.
        </Notice>
      )}
      <div className="mt-4">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: 'All' },
            { value: 'mine', label: 'My team' },
            { value: 'fa', label: 'Free agents' },
            {
              value: 'buy-low',
              label: `Buy low (${rows.filter((r) => r.signal === 'buy-low').length})`,
            },
            {
              value: 'sell-high',
              label: `Sell high (${rows.filter((r) => r.signal === 'sell-high').length})`,
            },
          ]}
        />
      </div>
      <DataTable
        rows={shown}
        columns={columns}
        rowKey={(r) => r.id}
        searchText={(r) => r.name}
        caption="Player market values and signals"
        initialSort={{ key: 'value', dir: 'desc' }}
        empty="No players match."
      />
      <p className="text-ink-3 mt-3 text-xs">
        Tracked = value change across snapshots this browser has saved ({days} day
        {days === 1 ? '' : 's'} so far; one per day, kept 60 days). Values are FantasyCalc&apos;s
        redraft scale for your league size and scoring.
      </p>
    </div>
  )
}

export default function Market() {
  return <LeagueGate>{(data) => <MarketView data={data} />}</LeagueGate>
}
