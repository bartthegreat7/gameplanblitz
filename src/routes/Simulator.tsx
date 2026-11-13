import { useQuery } from '@tanstack/react-query'
import { FlaskRound, Plus, RotateCcw, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { CARD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useProjectionHorizon } from '../hooks/useProjectionHorizon'
import { useSeasonSim } from '../hooks/useSeasonSim'
import { createValuer } from '../lib/analytics/lineupValue'
import { oddsWithShift } from '../lib/analytics/playoffs'
import { EMPTY_SCENARIO, evaluateScenario, isEmpty, type Scenario, type SideResult } from '../lib/analytics/whatif'
import { f1 } from '../lib/format'
import { gameDay } from '../lib/insights'
import { getSchedule } from '../lib/sleeper'

const FANTASY = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
const SELECT = 'border-line bg-card min-h-10 min-w-0 rounded-lg border px-2 text-sm'
const BTN = 'border-line hover:border-accent/60 hover:bg-raised inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition-colors disabled:opacity-40'
const pct = (x: number) => (x >= 99.5 ? '>99%' : x > 0 && x < 1 ? '<1%' : `${Math.round(x)}%`)

function Row({ label, cur, next, fmt = f1, better = 'up', note }: { label: string; cur: number | null; next: number | null; fmt?: (n: number) => string; better?: 'up' | 'down'; note?: string }) {
  const d = cur !== null && next !== null ? next - cur : null
  const good = d !== null && (better === 'up' ? d > 0.05 : d < -0.05)
  const bad = d !== null && (better === 'up' ? d < -0.05 : d > 0.05)
  return (
    <tr className="border-line/50 border-b last:border-0">
      <th scope="row" className="py-2 pr-3 text-left font-semibold">
        {label}
        {note && <span className="text-ink-3 block text-xs font-normal">{note}</span>}
      </th>
      <td className="py-2 text-right tabular-nums">{cur === null ? '—' : fmt(cur)}</td>
      <td className="py-2 text-right font-extrabold tabular-nums">{next === null ? '—' : fmt(next)}</td>
      <td className={`py-2 pl-3 text-right font-bold tabular-nums ${good ? 'text-good' : bad ? 'text-bad' : 'text-ink-3'}`}>
        {d === null || Math.abs(d) < 0.05 ? '—' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`}
      </td>
    </tr>
  )
}

function Bars({ weeks, cur, next }: { weeks: number[]; cur: SideResult; next: SideResult }) {
  const max = Math.max(1, ...cur.weekly, ...next.weekly)
  return (
    <figure className="m-0">
      <div className="flex items-end gap-3" aria-hidden>
        {weeks.map((w, k) => (
          <div key={w} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end justify-center gap-1">
              <span className="bg-line w-1/3 rounded-t" style={{ height: `${(cur.weekly[k] / max) * 100}%` }} />
              <span className="bg-accent-deep w-1/3 rounded-t" style={{ height: `${(next.weekly[k] / max) * 100}%` }} />
            </div>
            <span className="text-ink-3 text-xs">Wk {w}</span>
          </div>
        ))}
      </div>
      <figcaption className="text-ink-3 mt-1 text-xs">
        <span className="bg-line mr-1 inline-block size-2.5 rounded-sm align-middle" /> current ·{' '}
        <span className="bg-accent-deep mr-1 inline-block size-2.5 rounded-sm align-middle" /> proposed: best lineup each week (Sleeper projections)
      </figcaption>
      <table className="sr-only">
        <caption>Projected points by week</caption>
        <tbody>
          {weeks.map((w, k) => (
            <tr key={w}>
              <th scope="row">Week {w}</th>
              <td>current {f1(cur.weekly[k])}</td>
              <td>proposed {f1(next.weekly[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function Builder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-line/70 grid gap-2 rounded-xl border p-3">
      <legend className="px-1 text-sm font-extrabold">{title}</legend>
      {children}
    </fieldset>
  )
}

function SimulatorView({ data }: { data: Ready }) {
  const { model: m, matchups, week, season } = data
  const horizon = useProjectionHorizon(season, week)
  const scheduleQ = useQuery({ queryKey: ['schedule', season], queryFn: () => getSchedule(season), staleTime: 30 * 60_000, retry: 1 })
  const sim = useSeasonSim(data)
  const gd = useMemo(() => gameDay(m, matchups), [m, matchups])
  const opp = gd?.oppRosterId ?? null
  const [s, setS] = useState<Scenario>(EMPTY_SCENARIO)
  const weeks = horizon.horizon.map((h) => h.week)
  const valuer = useMemo(() => createValuer(m, horizon.horizon, scheduleQ.data ?? null), [m, horizon.horizon, scheduleQ.data])
  const result = useMemo(() => (weeks.length ? evaluateScenario(m, valuer, weeks, s, opp) : null), [m, valuer, weeks.length, s, opp]) // eslint-disable-line react-hooks/exhaustive-deps
  const odds = useMemo(() => {
    if (!sim.input || !result) return null
    const shifts = [{ rosterId: m.myRosterId, perWeek: result.mine.proposed.avg - result.mine.current.avg }]
    for (const o of [result.opp, result.partner]) if (o) shifts.push({ rosterId: o.rosterId, perWeek: o.proposed.avg - o.current.avg })
    const { before, after } = oddsWithShift(sim.input, shifts)
    const pick = (xs: typeof before) => xs.find((x) => x.rosterId === m.myRosterId) ?? null
    return { before: pick(before), after: pick(after) }
  }, [sim.input, result, m.myRosterId])

  const mine = m.myRoster()?.players ?? []
  const rostered = m.allRostered()
  const fas = useMemo(
    () =>
      Object.values(m.players)
        .filter((p) => FANTASY.has(p.position ?? '') && !rostered.has(p.player_id) && p.team && m.projPts(p.player_id) > 0)
        .sort((a, b) => m.projPts(b.player_id) - m.projPts(a.player_id))
        .slice(0, 80)
        .map((p) => p.player_id),
    [m, rostered],
  )
  const others = m.rosters.filter((r) => r.roster_id !== m.myRosterId)
  const [fa, setFa] = useState('')
  const [drop, setDrop] = useState('')
  const [partner, setPartner] = useState<number>(others[0]?.roster_id ?? 0)
  const [give, setGive] = useState('')
  const [get, setGet] = useState('')
  const [hurt, setHurt] = useState('')
  const [hurtWeeks, setHurtWeeks] = useState(1)
  const label = (id: string) => `${m.name(id)} (${m.pos(id)}, ${f1(m.projPts(id))})`
  const update = (p: Partial<Scenario>) => setS((x) => ({ ...x, ...p }))

  const chips: { key: string; text: string; remove: () => void }[] = [
    ...s.forceStart.map((id) => ({ key: `fs${id}`, text: `Start ${m.shortName(id)} this week`, remove: () => update({ forceStart: s.forceStart.filter((x) => x !== id) }) })),
    ...s.forceBench.map((id) => ({ key: `fb${id}`, text: `Bench ${m.shortName(id)} this week`, remove: () => update({ forceBench: s.forceBench.filter((x) => x !== id) }) })),
    ...s.adds.map((id) => ({ key: `a${id}`, text: `Add ${m.shortName(id)}`, remove: () => update({ adds: s.adds.filter((x) => x !== id) }) })),
    ...s.drops.map((id) => ({ key: `d${id}`, text: `Drop ${m.shortName(id)}`, remove: () => update({ drops: s.drops.filter((x) => x !== id) }) })),
    ...(s.trade
      ? [{ key: 'trade', text: `Trade ${s.trade.give.map(m.shortName).join(', ')} to ${m.teamName(s.trade.rosterId)} for ${s.trade.get.map(m.shortName).join(', ')}`, remove: () => update({ trade: null }) }]
      : []),
    ...s.injuries.map((i) => ({ key: `i${i.id}`, text: `${m.shortName(i.id)} out ${i.weeks >= 99 ? 'for the horizon' : `${i.weeks} wk`}`, remove: () => update({ injuries: s.injuries.filter((x) => x.id !== i.id) }) })),
  ]
  const r = result

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <FlaskRound size={22} aria-hidden className="text-accent" /> Alternate Reality Simulator
        </h1>
        <p className="text-ink-3 text-sm">
          Try a change before you make it. Nothing here touches your Sleeper roster.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section aria-label="Build a scenario" className={`${CARD} grid content-start gap-3 p-4 sm:p-5`}>
          <h2 className="text-lg font-extrabold">Your proposed changes</h2>
          <Builder title="Lineup this week">
            <ul className="grid gap-1 text-sm">
              {mine
                .filter((id) => FANTASY.has(m.pos(id)))
                .sort((a, b) => m.projPts(b) - m.projPts(a))
                .map((id) => {
                  const v = s.forceStart.includes(id) ? 'start' : s.forceBench.includes(id) ? 'bench' : 'auto'
                  return (
                    <li key={id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{label(id)}</span>
                      <select
                        aria-label={`${m.name(id)} this week`}
                        value={v}
                        onChange={(e) => {
                          const n = e.target.value
                          update({
                            forceStart: n === 'start' ? [...s.forceStart.filter((x) => x !== id), id] : s.forceStart.filter((x) => x !== id),
                            forceBench: n === 'bench' ? [...s.forceBench.filter((x) => x !== id), id] : s.forceBench.filter((x) => x !== id),
                          })
                        }}
                        className={`${SELECT} w-24`}
                      >
                        <option value="auto">Best</option>
                        <option value="start">Start</option>
                        <option value="bench">Bench</option>
                      </select>
                    </li>
                  )
                })}
            </ul>
          </Builder>
          <Builder title="Waiver move">
            <select aria-label="Free agent to add" value={fa} onChange={(e) => setFa(e.target.value)} className={SELECT}>
              <option value="">Add a free agent…</option>
              {fas.map((id) => (
                <option key={id} value={id}>{label(id)}</option>
              ))}
            </select>
            <select aria-label="Player to drop" value={drop} onChange={(e) => setDrop(e.target.value)} className={SELECT}>
              <option value="">Drop (optional)…</option>
              {mine.map((id) => (
                <option key={id} value={id}>{label(id)}</option>
              ))}
            </select>
            <button type="button" disabled={!fa && !drop} onClick={() => { update({ adds: fa ? [...s.adds, fa] : s.adds, drops: drop ? [...s.drops, drop] : s.drops }); setFa(''); setDrop('') }} className={BTN}>
              <Plus size={15} aria-hidden /> Add to scenario
            </button>
          </Builder>
          <Builder title="Trade">
            <select aria-label="Trade partner" value={partner} onChange={(e) => { setPartner(Number(e.target.value)); setGet('') }} className={SELECT}>
              {others.map((o) => (
                <option key={o.roster_id} value={o.roster_id}>{m.teamName(o.roster_id)}</option>
              ))}
            </select>
            <select aria-label="Player you give" value={give} onChange={(e) => setGive(e.target.value)} className={SELECT}>
              <option value="">You give…</option>
              {mine.map((id) => (
                <option key={id} value={id}>{label(id)}</option>
              ))}
            </select>
            <select aria-label="Player you get" value={get} onChange={(e) => setGet(e.target.value)} className={SELECT}>
              <option value="">You get…</option>
              {(m.rosterById(partner)?.players ?? []).map((id) => (
                <option key={id} value={id}>{label(id)}</option>
              ))}
            </select>
            <button type="button" disabled={!give || !get} onClick={() => { const t = s.trade && s.trade.rosterId === partner ? s.trade : { rosterId: partner, give: [], get: [] }; update({ trade: { rosterId: partner, give: [...t.give, give], get: [...t.get, get] } }); setGive(''); setGet('') }} className={BTN}>
              <Plus size={15} aria-hidden /> Add to trade
            </button>
            <p className="text-ink-3 text-xs">Draft picks and keeper costs: use the Trade War Room and Keeper Tools, which price them.</p>
          </Builder>
          <Builder title="Injury">
            <select aria-label="Player who gets hurt" value={hurt} onChange={(e) => setHurt(e.target.value)} className={SELECT}>
              <option value="">A player misses time…</option>
              {[...rostered].filter((id) => FANTASY.has(m.pos(id))).sort((a, b) => m.projPts(b) - m.projPts(a)).map((id) => (
                <option key={id} value={id}>{label(id)}</option>
              ))}
            </select>
            <select aria-label="Weeks out" value={hurtWeeks} onChange={(e) => setHurtWeeks(Number(e.target.value))} className={SELECT}>
              <option value={1}>Out 1 week</option>
              <option value={2}>Out 2 weeks</option>
              <option value={99}>Out for every horizon week</option>
            </select>
            <button type="button" disabled={!hurt} onClick={() => { update({ injuries: [...s.injuries.filter((i) => i.id !== hurt), { id: hurt, weeks: hurtWeeks }] }); setHurt('') }} className={BTN}>
              <Plus size={15} aria-hidden /> Add to scenario
            </button>
          </Builder>
        </section>

        <section aria-label="Current team vs proposed" className={`${CARD} grid content-start gap-4 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-lg font-extrabold">Current team vs. proposed</h2>
            <button type="button" disabled={isEmpty(s)} onClick={() => setS(EMPTY_SCENARIO)} className={BTN}>
              <RotateCcw size={15} aria-hidden /> Reset
            </button>
          </div>
          {chips.length > 0 ? (
            <ul aria-label="Changes in this scenario" className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <li key={c.key} className="border-accent/50 bg-accent/10 inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs font-bold">
                  {c.text}
                  <button type="button" onClick={c.remove} aria-label={`Remove: ${c.text}`} className="hover:bg-raised grid size-5 place-items-center rounded-full">
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 text-sm">Add a change on the left to see its effect.</p>
          )}
          {!r ? (
            horizon.loading ? <ListSkeleton rows={4} /> : <EmptyState>No projections for the coming weeks yet.</EmptyState>
          ) : (
            <>
              <table className="w-full text-sm">
                <caption className="sr-only">Current team compared with the proposed changes</caption>
                <thead>
                  <tr className="text-ink-3 border-line border-b text-xs tracking-wide uppercase">
                    <th scope="col" className="pb-2 text-left font-semibold">Measure</th>
                    <th scope="col" className="pb-2 text-right font-semibold">Current</th>
                    <th scope="col" className="pb-2 text-right font-semibold">Proposed</th>
                    <th scope="col" className="pb-2 pl-3 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label={`Week ${week} projected points`} cur={r.mine.current.week0} next={r.mine.proposed.week0} />
                  {r.win && <Row label="Win chance this week" note={`vs ${m.teamName(r.opp!.rosterId)} · model`} cur={r.win.current} next={r.win.proposed} fmt={(n) => `${Math.round(n)}%`} />}
                  <Row label={`Average, Weeks ${weeks[0]}-${weeks[weeks.length - 1]}`} note="best lineup each week" cur={r.mine.current.avg} next={r.mine.proposed.avg} />
                  {odds?.before && odds.after && (
                    <>
                      <Row label="Playoff odds" note="seeded simulation, same random draws" cur={odds.before.playoffPct} next={odds.after.playoffPct} fmt={pct} />
                      <Row label="Title odds" cur={odds.before.championPct} next={odds.after.championPct} fmt={pct} />
                    </>
                  )}
                  <Row label="Starters with a designation" cur={r.mine.current.designated.length} next={r.mine.proposed.designated.length} fmt={(n) => String(Math.round(n))} better="down" />
                  <Row label="Most starters on one bye" note="this week's starters, horizon weeks" cur={r.mine.current.byeHit?.count ?? 0} next={r.mine.proposed.byeHit?.count ?? 0} fmt={(n) => String(Math.round(n))} better="down" />
                  <Row label="Bench depth" note="best three bench players this week" cur={r.mine.current.benchDepth} next={r.mine.proposed.benchDepth} />
                  {(r.partner ?? (s.trade && r.opp && s.trade.rosterId === r.opp.rosterId ? r.opp : null)) && (() => {
                    const p = r.partner ?? r.opp!
                    return <Row label={`${m.teamName(p.rosterId)} weekly average`} note="the other side of the trade" cur={p.current.avg} next={p.proposed.avg} />
                  })()}
                </tbody>
              </table>
              <Bars weeks={weeks} cur={r.mine.current} next={r.mine.proposed} />
            </>
          )}
          <Notice tone="ok">
            Assumptions: Sleeper projections in your league&apos;s scoring; each week uses the best lineup from the roster
            (your forced starts and benchings apply to Week {week} only); byes from the NFL schedule; injured players score 0
            for the weeks you set. Playoff odds shift your expected weekly score by the change in your average and re-run the
            seeded simulation. These are estimates, not guaranteed outcomes.
          </Notice>
        </section>
      </div>
    </div>
  )
}

export default function Simulator() {
  return <LeagueGate>{(data) => <SimulatorView data={data} />}</LeagueGate>
}
