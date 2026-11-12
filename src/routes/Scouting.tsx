import { useId, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ProjNotice } from '../components/cards/shared'
import { LeagueGate } from '../components/LeagueGate'
import { TeamAvatar } from '../components/ui/Avatar'
import { Pill, PosTag } from '../components/ui/Pill'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useLeagueMatchups } from '../hooks/useLeagueMatchups'
import { findMyMatchup, findOpponent } from '../lib/insights'
import { f1, ordinal, signed } from '../lib/format'
import { OUT_INJ } from '../lib/lineup'
import {
  headToHead,
  lineupFacts,
  positionStrengths,
  projectedLineup,
  scoreHistory,
  teamForm,
} from '../lib/analytics/scouting'

function Tag({ kind }: { kind: 'fact' | 'model' }) {
  return kind === 'fact' ? (
    <span className="text-good text-[11px] font-extrabold tracking-wide uppercase">Sleeper fact</span>
  ) : (
    <span className="text-amber text-[11px] font-extrabold tracking-wide uppercase">Model</span>
  )
}

function Section({ title, kind, children }: { title: string; kind: 'fact' | 'model'; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="border-line bg-card mt-4 rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-extrabold">
          {title}
        </h2>
        <Tag kind={kind} />
      </div>
      {children}
    </section>
  )
}

