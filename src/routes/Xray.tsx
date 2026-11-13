import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowRight, Handshake, Radar, ScanSearch, Swords } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { CARD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { RankingsPanel } from '../components/league/LeagueReport'
import { TeamAvatar } from '../components/ui/Avatar'
import { EmptyState, ListSkeleton } from '../components/ui/states'
import { useGmBrief } from '../hooks/useGmBrief'
import { useLeagueBoard } from '../hooks/useLeagueBoard'
import type { Ready } from '../hooks/useLeagueData'
import { useLeagueReport } from '../hooks/useLeagueReport'
import { headToHead } from '../lib/analytics/scouting'
import { byeWeeks, leagueXray, tradePartners, type TeamXray } from '../lib/analytics/xray'
import { f1 } from '../lib/format'
import { getSchedule, getTransactions, type SleeperTransaction } from '../lib/sleeper'

const rankCls = (rank: number, of: number) =>
  rank <= Math.max(1, Math.round(of / 4)) ? 'bg-good/15 text-good' : rank > of - Math.max(1, Math.round(of / 4)) ? 'bg-bad/15 text-bad' : 'text-ink-2'

function XrayView({ data }: { data: Ready }) {
  const { model: m, week, season, league } = data
  const gm = useGmBrief(data)
  const board = useLeagueBoard(data)
  const report = useLeagueReport(data, board.games, board.games.length > 0 && board.games.every((g) => g.status === 'final'))
  const lastRegular = (league.settings.playoff_week_start ?? 15) - 1
  const scheduleQ = useQuery({ queryKey: ['schedule', season], queryFn: () => getSchedule(season), staleTime: 30 * 60_000, retry: 1 })
  const txQs = useQueries({
    queries: Array.from({ length: Math.max(0, week) }, (_, i) => i + 1).map((r) => ({
      queryKey: ['transactions', league.league_id, r],
      queryFn: () => getTransactions(league.league_id, r),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  })
  const txStamp = txQs.map((q) => q.dataUpdatedAt).join(',')
  const txs = useMemo<SleeperTransaction[]>(
    () => txQs.flatMap((q) => q.data ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txStamp],
  )
  const xs = useMemo<TeamXray[]>(
    () => leagueXray(m, { byeWeeksOf: byeWeeks(scheduleQ.data ?? [], week, lastRegular), transactions: txs }),
    [m, scheduleQ.data, week, lastRegular, txs],
  )
  const groups = [...(xs[0]?.groups.keys() ?? [])]
  const partners = useMemo(() => tradePartners(xs, m.myRosterId), [xs, m.myRosterId])
  const deals = [...(gm.trades?.mutual ?? []), ...(gm.trades?.oneSided ?? [])]
  const others = m.rosters.filter((r) => r.roster_id !== m.myRosterId)
  const [vs, setVs] = useState<number>(others[0]?.roster_id ?? m.myRosterId)
  const h2h = useMemo(() => headToHead(m, m.myRosterId, vs), [m, vs])
  const threats = (report.odds ?? []).filter((o) => o.rosterId !== m.myRosterId).sort((a, b) => b.playoffPct - a.playoffPct).slice(0, 3)
  const n = xs.length

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <ScanSearch size={22} aria-hidden className="text-accent" /> League X-Ray
        </h1>
        <p className="text-ink-3 text-sm">
          Every roster in {league.name}, measured the same way: Sleeper projections in your scoring, designations, byes and
          transactions. Nothing here guesses what another manager intends.
        </p>
      </div>

      <RankingsPanel m={m} power={report.power} change={report.change} through={report.through} />

      {threats.length > 0 && (
        <section aria-label="Playoff threats" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-2 text-lg font-extrabold">Playoff threats</h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {threats.map((o) => (
              <li key={o.rosterId} className="border-line/70 bg-card-2/60 flex items-center gap-3 rounded-xl border p-3">
                <TeamAvatar user={m.ownerOf(o.rosterId)} className="size-9 text-xs" />
                <span className="min-w-0 flex-1 truncate font-bold">{m.teamName(o.rosterId)}</span>
                <span className="text-sm tabular-nums">{Math.round(o.playoffPct)}% playoffs</span>
              </li>
            ))}
          </ul>
          <p className="text-ink-3 mt-2 text-xs">Playoff odds from the seeded season simulation (model).</p>
        </section>
      )}

      <section aria-label="Team strength comparison" className={`${CARD} p-4 sm:p-5`}>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
          <Radar size={20} aria-hidden className="text-accent" /> Team strength by position
        </h2>
        <p className="text-ink-3 mb-3 text-xs">
          Projected points from each team&apos;s best healthy lineup this week, with league rank (green = top quarter, red = bottom quarter).
        </p>
        {xs.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <caption className="sr-only">Every team's projected strength by position, bench, injuries, byes, value and moves</caption>
              <thead>
                <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                  <th scope="col" className="py-2 pr-2 font-semibold">Team</th>
                  {groups.map((g) => (
                    <th key={g} scope="col" className="px-1 py-2 text-center font-semibold">{g}</th>
                  ))}
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Total</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold" title="Best three healthy bench players, projected">Bench</th>
                  <th scope="col" className="px-1 py-2 font-semibold">Vulnerabilities</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold" title="Completed adds / trades this season">Moves</th>
                </tr>
              </thead>
              <tbody>
                {[...xs].sort((a, b) => b.total - a.total).map((x) => {
                  const mine = x.rosterId === m.myRosterId
                  const flags = [
                    x.injured.length ? `${x.injured.length} injured starter${x.injured.length === 1 ? '' : 's'}` : null,
                    x.byeWorst && x.byeWorst.count >= 2 ? `${x.byeWorst.count} starters on bye in Week ${x.byeWorst.week}` : null,
                    x.weaknesses.length ? `thin at ${x.weaknesses.join(', ')}` : null,
                  ].filter(Boolean)
                  return (
                    <tr key={x.rosterId} className={`border-line/50 border-b last:border-0 ${mine ? 'bg-active/50' : ''}`}>
                      <th scope="row" className="py-2 pr-2 text-left font-semibold">
                        {m.teamName(x.rosterId)}
                        {mine && <span className="text-accent"> (you)</span>}
                      </th>
                      {groups.map((g) => {
                        const r = x.groups.get(g)!
                        return (
                          <td key={g} className="px-1 py-2 text-center">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${rankCls(r.rank, n)}`} title={`Rank ${r.rank} of ${n}`}>
                              {f1(r.proj)}
                            </span>
                          </td>
                        )
                      })}
                      <td className="px-1 py-2 text-right font-extrabold tabular-nums">{f1(x.total)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{f1(x.benchDepth)}</td>
                      <td className="text-ink-2 px-1 py-2 text-xs">{flags.length ? flags.join(' · ') : '—'}</td>
                      <td className="text-ink-2 px-1 py-2 text-right text-xs tabular-nums">
                        {x.moves.adds} / {x.moves.trades}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Trade partners" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
            <Handshake size={20} aria-hidden className="text-good" /> Potential trade partners
          </h2>
          <p className="text-ink-3 mb-3 text-xs">
            Teams strong where you are thin and thin where you are strong (projections). Whether a manager wants to trade is
            unknown.
          </p>
          {partners.length === 0 ? (
            <EmptyState>No team&apos;s strengths and needs line up with yours right now.</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {partners.map((p) => {
                const theirDeals = deals.filter((d) => d.theirRosterId === p.rosterId)
                return (
                  <li key={p.rosterId} className="border-line/70 bg-card-2/60 rounded-xl border p-3 text-sm">
                    <div className="flex items-center gap-2 font-bold">
                      <TeamAvatar user={m.ownerOf(p.rosterId)} className="size-7 text-[10px]" />
                      {m.teamName(p.rosterId)}
                    </div>
                    <p className="text-ink-2 mt-1">
                      You could offer <b className="text-ink">{p.theyNeed.join(', ')}</b> depth and ask about their{' '}
                      <b className="text-ink">{p.youNeed.join(', ')}</b>.
                    </p>
                    {theirDeals.length > 0 && (
                      <Link to="/trades" className="text-accent mt-1 inline-flex items-center gap-1 font-bold hover:underline">
                        {theirDeals.length} priced deal{theirDeals.length === 1 ? '' : 's'} in the Trade War Room <ArrowRight size={13} aria-hidden />
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-label="Compare with a team" className={`${CARD} p-4 sm:p-5`}>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
            <Swords size={20} aria-hidden className="text-amber" /> Compare with
            <select
              aria-label="Team to compare with"
              value={vs}
              onChange={(e) => setVs(Number(e.target.value))}
              className="border-line bg-card ml-1 min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm font-semibold"
            >
              {others.map((r) => (
                <option key={r.roster_id} value={r.roster_id}>
                  {m.teamName(r.roster_id)}
                </option>
              ))}
            </select>
          </h2>
          <ul className="grid gap-1.5 text-sm">
            {h2h.groups.map((g) => (
              <li key={g.group} className="grid grid-cols-[3rem_1fr_4rem_4rem_4.5rem] items-center gap-2">
                <b className="text-ink-2">{g.group}</b>
                <span aria-hidden className="bg-line/50 relative h-2 rounded-full">
                  <span
                    className={`absolute inset-y-0 rounded-full ${g.edge >= 0 ? 'bg-good left-1/2' : 'bg-bad right-1/2'}`}
                    style={{ width: `${Math.min(50, (Math.abs(g.edge) / Math.max(1, ...h2h.groups.map((x) => Math.abs(x.edge)))) * 50)}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{f1(g.mine)}</span>
                <span className="text-ink-3 text-right tabular-nums">{f1(g.theirs)}</span>
                <span className={`text-right font-bold tabular-nums ${g.edge > 0.05 ? 'text-good' : g.edge < -0.05 ? 'text-bad' : 'text-ink-3'}`}>
                  {g.edge >= 0 ? '+' : '−'}
                  {f1(Math.abs(g.edge))}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-2 mt-3 text-sm">
            {(() => {
              const best = [...h2h.groups].sort((a, b) => b.edge - a.edge)[0]
              const worst = [...h2h.groups].sort((a, b) => a.edge - b.edge)[0]
              return `Your biggest edge is ${best.group} (${best.edge >= 0 ? '+' : '−'}${f1(Math.abs(best.edge))}); your biggest gap is ${worst.group} (${worst.edge >= 0 ? '+' : '−'}${f1(Math.abs(worst.edge))}). Overall ${f1(h2h.myProj)} vs ${f1(h2h.theirProj)} projected, a ${h2h.winPct}% win chance (model).`
            })()}
          </p>
          <Link to="/scouting" className="text-accent mt-2 inline-flex items-center gap-1 text-sm font-bold hover:underline">
            Full scouting report <ArrowRight size={14} aria-hidden />
          </Link>
        </section>
      </div>
    </div>
  )
}

export default function Xray() {
  return <LeagueGate>{(data) => <XrayView data={data} />}</LeagueGate>
}
