import { Clover, Dices, Gauge, Scale, Shield } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CARD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useLeagueHistory } from '../hooks/useLeagueHistory'
import { rosterOf, teamNameIn } from '../lib/analytics/leagueHistory'
import { luckReport, type TeamLuck } from '../lib/analytics/luck'
import { f1 } from '../lib/format'

const H2 = 'mb-1 flex items-center gap-2 text-lg font-extrabold'
const wins = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))
const signed = (x: number, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const record = (t: { w: number; l: number; t: number }) => `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}`

/** A diverging bar around zero: right/green = more wins than expected, left/red = fewer. */
function LuckBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(50, (Math.abs(value) / max) * 50) : 0
  return (
    <span aria-hidden className="bg-card-2 relative block h-2 w-24 overflow-hidden rounded-full">
      <span className="bg-line absolute top-0 left-1/2 h-full w-px" />
      <span
        className={`absolute top-0 h-full ${value >= 0 ? 'bg-good left-1/2' : 'bg-bad right-1/2'}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}

function LuckView({ data }: { data: Ready }) {
  const { model: m } = data
  const h = useLeagueHistory(data)
  const myUserId = m.rosterById(m.myRosterId)?.owner_id ?? null
  const [pick, setPick] = useState(0)
  const season = h.seasons[Math.min(pick, h.seasons.length - 1)]
  const report = useMemo(() => luckReport(season.weeks, { medianGame: !!season.medianGame }), [season])
  const name = (id: number) => teamNameIn(season, id)
  const mine = rosterOf(season, myUserId)
  const [focus, setFocus] = useState<number | null>(null)
  const shownId = focus !== null && report.teams.some((t) => t.rosterId === focus) ? focus : (mine ?? report.teams[0]?.rosterId ?? null)
  const shown = report.teams.find((t) => t.rosterId === shownId) ?? null
  const maxLuck = Math.max(0.5, ...report.teams.map((t) => Math.abs(t.luck)))
  const ids = [...report.teams].map((t) => t.rosterId).sort((a, b) => a - b)

  const pickBy = (score: (t: TeamLuck) => number) => (report.teams.length ? report.teams.reduce((a, b) => (score(b) > score(a) ? b : a)) : null)
  const luckiest = pickBy((t) => t.luck)
  const unluckiest = pickBy((t) => -t.luck)
  const toughest = pickBy((t) => t.sos)
  const steady = report.weeks >= 3 ? pickBy((t) => -t.sd) : null
  const highlights = [
    luckiest && { label: 'Luckiest', icon: Clover, team: luckiest.rosterId, value: `${signed(luckiest.luck)} wins vs expected` },
    unluckiest && { label: 'Unluckiest', icon: Dices, team: unluckiest.rosterId, value: `${signed(unluckiest.luck)} wins vs expected` },
    toughest && { label: 'Toughest schedule', icon: Shield, team: toughest.rosterId, value: `opponents ${signed(toughest.sos)} pts / game` },
    steady && { label: 'Most consistent', icon: Gauge, team: steady.rosterId, value: `±${f1(steady.sd)} pts week to week` },
  ].filter((x): x is NonNullable<typeof x> => !!x)

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Scale size={22} aria-hidden className="text-accent" /> Expected Wins &amp; Luck
          </h1>
          <p className="text-ink-3 text-sm">
            Which teams did better or worse than their scores deserved. Computed from Sleeper&apos;s weekly scores, regular season only.
          </p>
        </div>
        <label className="text-ink-2 flex items-center gap-2 text-sm">
          Season
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))} className="border-line bg-card-2 min-h-9 rounded-lg border px-2">
            {h.seasons.map((s, i) => (
              <option key={s.leagueId} value={i}>
                {s.season}
              </option>
            ))}
          </select>
        </label>
      </div>

      {h.pastLoading && <Notice tone="ok">Loading earlier seasons from Sleeper…</Notice>}
      {season.medianGame && (
        <Notice tone="ok">
          This league also plays the weekly median, so each week counts twice: once against your opponent and once against the median.
        </Notice>
      )}

      {h.seasonLoading && report.weeks === 0 ? (
        <ListSkeleton rows={5} />
      ) : report.weeks === 0 ? (
        <EmptyState>No completed regular-season weeks in {season.season} yet. The Luck Index starts after Week 1.</EmptyState>
      ) : (
        <>
          <section aria-label="Highlights" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((x) => (
              <div key={x.label} className={`${CARD} p-4`}>
                <p className="text-ink-3 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
                  <x.icon size={14} aria-hidden className="text-accent" /> {x.label}
                </p>
                <p className="mt-1 truncate font-extrabold">
                  {name(x.team)}
                  {x.team === mine && <span className="text-accent"> (you)</span>}
                </p>
                <p className="text-ink-2 text-sm">{x.value}</p>
              </div>
            ))}
          </section>

          <section aria-label="Luck Index" className={`${CARD} p-4 sm:p-5`}>
            <h2 className={H2}>
              <Clover size={20} aria-hidden className="text-accent" /> Luck Index, {season.season}
            </h2>
            <p className="text-ink-3 mb-3 text-xs">
              {report.weeks} week{report.weeks === 1 ? '' : 's'} · league average {f1(report.leagueAvg)} pts. Sorted luckiest first. Select a
              team to see its weeks.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] text-sm">
                <caption className="sr-only">Actual record, all-play record, expected wins, luck, points and schedule strength for every team</caption>
                <thead>
                  <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                    <th scope="col" className="py-2 pr-2 font-semibold">Team</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold">Record</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold" title="Every week against every other team">All-play</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold">Expected W</th>
                    <th scope="col" className="px-1 py-2 font-semibold">Luck</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold">PF</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold">PA</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold" title="Opponents' average score minus the league average">SOS</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold" title="Standard deviation of weekly scores">Consistency</th>
                    <th scope="col" className="px-1 py-2 text-right font-semibold" title="Wins with the best and worst schedule in the league">Schedule range</th>
                  </tr>
                </thead>
                <tbody>
                  {report.teams.map((t) => (
                    <tr key={t.rosterId} className={`border-line/50 border-b last:border-0 ${t.rosterId === mine ? 'bg-active/50' : ''}`}>
                      <th scope="row" className="py-2 pr-2 text-left font-semibold">
                        <button
                          type="button"
                          aria-pressed={t.rosterId === shownId}
                          onClick={() => setFocus(t.rosterId)}
                          className={`text-left hover:underline ${t.rosterId === shownId ? 'text-accent' : ''}`}
                        >
                          {name(t.rosterId)}
                        </button>
                        {t.rosterId === mine && <span className="text-accent"> (you)</span>}
                      </th>
                      <td className="px-1 py-2 text-right tabular-nums">{record(t)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">
                        {record(t.allPlay)} <span className="text-ink-3">({Math.round(t.allPlayPct * 100)}%)</span>
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">{t.expectedWins.toFixed(1)}</td>
                      <td className="px-1 py-2">
                        <span className="flex items-center gap-2">
                          <LuckBar value={t.luck} max={maxLuck} />
                          <span className={`w-10 text-right font-extrabold tabular-nums ${t.luck >= 0.5 ? 'text-good' : t.luck <= -0.5 ? 'text-bad' : ''}`}>
                            {signed(t.luck)}
                          </span>
                        </span>
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">{f1(t.pf)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{f1(t.pa)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{signed(t.sos)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">±{f1(t.sd)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">
                        {wins(t.scheduleWorst.wins)}–{wins(t.scheduleBest.wins)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {shown && (
            <section aria-label="Week by week" className={`${CARD} p-4 sm:p-5`}>
              <h2 className={H2}>{name(shown.rosterId)}: week by week</h2>
              <p className="text-ink-3 mb-3 text-xs">
                All-play = how many of the other {shown.weeks[0]?.allPlayOf ?? 0} teams that score would have beaten. A lucky win beat its
                opponent with a score below half the league; an unlucky loss lost with a score above it.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <caption className="sr-only">Each week's score, opponent score, result and all-play result</caption>
                  <thead>
                    <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                      <th scope="col" className="py-2 pr-2 font-semibold">Week</th>
                      <th scope="col" className="px-1 py-2 text-right font-semibold">Score</th>
                      <th scope="col" className="px-1 py-2 text-right font-semibold">Opponent</th>
                      <th scope="col" className="px-1 py-2 text-center font-semibold">Result</th>
                      {season.medianGame && <th scope="col" className="px-1 py-2 text-center font-semibold">Median</th>}
                      <th scope="col" className="px-1 py-2 text-right font-semibold">All-play</th>
                      <th scope="col" className="px-1 py-2 font-semibold">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.weeks.map((w) => (
                      <tr key={w.week} className="border-line/50 border-b last:border-0">
                        <th scope="row" className="py-2 pr-2 text-left font-semibold">{w.week}</th>
                        <td className="px-1 py-2 text-right tabular-nums">{f1(w.points)}</td>
                        <td className="px-1 py-2 text-right tabular-nums">{w.oppPoints !== null ? f1(w.oppPoints) : '—'}</td>
                        <td className={`px-1 py-2 text-center font-bold ${w.result === 'W' ? 'text-good' : w.result === 'L' ? 'text-bad' : ''}`}>{w.result ?? '—'}</td>
                        {season.medianGame && <td className="px-1 py-2 text-center">{w.median ?? '—'}</td>}
                        <td className="px-1 py-2 text-right tabular-nums">
                          {wins(w.allPlayWins)} of {w.allPlayOf}
                        </td>
                        <td className="px-1 py-2 text-xs">
                          {w.tag === 'lucky-win' ? (
                            <span className="bg-amber/15 text-amber rounded px-1.5 py-0.5 font-bold">Lucky win</span>
                          ) : w.tag === 'unlucky-loss' ? (
                            <span className="bg-bad/15 text-bad rounded px-1.5 py-0.5 font-bold">Unlucky loss</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section aria-label="Schedule swap" className={`${CARD} p-4 sm:p-5`}>
            <details>
              <summary className="cursor-pointer text-lg font-extrabold">Every team on every schedule</summary>
              <p className="text-ink-3 mt-1 mb-3 text-xs">
                Head-to-head wins each team (row) would have with another team&apos;s schedule (column). The diagonal is the real schedule. When
                the schedule&apos;s opponent is the row team itself, it plays the schedule&apos;s owner instead.
              </p>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <caption className="sr-only">Wins for each team with each other team's schedule</caption>
                  <thead>
                    <tr className="text-ink-3 text-xs">
                      <th scope="col" className="py-1 pr-2 text-left font-semibold">Team ↓ / schedule →</th>
                      {ids.map((id) => (
                        <th key={id} scope="col" className="max-w-24 truncate px-1 py-1 font-semibold" title={name(id)}>
                          {name(id)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ids.map((a) => (
                      <tr key={a} className={a === mine ? 'bg-active/50' : ''}>
                        <th scope="row" className="py-1 pr-2 text-left font-semibold whitespace-nowrap">{name(a)}</th>
                        {ids.map((b) => (
                          <td key={b} className={`px-1 py-1 text-center tabular-nums ${a === b ? 'text-accent font-extrabold' : ''}`}>
                            {wins(report.swap.get(a)?.get(b) ?? 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}

      <section aria-label="How it is calculated" className={`${CARD} p-4 sm:p-5`}>
        <h2 className={H2}>How it is calculated</h2>
        <ul className="text-ink-2 grid list-disc gap-1 pl-5 text-sm">
          <li>
            <b>All-play:</b> each week, your score against every other team&apos;s score that week.
          </li>
          <li>
            <b>Expected wins:</b> the sum of each week&apos;s all-play share, (wins + ties ÷ 2) ÷ (teams − 1): the wins you&apos;d expect against a
            random opponent each week.
          </li>
          <li>
            <b>Luck:</b> actual wins (ties count half) minus expected wins. Across the league it adds up to zero.
          </li>
          <li>
            <b>SOS:</b> your opponents&apos; average score minus the league&apos;s average weekly score. Positive means you faced higher scores.
          </li>
          <li>
            <b>Consistency:</b> the standard deviation of your weekly scores (lower = steadier).
          </li>
          <li>
            <b>Median leagues:</b> when Sleeper reports the league plays the weekly median, that result is added to both actual and expected
            wins (it depends only on your score), so it never changes luck. This setting follows Sleeper&apos;s docs and has not been checked on a
            real median league.
          </li>
          <li>Records are rebuilt from scores; Sleeper&apos;s official standings and tiebreakers are on Standings.</li>
        </ul>
      </section>
    </div>
  )
}

export default function Luck() {
  return <LeagueGate>{(data) => <LuckView data={data} />}</LeagueGate>
}