function ScoutingView({ data }: { data: Ready }) {
  const { model: m, matchups, week, league } = data
  const opp = findOpponent(matchups, m.myRosterId)
  const others = m.rosters.filter((r) => r.roster_id !== m.myRosterId)
  const [team, setTeam] = useState<number>(opp?.roster_id ?? others[0]?.roster_id ?? 0)
  const selectId = useId()
  const past = useMemo(() => Array.from({ length: Math.max(0, week - 1) }, (_, i) => i + 1), [week])
  const history = useLeagueMatchups(league.league_id, past)

  const isOpponent = opp?.roster_id === team
  const scores = useMemo(() => scoreHistory(history.weeks, team), [history.weeks, team])
  const form = teamForm(scores)
  const strengths = useMemo(() => positionStrengths(m, team), [m, team])
  const h2h = useMemo(() => headToHead(m, m.myRosterId, team), [m, team])
  const projected = useMemo(() => projectedLineup(m, team), [m, team])
  const theirMatchup = matchups.find((x) => x.roster_id === team) ?? null
  const facts = lineupFacts(m, theirMatchup)
  const injured = (m.rosterById(team)?.players ?? []).filter((id) => m.injury(id))

  const set = new Set((theirMatchup?.starters ?? []).filter((x) => x && x !== '0'))
  const bestNotSet = projected.filter((s) => s.id && !set.has(s.id) && s.proj > 0)
  const sorted = [...strengths].filter((s) => s.group !== 'OTHER').sort((a, b) => a.rank - b.rank)
  const strong = sorted.filter((s) => s.rank <= Math.ceil(s.of / 3))
  const weak = sorted.filter((s) => s.rank > s.of - Math.ceil(s.of / 3))

  if (others.length === 0) return <EmptyState>There are no other teams in this league.</EmptyState>

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Opponent Scouting</h1>
      <p className="text-ink-3 mb-4 text-sm">
        <b className="text-good">Sleeper facts</b> (scores, set lineups, injury designations) are shown apart from <b className="text-amber">model</b> estimates (projected lineups, strengths, win odds). Nothing here predicts what a manager will do.
      </p>
      <ProjNotice data={data} />

      <label htmlFor={selectId} className="mb-1 block text-sm font-bold">
        Team
      </label>
      <select id={selectId} value={team} onChange={(e) => setTeam(Number(e.target.value))} className="border-line bg-card mb-2 w-full rounded-2xl border px-4 py-3 font-bold">
        {others.map((r) => (
          <option key={r.roster_id} value={r.roster_id}>
            {m.teamName(r.roster_id)}
            {r.roster_id === opp?.roster_id ? ` (your Week ${week} opponent)` : ''}
          </option>
        ))}
      </select>

      <div className="border-line bg-card flex items-center gap-3 rounded-2xl border p-4">
        <TeamAvatar user={m.ownerOf(team)} className="size-14 text-lg" />
        <div className="min-w-0">
          <div className="text-xl font-extrabold">{m.teamName(team)}</div>
          <div className="text-ink-3 text-sm">
            {form ? `${form.record} · ${f1(form.avg)} pts/game · streak ${form.streak}` : history.loading ? 'Loading results…' : history.failed ? 'Results unavailable' : 'No completed games yet'}
          </div>
        </div>
        {isOpponent && <Pill tone="prio">This week</Pill>}
      </div>

      {(
        <Section title={isOpponent ? `Week ${week} head-to-head` : `If you played them in Week ${week}`} kind="model">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span>
              You <b className="text-2xl">{f1(h2h.myProj)}</b>
            </span>
            <span>
              Them <b className="text-2xl">{f1(h2h.theirProj)}</b>
            </span>
            <span className="text-ink-2">
              Win probability <b>{h2h.winPct}%</b>
            </span>
          </div>
          <ul className="grid gap-2">
            {h2h.groups.filter((g) => g.group !== 'OTHER').map((g) => {
              const total = Math.max(g.mine + g.theirs, 1)
              return (
                <li key={g.group} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-2 text-sm">
                  <span className="font-extrabold">{g.group}</span>
                  <div role="img" aria-label={`${g.group}: you ${f1(g.mine)}, them ${f1(g.theirs)}`} className="bg-line flex h-2.5 overflow-hidden rounded-full">
                    <span className="bg-accent h-full" style={{ width: `${(g.mine / total) * 100}%` }} />
                    <span className="bg-coral/70 h-full" style={{ width: `${(g.theirs / total) * 100}%` }} />
                  </div>
                  <span className={`text-right font-bold ${g.edge >= 0 ? 'text-good' : 'text-amber'}`}>{signed(g.edge)}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-ink-3 mt-2 text-xs">Blue = your best projected lineup, red = theirs, from Sleeper projections. Positive = your edge.</p>
        </Section>
      )}

      <Section title="Strengths and weaknesses" kind="model">
        <p className="text-ink-2 mb-3 text-sm">
          {strong.length > 0 && <>Strongest: <b>{strong.map((s) => `${s.group} (${ordinal(s.rank)} of ${s.of})`).join(', ')}</b>. </>}
          {weak.length > 0 && <>Weakest: <b>{weak.map((s) => `${s.group} (${ordinal(s.rank)} of ${s.of})`).join(', ')}</b>.</>}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Projected points by position group vs the league</caption>
            <thead>
              <tr className="text-ink-3 border-line border-b text-xs">
                <th scope="col" className="py-2 text-left">Group</th>
                <th scope="col" className="py-2 text-right">Projected</th>
                <th scope="col" className="py-2 text-right">League avg</th>
                <th scope="col" className="py-2 text-right">Rank</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.group} className="border-line/50 border-b">
                  <td className="py-2 font-bold">{s.group}</td>
                  <td className="py-2 text-right">{f1(s.proj)}</td>
                  <td className="py-2 text-right">{f1(s.leagueAvg)}</td>
                  <td className="py-2 text-right">{ordinal(s.rank)} of {s.of}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Their lineup in Sleeper (Week ${week})`} kind="fact">
        {!facts ? (
          <EmptyState>No Week {week} matchup is posted for this team.</EmptyState>
        ) : (
          <>
            {facts.empty.length === 0 && facts.unavailable.length === 0 && facts.questionable.length === 0 ? (
              <Notice tone="ok">Every starting slot is filled with a player who has no injury designation.</Notice>
            ) : (
              <ul className="text-ink-2 grid gap-1 text-sm">
                {facts.empty.length > 0 && <li>Empty starting slot{facts.empty.length > 1 ? 's' : ''}: <b>{facts.empty.join(', ')}</b></li>}
                {facts.unavailable.map((u) => <li key={u.id}><b>{m.name(u.id)}</b> is starting and listed <b>{u.injury}</b>.</li>)}
                {facts.questionable.map((u) => <li key={u.id}><b>{m.name(u.id)}</b> is starting and listed <b>{u.injury}</b>.</li>)}
              </ul>
            )}
            {bestNotSet.length > 0 && (
              <p className="text-ink-3 mt-2 text-xs">
                Model note: their best projected lineup would also include {bestNotSet.map((s) => m.shortName(s.id!)).join(', ')}. Lineups can change until kickoff.
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Best projected lineup" kind="model">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {projected.map((s, i) => (
            <li key={`${s.slot}-${i}`} className="border-line bg-panel flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <span className="bg-line text-ink-2 w-12 rounded-full px-2 py-0.5 text-center text-xs font-extrabold">{s.label}</span>
              {s.id ? (
                <>
                  <PosTag pos={m.pos(s.id)} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{m.shortName(s.id)}</span>
                  <span className="font-bold">{f1(s.proj)}</span>
                </>
              ) : (
                <span className="text-ink-3 italic">No eligible player</span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Results this season" kind="fact">
        {history.loading ? (
          <ListSkeleton rows={2} />
        ) : history.failed ? (
          <Notice>Past results couldn't be loaded.</Notice>
        ) : scores.length === 0 ? (
          <EmptyState>No completed games yet.</EmptyState>
        ) : (
          <>
            <p className="text-ink-2 mb-2 text-sm">
              {form!.record} · average {f1(form!.avg)} · last 3 {f1(form!.last3)} ({form!.label === 'hot' ? 'running hot' : form!.label === 'cold' ? 'running cold' : 'steady'}) · high {f1(form!.high)} · low {f1(form!.low)}
            </p>
            <div className="h-48" role="img" aria-label={`Weekly scores: ${scores.map((s) => `week ${s.week} ${f1(s.points)} ${s.result}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scores} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickFormatter={(w: number) => `W${w}`} />
                  <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--panel)' }}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' }}
                    formatter={(v) => [f1(Number(v)), 'Points']}
                    labelFormatter={(w) => `Week ${String(w)}`}
                  />
                  <ReferenceLine y={form!.avg} stroke="var(--amber)" strokeDasharray="4 4" />
                  <Bar dataKey="points" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-2 text-sm">
              <summary className="text-accent cursor-pointer font-bold">Results as a table</summary>
              <ul className="mt-2 grid gap-1">
                {scores.map((s) => (
                  <li key={s.week}>
                    Week {s.week}: {f1(s.points)} vs {f1(s.opponentPoints)} ({s.opponentRosterId ? m.teamName(s.opponentRosterId) : 'unknown'}) <b>{s.result}</b>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </Section>

      <Section title="Injury designations on their roster" kind="fact">
        {injured.length === 0 ? (
          <Notice tone="ok">No injury designations on their roster.</Notice>
        ) : (
          <ul className="grid gap-1.5 text-sm">
            {injured.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <PosTag pos={m.pos(id)} />
                <span className="font-semibold">{m.name(id)}</span>
                <Pill tone={OUT_INJ.has(m.injury(id)) ? 'warn' : 'caution'}>{m.injury(id)}</Pill>
                {set.has(id) && <span className="text-ink-3 text-xs">(in their set lineup)</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {findMyMatchup(matchups, m.myRosterId) === null && <Notice>Your own Week {week} matchup isn't posted yet.</Notice>}
    </div>
  )
}

export default function Scouting() {
  return <LeagueGate>{(data) => <ScoutingView data={data} />}</LeagueGate>
}
