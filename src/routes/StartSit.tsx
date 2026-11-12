import { Scale, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { LeagueGate } from '../components/LeagueGate'
import { InjuryTag, Ownership } from '../components/opportunity/parts'
import { PlayerAvatar } from '../components/ui/Avatar'
import { PosTag } from '../components/ui/Pill'
import { RangeBar } from '../components/ui/RangeBar'
import { EmptyState, Notice } from '../components/ui/states'
import { WeatherIndicator } from '../components/weather/WeatherIndicator'
import type { Ready } from '../hooks/useLeagueData'
import { useLineupInputs } from '../hooks/useLineupInputs'
import { useProjectionEngine } from '../hooks/useProjectionEngine'
import { useUsageBook } from '../hooks/useUsageBook'
import { defenseKey, defenseVsPosition } from '../lib/analytics/matchup'
import { IDX, leanFor, pickFor, SIMS, simulateStartSit, type Lean } from '../lib/analytics/startsit'
import { sampleSd } from '../lib/analytics/volatility'
import { f1, ordinal } from '../lib/format'
import { findMyMatchup, gameDay } from '../lib/insights'

const MAX = 4
const FLEXY = new Set(['RB', 'WR', 'TE'])
const LEAN_TEXT: Record<Lean, string> = {
  floor: 'You are a clear favorite this week, so the steadier floor matters most.',
  ceiling: 'You are an underdog this week, so upside (the ceiling) matters most.',
  median: 'Your matchup is close, so the middle of the range (the median) decides it.',
}

/** The closest call on my roster: the weakest RB/WR/TE starter vs the best RB/WR/TE on the bench. */
function defaultPair(data: Ready): string[] {
  const { model: m, matchups } = data
  const roster = m.myRoster()?.players ?? []
  const starters = new Set(
    (findMyMatchup(matchups, m.myRosterId)?.starters ?? []).filter((x) => x && x !== '0'),
  )
  const flex = roster.filter((id) => FLEXY.has(m.pos(id)))
  const weakStarter = flex
    .filter((id) => starters.has(id))
    .sort((a, b) => m.projPts(a) - m.projPts(b))[0]
  const bestBench = flex
    .filter((id) => !starters.has(id))
    .sort((a, b) => m.projPts(b) - m.projPts(a))[0]
  const pair = [weakStarter, bestBench].filter(Boolean) as string[]
  return pair.length === 2
    ? pair
    : [...roster].sort((a, b) => m.projPts(b) - m.projPts(a)).slice(0, 2)
}

function StartSitView({ data }: { data: Ready }) {
  const { model: m, matchups, season, week } = data
  const engine = useProjectionEngine(data)
  const inputs = useLineupInputs(season, week)
  const { book } = useUsageBook(data)
  const [picked, setPicked] = useState<string[]>(() => defaultPair(data))

  const gd = useMemo(() => gameDay(m, matchups), [m, matchups])
  const winPct = gd && gd.oppRosterId !== null ? gd.winPct : null
  const lean = leanFor(winPct)
  const defense = useMemo(
    () =>
      defenseVsPosition(
        inputs.weeks.filter((w) => w.week < week),
        m.scoring,
        m.pos,
      ),
    [inputs.weeks, week, m],
  )
  const opponentOf = useMemo(
    () => new Map(inputs.projectionRows.map((r) => [r.player_id, r.opponent ?? null])),
    [inputs.projectionRows],
  )

  const rows = picked.map((id) => {
    const p = engine.projectionFor(id)
    const games = book.games.get(id) ?? []
    const opp = opponentOf.get(id) ?? null
    return {
      id,
      p,
      opp,
      dvp: opp ? (defense.get(defenseKey(opp, m.pos(id))) ?? null) : null,
      sd: games.length >= 3 ? sampleSd(games.map((g) => g.pts)) : null,
      games: games.length,
    }
  })
  const dists = rows.map((r) => r.p.dist)
  // 10,000 draws for up to 4 players takes a few milliseconds, so no memo needed
  const sim =
    dists.every((d) => d) && dists.length >= 2 ? simulateStartSit(dists as number[][]) : null
  const pick = pickFor(lean, dists)

  const roster = (m.myRoster()?.players ?? []).filter(
    (id) => m.pos(id) !== 'DEF' && m.pos(id) !== 'K',
  )
  const fas = useMemo(() => [...m.freeAgents()].sort((a, b) => b.pj - a.pj).slice(0, 40), [m])
  const toggle = (id: string) =>
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX ? cur : [...cur, id],
    )
  const domainMax = Math.max(1, ...rows.map((r) => r.p.range?.ceiling ?? r.p.value))

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
        <Scale size={24} aria-hidden className="text-accent" /> Start/Sit Simulator
      </h1>
      <p className="text-ink-2 mt-1 max-w-3xl">
        Compare up to {MAX} players. Each is simulated {SIMS.toLocaleString()} times from his
        projection and the spread of past projection errors at his position and projection size, so
        the odds come from real outcomes, not guesses.
      </p>

      <section
        aria-label="Choose players"
        className="border-line bg-card mt-5 rounded-2xl border p-5"
      >
        <h2 className="mb-3 font-bold">Your players</h2>
        <div className="flex flex-wrap gap-2">
          {roster.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={picked.includes(id)}
              onClick={() => toggle(id)}
              className={`min-h-10 rounded-full border px-3 text-sm font-semibold transition-colors ${
                picked.includes(id)
                  ? 'border-accent bg-accent/15 text-ink'
                  : 'border-line text-ink-2 hover:text-ink'
              }`}
            >
              {m.shortName(id)} <span className="text-ink-3">{m.pos(id)}</span>
            </button>
          ))}
        </div>
        <label className="text-ink-2 mt-4 flex flex-wrap items-center gap-2 text-sm">
          Add a free agent
          <select
            value=""
            onChange={(e) => e.target.value && toggle(e.target.value)}
            disabled={picked.length >= MAX}
            className="border-line bg-panel text-ink min-h-10 rounded-lg border px-2"
          >
            <option value="">Choose…</option>
            {fas.map((f) => (
              <option key={f.id} value={f.id}>
                {m.name(f.id)} ({f.pos}, {f1(f.pj)} proj)
              </option>
            ))}
          </select>
          {picked.length >= MAX && <span className="text-ink-3">Up to {MAX} at a time.</span>}
        </label>
      </section>

      {rows.length < 2 ? (
        <div className="mt-5">
          <EmptyState>Pick at least two players to compare.</EmptyState>
        </div>
      ) : (
        <>
          <section
            aria-label="Recommendation"
            className="border-plan-line from-plan-from to-plan-to mt-5 rounded-2xl border bg-gradient-to-br p-5"
          >
            <p className="text-ink-2 text-sm">
              {winPct !== null
                ? `Your win probability this week: ${winPct}% (model). `
                : 'No matchup posted, so the median decides. '}
              {LEAN_TEXT[lean]}
            </p>
            {pick !== null ? (
              <p className="mt-2 text-xl font-extrabold">
                Lean {m.name(rows[pick].id)}: {lean} {f1(rows[pick].p.dist![IDX[lean]])} pts
              </p>
            ) : (
              <p className="mt-2 font-bold">Not enough projection-error data to compare ranges.</p>
            )}
            <p className="text-ink-3 mt-2 text-xs">
              A rule of thumb, not a certainty. Players are simulated independently, and outcomes
              past the 5th/95th percentile are held at those values.
            </p>
          </section>
          {engine.modelMissing && (
            <Notice>
              The projection model isn&apos;t published yet, so projections are Sleeper&apos;s and
              ranges are unavailable.
            </Notice>
          )}

          <ul
            aria-label="Comparison"
            className={`mt-5 grid gap-4 ${rows.length >= 3 ? 'lg:grid-cols-3 xl:grid-cols-4' : 'md:grid-cols-2'}`}
          >
            {rows.map((r, i) => (
              <li
                key={r.id}
                aria-label={m.name(r.id)}
                className={`bg-card rounded-2xl border p-5 ${pick === i ? 'border-accent' : 'border-line'}`}
              >
                <div className="flex items-start gap-3">
                  <PlayerAvatar player={m.players[r.id]} className="size-12 text-sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/players/${r.id}`}
                      className="block truncate font-extrabold hover:underline"
                    >
                      {m.name(r.id)}
                    </Link>
                    <div className="text-ink-3 mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
                      <PosTag pos={m.pos(r.id)} />
                      <span>{m.team(r.id) || 'FA'}</span>
                      <InjuryTag status={m.injury(r.id)} />
                      <WeatherIndicator team={m.team(r.id)} week={week} />
                    </div>
                    <div className="mt-1">
                      <Ownership m={m} id={r.id} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-label={`Remove ${m.name(r.id)}`}
                    className="text-ink-3 hover:text-ink grid size-9 place-items-center rounded-lg"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>
                <div className="mt-4 text-center">
                  <div className="text-4xl font-extrabold tabular-nums">
                    {sim ? `${Math.round(sim.best[i] * 100)}%` : '—'}
                  </div>
                  <div className="text-ink-3 text-sm">chance to score the most</div>
                </div>
                <div className="mt-4">
                  <RangeBar
                    proj={r.p.value}
                    floor={r.p.dist?.[IDX.floor] ?? null}
                    ceiling={r.p.dist?.[IDX.ceiling] ?? null}
                    domainMax={domainMax}
                  />
                </div>
                <dl className="mt-3 grid gap-1.5 text-sm">
                  {(
                    [
                      ['Projection', `${f1(r.p.value)}${r.p.enabled ? ' (corrected)' : ''}`],
                      [
                        'Floor / median / ceiling',
                        r.p.dist
                          ? `${f1(r.p.dist[IDX.floor])} / ${f1(r.p.dist[IDX.median])} / ${f1(r.p.dist[IDX.ceiling])}`
                          : '—',
                      ],
                      [
                        'Matchup',
                        r.dvp
                          ? `vs ${r.opp}: ${ordinal(r.dvp.rank)} most allowed to ${m.pos(r.id)}s (${f1(r.dvp.perGame)} vs ${f1(r.dvp.leagueAvg)} avg)`
                          : r.opp
                            ? `vs ${r.opp}`
                            : 'No game',
                      ],
                      [
                        'Last 3 games',
                        r.p.recentGames.length
                          ? `${f1(r.p.recentGames.reduce((a, g) => a + g.pts, 0) / r.p.recentGames.length)} avg`
                          : '—',
                      ],
                      [
                        'Consistency',
                        r.sd !== null
                          ? `±${f1(r.sd)} pts week to week (${r.games} games)`
                          : 'Fewer than 3 games',
                      ],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-ink-3 shrink-0">{k}</dt>
                      <dd className="text-right font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <p className="text-ink-3 mt-4 text-xs">
            Matchup is context only (Sleeper projections may already include it). Ranks: 1 = most
            points allowed to the position this season.
          </p>
        </>
      )}
    </div>
  )
}

export default function StartSit() {
  return <LeagueGate>{(data) => <StartSitView data={data} />}</LeagueGate>
}
