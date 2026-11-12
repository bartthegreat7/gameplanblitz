import { Dices } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ProjNotice } from '../components/cards/shared'
import { LeagueGate } from '../components/LeagueGate'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Segmented } from '../components/ui/Segmented'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useLeagueMatchups } from '../hooks/useLeagueMatchups'
import { f1, ordinal, signed } from '../lib/format'
import { DEFAULT_SEED, MIN_SD, prepareSeason, remainingSOS, simulate, type StrengthBasis, type TeamOdds } from '../lib/analytics/playoffs'

const pct = (x: number) => (x >= 99.95 ? '100%' : x > 0 && x < 0.05 ? '<0.1%' : `${x.toFixed(1)}%`)

interface Row extends TeamOdds {
  name: string
  record: string
  pf: number
  mean: number
  sd: number
  sos: number
  me: boolean
}

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Team', cell: (r) => <span className={`font-bold ${r.me ? 'text-accent' : ''}`}>{r.name}</span>, sortValue: (r) => r.name },
  { key: 'record', header: 'Record', cell: (r) => r.record, hideBelow: 'sm' },
  { key: 'mean', header: 'Exp. pts', cell: (r) => f1(r.mean), sortValue: (r) => r.mean, align: 'right', hideBelow: 'md' },
  { key: 'sos', header: 'SOS left', cell: (r) => signed(r.sos), sortValue: (r) => r.sos, align: 'right', hideBelow: 'md' },
  { key: 'wins', header: 'Avg wins', cell: (r) => f1(r.avgWins), sortValue: (r) => r.avgWins, align: 'right', hideBelow: 'sm' },
  { key: 'playoff', header: 'Playoffs', cell: (r) => <b>{pct(r.playoffPct)}</b>, sortValue: (r) => r.playoffPct, align: 'right' },
  { key: 'bye', header: 'Bye', cell: (r) => pct(r.byePct), sortValue: (r) => r.byePct, align: 'right', hideBelow: 'sm' },
  { key: 'title', header: 'Title', cell: (r) => pct(r.championPct), sortValue: (r) => r.championPct, align: 'right' },
]

