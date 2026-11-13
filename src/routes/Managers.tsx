import { ArrowRight, Fingerprint, Handshake } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CARD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { TeamAvatar } from '../components/ui/Avatar'
import { EmptyState, ListSkeleton } from '../components/ui/states'
import { useLeagueBehavior } from '../hooks/useLeagueBehavior'
import type { Ready } from '../hooks/useLeagueData'

const H2 = 'mb-1 flex items-center gap-2 text-lg font-extrabold'

function ManagersView({ data }: { data: Ready }) {
  const { model: m, league } = data
  const b = useLeagueBehavior(data)
  const rows = [...b.profiles].sort((x, y) => y.trades + y.waiverClaims + y.freeAgentAdds - (x.trades + x.waiverClaims + x.freeAgentAdds))
  const faab = (league.settings.waiver_budget ?? 0) > 0

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Fingerprint size={22} aria-hidden className="text-accent" /> Manager Tendencies
        </h1>
        <p className="text-ink-3 text-sm">
          What each manager in {league.name} has actually done in Sleeper this season: trades, claims, bids, lineups and keepers. These are
          counts of past moves. They say nothing about what anyone wants or will do next.
        </p>
      </div>

      <section aria-label="Possible trade partners" className={`${CARD} p-4 sm:p-5`}>
        <h2 className={H2}>
          <Handshake size={20} aria-hidden className="text-accent" /> Possible trade partners for you
        </h2>
        <p className="text-ink-3 mb-3 text-xs">
          Ranked by complementary rosters (this week&apos;s projected strength by position), plus whether they have traded at all this season.
          Whether a manager wants to trade is unknown.
        </p>
        {b.loading && b.ideas.length === 0 ? (
          <ListSkeleton rows={2} />
        ) : b.ideas.length === 0 ? (
          <p className="text-ink-2 text-sm">No team is strong where you are thin and thin where you are strong right now.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {b.ideas.slice(0, 4).map((x) => (
              <li key={x.rosterId} className="border-line/70 bg-card-2/60 rounded-xl border p-3">
                <p className="flex items-center gap-2 font-bold">
                  <TeamAvatar user={m.ownerOf(x.rosterId)} className="size-8 text-xs" />
                  {m.teamName(x.rosterId)}
                </p>
                <ul className="text-ink-2 mt-2 list-disc pl-5 text-sm">
                  {x.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <Link to="/trades" className="text-accent mt-3 inline-flex items-center gap-1 text-sm font-bold hover:underline">
          Price a deal in the Trade War Room <ArrowRight size={14} aria-hidden />
        </Link>
      </section>

      <section aria-label="Activity by manager" className={`${CARD} p-4 sm:p-5`}>
        <h2 className={H2}>Activity this season</h2>
        {b.loading && rows.every((r) => r.trades + r.waiverClaims + r.freeAgentAdds === 0) ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">Completed trades, waiver claims, free-agent adds, bids and lineup gaps for every manager</caption>
              <thead>
                <tr className="text-ink-3 border-line border-b text-left text-xs tracking-wide uppercase">
                  <th scope="col" className="py-2 pr-2 font-semibold">Team</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Trades</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Claims</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold" title="Waiver claims that did not go through">Lost claims</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">FA adds</th>
                  {faab && <th scope="col" className="px-1 py-2 text-right font-semibold">FAAB spent</th>}
                  <th scope="col" className="px-1 py-2 text-right font-semibold" title="Empty starting slots and starters who scored 0">Lineup gaps</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Last move</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.rosterId} className={`border-line/50 border-b last:border-0 ${p.rosterId === m.myRosterId ? 'bg-active/50' : ''}`}>
                    <th scope="row" className="py-2 pr-2 text-left font-semibold">
                      {m.teamName(p.rosterId)}
                      {p.rosterId === m.myRosterId && <span className="text-accent"> (you)</span>}
                    </th>
                    <td className="px-1 py-2 text-right tabular-nums">{p.trades}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{p.waiverClaims}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{p.failedClaims}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{p.freeAgentAdds}</td>
                    {faab && <td className="px-1 py-2 text-right tabular-nums">${p.faabSpent}</td>}
                    <td className="px-1 py-2 text-right tabular-nums">{p.emptySlots + p.zeroStarters}</td>
                    <td className="text-ink-2 px-1 py-2 text-right text-xs">{p.lastMove ? new Date(p.lastMove).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Tendencies" className={`${CARD} p-4 sm:p-5`}>
        <h2 className={H2}>Observed tendencies</h2>
        <p className="text-ink-3 mb-3 text-xs">Only patterns with enough moves behind them are listed, each with its counts.</p>
        {rows.every((p) => (b.traits.get(p.rosterId) ?? []).length === 0) ? (
          <EmptyState>Not enough moves yet this season to describe any manager&apos;s habits.</EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((p) => {
              const t = b.traits.get(p.rosterId) ?? []
              return (
                <li key={p.rosterId} className="border-line/70 bg-card-2/60 rounded-xl border p-3">
                  <p className="font-bold">
                    {m.teamName(p.rosterId)}
                    {p.rosterId === m.myRosterId && <span className="text-accent"> (you)</span>}
                  </p>
                  {t.length === 0 ? (
                    <p className="text-ink-3 text-sm">No clear pattern yet.</p>
                  ) : (
                    <ul className="mt-1 grid gap-1 text-sm">
                      {t.map((x) => (
                        <li key={x.text}>
                          <span className="font-semibold">{x.text}</span>
                          <span className="text-ink-3"> · {x.evidence}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {b.pastLoading && <p className="text-ink-3 mt-2 text-xs">Loading earlier drafts for keeper history…</p>}
      </section>
    </div>
  )
}

export default function Managers() {
  return <LeagueGate>{(data) => <ManagersView data={data} />}</LeagueGate>
}
