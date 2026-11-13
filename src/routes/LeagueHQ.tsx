import { ArrowLeftRight, ArrowRight, Award, Crown, History, Landmark, ListOrdered, Medal, Swords, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { CARD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { useLeagueHistory } from '../hooks/useLeagueHistory'
import { championRoster, leagueRecords, managerStats, ownerOf, rivalries, seasonStandings, teamNameIn } from '../lib/analytics/leagueHistory'
import { f1 } from '../lib/format'
import type { SleeperUser } from '../lib/sleeper'

const H2 = 'mb-1 flex items-center gap-2 text-lg font-extrabold'

function HqView({ data }: { data: Ready }) {
  const { model: m, league } = data
  const h = useLeagueHistory(data)
  const myUserId = m.rosterById(m.myRosterId)?.owner_id ?? null

  /** manager names from the newest season they appear in */
  const people = useMemo(() => {
    const out = new Map<string, SleeperUser>()
    for (const s of h.seasons) for (const u of s.users) if (!out.has(u.user_id)) out.set(u.user_id, u)
    return out
  }, [h.seasons])
  const who = (userId: string | null) => (userId ? (people.get(userId)?.display_name ?? 'Former manager') : 'Unowned team')
  const teamIn = teamNameIn
  const commissioner = m.users.find((u) => u.is_owner)

  const stats = useMemo(() => managerStats(h.seasons), [h.seasons])
  const records = useMemo(() => leagueRecords(h.seasons), [h.seasons])
  const rivals = useMemo(() => rivalries(h.seasons), [h.seasons])
  const myRivals = rivals.filter((r) => r.a === myUserId || r.b === myUserId)
  const otherRivals = rivals.filter((r) => r.a !== myUserId && r.b !== myUserId).slice(0, 3)

  const [pick, setPick] = useState(0)
  const shown = h.seasons[Math.min(pick, h.seasons.length - 1)]
  const table = useMemo(() => seasonStandings(shown), [shown])
  const draftSeasons = h.seasons.filter((s) => s.draft?.length)
  const [draftPick, setDraftPick] = useState(0)
  const draft = draftSeasons[Math.min(draftPick, draftSeasons.length - 1)] ?? null
  const span = h.seasons.length > 1 ? `${h.seasons[h.seasons.length - 1].season}–${h.seasons[0].season}` : league.season

  const rivalRow = (r: (typeof rivals)[number]) => {
    const lead = r.aWins === r.bWins ? null : r.aWins > r.bWins ? r.a : r.b
    return (
      <li key={`${r.a}|${r.b}`} className="border-line/70 bg-card-2/60 rounded-xl border p-3">
        <p className="font-bold">
          {who(r.a)} vs {who(r.b)}
        </p>
        <p className="text-ink-2 text-sm">
          {r.games} meetings · {lead ? `${who(lead)} leads ${Math.max(r.aWins, r.bWins)}-${Math.min(r.aWins, r.bWins)}` : `Even at ${r.aWins}-${r.bWins}`}
          {r.ties ? ` (${r.ties} tie${r.ties === 1 ? '' : 's'})` : ''} · points {f1(Math.abs(r.margin))} {r.margin === 0 ? '' : `in ${who(r.margin > 0 ? r.a : r.b)}'s favor`}
        </p>
        <p className="text-ink-3 text-xs">
          Last met {r.last.season} Week {r.last.week}: {r.last.winner ? `${who(r.last.winner)} won` : 'tie'}
        </p>
      </li>
    )
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Landmark size={22} aria-hidden className="text-accent" /> League HQ
        </h1>
        <p className="text-ink-3 text-sm">
          {league.name}: history, records and rivalries from Sleeper results ({span}, regular season). Managers are followed by their
          Sleeper account across seasons.
        </p>
        <p className="text-ink-3 mt-1 text-xs">
          {commissioner ? `Commissioner: ${commissioner.display_name}. ` : ''}GamePlanBitz is read-only for every manager: nothing here
          changes league settings, and there are no commissioner-only controls (the app has no sign-in to verify who you are).
        </p>
      </div>

      {h.pastLoading && <Notice tone="ok">Loading earlier seasons from Sleeper…</Notice>}
      {h.pastFailed && <Notice>Some earlier seasons could not be read from Sleeper; history starts where it could.</Notice>}
      {!league.previous_league_id && (
        <Notice tone="ok">Sleeper has no earlier season linked to this league, so history covers {league.season} only.</Notice>
      )}

      <section aria-label="Championship history" className={`${CARD} p-4 sm:p-5`}>
        <h2 className={H2}>
          <Crown size={20} aria-hidden className="text-amber" /> Champions
        </h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {h.seasons.map((s) => {
            const champ = championRoster(s.bracket)
            return (
              <li key={s.leagueId} className="border-line/70 bg-card-2/60 rounded-xl border p-3">
                <p className="text-ink-3 text-xs font-bold tracking-wide uppercase">{s.season}</p>
                {champ !== null ? (
                  <>
                    <p className="font-extrabold">{teamIn(s, champ)}</p>
                    <p className="text-ink-2 text-sm">{who(ownerOf(s, champ))}</p>
                  </>
                ) : (
                  <p className="text-ink-2 text-sm">{s === h.current ? 'Season in progress' : 'No playoff result on Sleeper'}</p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label="Manager statistics" className={`${CARD} p-4 sm:p-5`}>
        <h2 className={H2}>
          <Users size={20} aria-hidden className="text-accent" /> Manager statistics
        </h2>
        {h.seasonLoading && stats.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : stats.length === 0 ? (
          <EmptyState>No completed games yet. Manager records appear once a week is final.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">All-time regular-season record, points and titles for each manager</caption>
              <thead>
                <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                  <th scope="col" className="py-2 pr-2 font-semibold">Manager</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Seasons</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Record</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Win %</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Pts / game</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Titles</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Best finish</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.userId} className={`border-line/50 border-b last:border-0 ${s.userId === myUserId ? 'bg-active/50' : ''}`}>
                    <th scope="row" className="py-2 pr-2 text-left font-semibold">
                      {who(s.userId)}
                      {s.userId === myUserId && <span className="text-accent"> (you)</span>}
                    </th>
                    <td className="px-1 py-2 text-right tabular-nums">{s.seasons}</td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {s.w}-{s.l}
                      {s.t ? `-${s.t}` : ''}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">{s.games ? Math.round(((s.w + s.t / 2) / s.games) * 100) : 0}%</td>
                    <td className="px-1 py-2 text-right tabular-nums">{s.games ? f1(s.pf / s.games) : '—'}</td>
                    <td className="px-1 py-2 text-right font-extrabold tabular-nums">{s.titles || '—'}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{Number.isFinite(s.bestFinish) ? `#${s.bestFinish}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-ink-3 mt-2 text-xs">Regular season only. Best finish = regular-season standing (wins, then points for).</p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section aria-label="League records" className={`${CARD} p-4 sm:p-5`}>
          <h2 className={H2}>
            <Medal size={20} aria-hidden className="text-accent" /> League records
          </h2>
          {records.length === 0 ? (
            <p className="text-ink-2 text-sm">Records appear once a week is final.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {records.map((r) => (
                <li key={r.title} className="border-line/70 bg-card-2/60 flex items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-3 text-xs font-bold tracking-wide uppercase">{r.title}</p>
                    <p className="font-bold">
                      {who(r.userId)}
                      {r.otherId ? ` over ${who(r.otherId)}` : ''}
                    </p>
                    <p className="text-ink-3 text-xs">
                      {r.season}
                      {r.week !== null ? ` · Week ${r.week}` : ''}
                    </p>
                  </div>
                  <span className="text-lg font-extrabold tabular-nums">
                    {r.title === 'Biggest blowout' || r.title === 'Closest finish' ? `by ${f1(r.value)}` : f1(r.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Rivalries" className={`${CARD} p-4 sm:p-5`}>
          <h2 className={H2}>
            <Swords size={20} aria-hidden className="text-accent" /> Rivalries
          </h2>
          <p className="text-ink-3 mb-2 text-xs">Head-to-head records for managers who have met at least twice. Counted from results only.</p>
          {rivals.length === 0 ? (
            <p className="text-ink-2 text-sm">No pair of managers has met twice yet.</p>
          ) : (
            <>
              {myRivals.length > 0 && (
                <>
                  <h3 className="text-ink-2 mt-1 mb-1 text-sm font-bold">Yours</h3>
                  <ul className="grid gap-2">{myRivals.slice(0, 3).map(rivalRow)}</ul>
                </>
              )}
              {otherRivals.length > 0 && (
                <>
                  <h3 className="text-ink-2 mt-3 mb-1 text-sm font-bold">Around the league</h3>
                  <ul className="grid gap-2">{otherRivals.map(rivalRow)}</ul>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <section aria-label="Historical standings" className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={`${H2} mr-auto`}>
            <ListOrdered size={20} aria-hidden className="text-accent" /> Standings by season
          </h2>
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
        {table.length === 0 ? (
          <p className="text-ink-2 mt-2 text-sm">No completed regular-season weeks in {shown.season}.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">{shown.season} regular-season standings rebuilt from Sleeper scores</caption>
              <thead>
                <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                  <th scope="col" className="py-2 pr-2 font-semibold">#</th>
                  <th scope="col" className="py-2 pr-2 font-semibold">Team</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">W-L</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">PF</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">PA</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.rosterId} className={`border-line/50 border-b last:border-0 ${r.userId === myUserId ? 'bg-active/50' : ''}`}>
                    <td className="py-2 pr-2 tabular-nums">{r.rank}</td>
                    <th scope="row" className="py-2 pr-2 text-left font-semibold">
                      {teamIn(shown, r.rosterId)}
                      <span className="text-ink-3 font-normal"> · {who(r.userId)}</span>
                      {r.champion && (
                        <span className="bg-amber/15 text-amber ml-2 rounded px-1.5 py-0.5 text-xs font-bold">Champion</span>
                      )}
                    </th>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {r.w}-{r.l}
                      {r.t ? `-${r.t}` : ''}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">{f1(r.pf)}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{f1(r.pa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shown === h.current && (
          <p className="text-ink-3 mt-2 text-xs">
            This season through the last completed week. Sleeper&apos;s official order (and any custom tiebreakers) is on{' '}
            <Link to="/standings" className="text-accent font-bold hover:underline">
              Standings
            </Link>
            .
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section aria-label="Weekly awards tally" className={`${CARD} p-4 sm:p-5`}>
          <h2 className={H2}>
            <Award size={20} aria-hidden className="text-accent" /> Weekly awards, {league.season}
          </h2>
          {h.awardTally.size === 0 ? (
            <p className="text-ink-2 text-sm">Awards are counted once a week is final.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {[...h.awardTally].map(([title, counts]) => {
                const top = Math.max(...counts.values())
                const leaders = [...counts].filter(([, n]) => n === top).map(([id]) => m.teamName(id))
                return (
                  <li key={title} className="border-line/70 bg-card-2/60 flex items-center gap-3 rounded-xl border p-3">
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-3 block text-xs font-bold tracking-wide uppercase">{title}</span>
                      <span className="font-bold">{leaders.join(', ')}</span>
                    </span>
                    <span className="text-sm tabular-nums">
                      {top} week{top === 1 ? '' : 's'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-ink-3 mt-2 text-xs">
            From each completed week&apos;s scores. Upsets need pre-game projections and are only shown on{' '}
            <Link to="/scores" className="text-accent font-bold hover:underline">
              Scores Around the League
            </Link>
            .
          </p>
        </section>

        <section aria-label="Trade history" className={`${CARD} p-4 sm:p-5`}>
          <h2 className={H2}>
            <ArrowLeftRight size={20} aria-hidden className="text-accent" /> Trades, {league.season}
          </h2>
          {h.tradesLoading && h.trades.length === 0 ? (
            <ListSkeleton rows={3} />
          ) : h.trades.length === 0 ? (
            <p className="text-ink-2 text-sm">No completed trades on Sleeper this season.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {h.trades.slice(0, 12).map((t, i) => {
                const sides = (t.roster_ids ?? []).map((rid) => ({
                  rid,
                  got: Object.entries(t.adds ?? {})
                    .filter(([, to]) => to === rid)
                    .map(([pid]) => m.name(pid)),
                }))
                return (
                  <li key={`${t.created ?? i}-${i}`} className="border-line/70 bg-card-2/60 rounded-xl border p-3 text-sm">
                    {t.created ? <p className="text-ink-3 text-xs">{new Date(t.created).toLocaleDateString()}</p> : null}
                    {sides.map((s) => (
                      <p key={s.rid}>
                        <span className="font-bold">{m.teamName(s.rid)}</span> received {s.got.length ? s.got.join(', ') : 'draft picks or FAAB only'}
                      </p>
                    ))}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Draft and keeper history" className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={`${H2} mr-auto`}>
            <History size={20} aria-hidden className="text-accent" /> Draft and keepers
          </h2>
          {draftSeasons.length > 1 && (
            <label className="text-ink-2 flex items-center gap-2 text-sm">
              Draft
              <select value={draftPick} onChange={(e) => setDraftPick(Number(e.target.value))} className="border-line bg-card-2 min-h-9 rounded-lg border px-2">
                {draftSeasons.map((s, i) => (
                  <option key={s.leagueId} value={i}>
                    {s.season}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {h.draftLoading && !draft ? (
          <ListSkeleton rows={3} />
        ) : !draft ? (
          <p className="text-ink-2 mt-2 text-sm">Sleeper has no draft picks for this league (the draft may have been held elsewhere).</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-ink-2 mb-1 text-sm font-bold">{draft.season} first round</h3>
              <ol className="grid gap-1 text-sm">
                {draft
                  .draft!.filter((p) => p.round === 1)
                  .sort((a, b) => (a.pick_no ?? 0) - (b.pick_no ?? 0))
                  .map((p, i) => (
                    <li key={`${p.pick_no ?? i}`} className="flex gap-2">
                      <span className="text-ink-3 w-8 tabular-nums">{p.pick_no ?? i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.player_id ? m.name(p.player_id) : '—'}</span>
                      <span className="text-ink-3 truncate">{p.roster_id !== null ? teamIn(draft, p.roster_id) : ''}</span>
                    </li>
                  ))}
              </ol>
            </div>
            <div>
              <h3 className="text-ink-2 mb-1 text-sm font-bold">{draft.season} keepers</h3>
              {draft.draft!.some((p) => p.is_keeper) ? (
                <ul className="grid gap-1 text-sm">
                  {draft.draft!
                    .filter((p) => p.is_keeper)
                    .map((p, i) => (
                      <li key={`${p.player_id ?? i}`} className="flex gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold">{p.player_id ? m.name(p.player_id) : '—'}</span>
                        <span className="text-ink-3 truncate">
                          Rd {p.round} · {p.roster_id !== null ? teamIn(draft, p.roster_id) : ''}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-ink-2 text-sm">No picks were marked as keepers on Sleeper.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-label="League media" className={`${CARD} p-4 sm:p-5`}>
        <h2 className={H2}>League media and the race</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            { to: '/scores', label: 'Scores Around the League', blurb: 'Weekly scores, awards, storylines and a shareable recap.' },
            { to: '/playoffs', label: 'Playoff Simulator', blurb: 'Playoff and title odds for every team.' },
            { to: '/studio', label: 'The Fantasy War Room', blurb: 'Weekly Review and The Game Plan podcast episodes.' },
          ].map((x) => (
            <li key={x.to}>
              <Link to={x.to} className="border-line/70 bg-card-2/60 hover:bg-raised flex h-full flex-col rounded-xl border p-3">
                <span className="flex items-center gap-1 font-bold">
                  {x.label} <ArrowRight size={14} aria-hidden className="text-accent" />
                </span>
                <span className="text-ink-3 text-xs">{x.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-ink-3 mt-2 text-xs">Sharing is always something you do (copy, share sheet or image); nothing is posted for the league automatically.</p>
      </section>
    </div>
  )
}

export default function LeagueHQ() {
  return <LeagueGate>{(data) => <HqView data={data} />}</LeagueGate>
}