function PlayoffsView({ data }: { data: Ready }) {
  const { model: m, league, week } = data
  const lastRegular = (league.settings.playoff_week_start ?? 15) - 1
  const playoffTeams = league.settings.playoff_teams ?? 6
  const allWeeks = useMemo(() => Array.from({ length: Math.max(0, lastRegular) }, (_, i) => i + 1), [lastRegular])
  const sched = useLeagueMatchups(league.league_id, allWeeks)

  const [basis, setBasis] = useState<StrengthBasis>('blend')
  const [sims, setSims] = useState<'1000' | '5000' | '10000'>('5000')
  const [seed, setSeed] = useState(DEFAULT_SEED)

  const prepared = useMemo(() => prepareSeason({ m, weeks: sched.weeks, week, lastRegular, basis }), [sched.weeks, week, lastRegular, m, basis])

  const result = useMemo(() => {
    const base = { teams: prepared.teams, standings: prepared.standings, remaining: prepared.remaining, playoffTeams, sims: Number(sims), seed }
    const odds = simulate(base)
    // scenarios share the same random draws (common random numbers), so differences come from the forced results
    const myNext = prepared.remaining.find((g) => g.week === week && (g.home === m.myRosterId || g.away === m.myRosterId))
    const mine = (o: TeamOdds[]) => o.find((t) => t.rosterId === m.myRosterId)!
    const myLeft = prepared.remaining.filter((g) => g.home === m.myRosterId || g.away === m.myRosterId)
    const scen = myNext
      ? {
          win: mine(simulate({ ...base, forced: [{ week, rosterId: m.myRosterId, result: 'W' }] })),
          lose: mine(simulate({ ...base, forced: [{ week, rosterId: m.myRosterId, result: 'L' }] })),
          winOut: mine(simulate({ ...base, forced: myLeft.map((g) => ({ week: g.week, rosterId: m.myRosterId, result: 'W' as const })) })),
          gamesLeft: myLeft.length,
        }
      : null
    return { odds, scen }
  }, [prepared, playoffTeams, sims, seed, week, m.myRosterId])

  const rows: Row[] = result.odds.map((o) => {
    const t = prepared.teams.find((x) => x.rosterId === o.rosterId)!
    const s = prepared.standings.find((x) => x.rosterId === o.rosterId)!
    return {
      ...o,
      name: m.teamName(o.rosterId),
      record: `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`,
      pf: s.pf,
      mean: t.mean,
      sd: t.sd,
      sos: remainingSOS(o.rosterId, prepared.remaining, prepared.teams).vsAvg,
      me: o.rosterId === m.myRosterId,
    }
  })
  const me = rows.find((r) => r.me)
  // byes exist only when the playoff field is not a power of two (e.g. 6 teams: the top 2 rest)
  const hasByes = playoffTeams > 1 && 2 ** Math.ceil(Math.log2(playoffTeams)) > playoffTeams
  const columns = hasByes ? COLUMNS : COLUMNS.filter((c) => c.key !== 'bye')
  const seedData = me ? me.seedPct.map((p, i) => ({ seed: i + 1, pct: p })) : []

  if (week > lastRegular)
    return (
      <EmptyState>
        The regular season is over (playoffs start in Week {lastRegular + 1}), so playoff odds are settled by the final standings.
      </EmptyState>
    )

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Playoff Simulator</h1>
      <p className="text-ink-3 mb-4 text-sm">
        {Number(sims).toLocaleString()} simulated seasons of the remaining schedule (Weeks {week}–{lastRegular}), top {playoffTeams} make the playoffs. A model, not a forecast you can bank on.
      </p>
      <ProjNotice data={data} />
      {sched.failed && <Notice>The league schedule couldn't be loaded, so odds reflect only the current standings.</Notice>}
      {!sched.loading && prepared.missingWeeks.length > 0 && !sched.failed && (
        <Notice>Sleeper has no matchups posted for week{prepared.missingWeeks.length > 1 ? 's' : ''} {prepared.missingWeeks.join(', ')}; those games aren't simulated.</Notice>
      )}

      <div className="border-line bg-card mb-4 grid gap-3 rounded-2xl border p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div>
          <div className="mb-1 text-xs font-bold">Team strength from</div>
          <Segmented
            label="Team strength from"
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'blend', label: 'Blend' },
              { value: 'season', label: 'Season form' },
              { value: 'projection', label: 'Projections' },
            ]}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-bold">Simulations</div>
          <Segmented
            label="Simulations"
            value={sims}
            onChange={setSims}
            options={[
              { value: '1000', label: '1,000' },
              { value: '5000', label: '5,000' },
              { value: '10000', label: '10,000' },
            ]}
          />
        </div>
        <button type="button" onClick={() => setSeed((s) => s + 1)} className="border-line bg-panel mb-3.5 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold">
          <Dices size={16} aria-hidden /> New seed ({seed})
        </button>
      </div>

      {sched.loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {me && (
            <section aria-label="Your odds" className={`grid gap-3 ${hasByes ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              {[
                ['Make playoffs', pct(me.playoffPct)],
                ...(hasByes ? [['First-round bye', pct(me.byePct)]] : []),
                ['Win the title', pct(me.championPct)],
                ['Average finish', `${ordinal(Math.round(me.avgSeed))} (${f1(me.avgWins)} wins)`],
              ].map(([k, v]) => (
                <div key={k} className="border-line bg-card rounded-2xl border p-4">
                  <div className="text-ink-3 text-xs font-bold tracking-wide uppercase">{k}</div>
                  <div className="mt-1 text-2xl font-extrabold">{v}</div>
                </div>
              ))}
            </section>
          )}

          {result.scen && (
            <section aria-labelledby="scen-h" className="border-line bg-card mt-4 rounded-2xl border p-4">
              <h2 id="scen-h" className="mb-2 text-lg font-extrabold">Scenarios</h2>
              <ul className="grid gap-2 sm:grid-cols-3">
                <li className="border-good/30 bg-panel rounded-xl border p-3">
                  <div className="text-ink-3 text-xs font-bold">If you win in Week {week}</div>
                  <div className="text-good text-xl font-extrabold">{pct(result.scen.win.playoffPct)}</div>
                </li>
                <li className="border-amber/30 bg-panel rounded-xl border p-3">
                  <div className="text-ink-3 text-xs font-bold">If you lose in Week {week}</div>
                  <div className="text-amber text-xl font-extrabold">{pct(result.scen.lose.playoffPct)}</div>
                </li>
                <li className="border-line bg-panel rounded-xl border p-3">
                  <div className="text-ink-3 text-xs font-bold">If you win all {result.scen.gamesLeft} remaining</div>
                  <div className="text-xl font-extrabold">{pct(result.scen.winOut.playoffPct)}</div>
                </li>
              </ul>
              <p className="text-ink-3 mt-2 text-xs">Playoff odds under each assumed result; everything else is simulated as usual.</p>
            </section>
          )}

          <section aria-labelledby="league-h" className="border-line bg-card mt-4 rounded-2xl border p-4">
            <h2 id="league-h" className="mb-2 text-lg font-extrabold">League odds</h2>
            <DataTable rows={rows} columns={columns} rowKey={(r) => String(r.rosterId)} caption="Playoff odds by team" initialSort={{ key: 'playoff', dir: 'desc' }} />
            <p className="text-ink-3 mt-2 text-xs">SOS left: how much stronger (+) or weaker (−) a team's remaining opponents are than the league average, in expected points.</p>
          </section>

          {me && (
            <section aria-labelledby="seed-h" className="border-line bg-card mt-4 rounded-2xl border p-4">
              <h2 id="seed-h" className="mb-2 text-lg font-extrabold">Where you finish</h2>
              <div className="h-44" role="img" aria-label={`Final seed chances: ${seedData.filter((d) => d.pct > 0).map((d) => `${ordinal(d.seed)} ${pct(d.pct)}`).join(', ')}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={seedData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="seed" tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickFormatter={(s: number) => ordinal(s)} />
                    <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 12 }} unit="%" />
                    <Tooltip
                      cursor={{ fill: 'var(--panel)' }}
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' }}
                      formatter={(v) => [pct(Number(v)), 'Chance']}
                      labelFormatter={(s) => `${ordinal(Number(s))} seed`}
                    />
                    <Bar dataKey="pct" radius={[6, 6, 0, 0]} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <details className="border-line bg-card mt-6 rounded-2xl border p-4 text-sm">
            <summary className="cursor-pointer font-bold">Assumptions and method</summary>
            <ul className="text-ink-2 mt-3 list-disc space-y-1.5 pl-5">
              <li><b>Each weekly score</b> is drawn from a normal distribution: mean = the team's expected points, sd = its week-to-week volatility (its own with 3+ games, else the league's pooled value; never below {MIN_SD}). Scores are independent between teams and weeks.</li>
              <li><b>Expected points</b> come from {basis === 'blend' ? 'the average of season points per game and this week\'s best projected lineup' : basis === 'season' ? 'season points per game (projection for teams with no games)' : 'this week\'s best projected lineup, applied to every remaining week'}. Change it above.</li>
              <li><b>Schedule</b>: the matchups Sleeper has posted for Weeks {week}–{lastRegular}. This week is simulated in full even if games have started.</li>
              <li><b>Standings</b>: current Sleeper records and points for, then wins (ties count half), then total points for, Sleeper's default tiebreaker. Custom tiebreak settings are not modeled.</li>
              <li><b>Playoffs</b>: top {playoffTeams} teams, fixed bracket without re-seeding; when the field isn't a power of two the top seeds get byes.</li>
              <li><b>Reproducible</b>: the same inputs and seed always give the same numbers. Scenarios reuse the same random draws so their differences come from the assumed results.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  )
}

export default function Playoffs() {
  return <LeagueGate>{(data) => <PlayoffsView data={data} />}</LeagueGate>
}
