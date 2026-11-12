import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'

import { NewsList, type NewsItem } from '../components/NewsList'
import { ProjNotice } from '../components/cards/shared'
import { LeagueGate } from '../components/LeagueGate'
import { PlayerAvatar } from '../components/ui/Avatar'
import { Pill, PosTag } from '../components/ui/Pill'
import { EmptyState, ErrorState, ListSkeleton } from '../components/ui/states'
import { useNews } from '../hooks/useNews'
import type { Ready } from '../hooks/useLeagueData'
import { f1 } from '../lib/format'
import { OUT_INJ } from '../lib/lineup'
import { buildNameIndex, matchPlayers, newsConfigured } from '../lib/news'
import { playerValue } from '../lib/scoring'

function Detail({ data, id }: { data: Ready; id: string }) {
  const { model } = data
  const p = model.players[id]
  const news = useNews({ limit: 100 })

  const items = useMemo<NewsItem[]>(() => {
    const idx = buildNameIndex([id], model.players)
    return (news.data?.articles ?? [])
      .map((article) => ({ article, hits: matchPlayers(article, idx) }))
      .filter((i) => i.hits.length)
      .slice(0, 10)
  }, [news.data, id, model.players])

  if (!p)
    return (
      <div className="mx-auto max-w-md">
        <ErrorState title="Player not found" message={`No player with id “${id}” in Sleeper's player list.`} />
      </div>
    )

  const ppg = model.ppg(id)
  const pj = model.projPts(id)
  const inj = model.injury(id)
  const season = model.seasonStats?.[id]
  const fc = model.fc?.get(id)
  const owner = model.rosters.find((r) => (r.players ?? []).includes(id))
  const tiles: [string, string][] = [
    ['This week (proj)', f1(pj)],
    ['Season PPG', ppg != null ? f1(ppg) : '—'],
    ['Value (blend)', f1(playerValue(ppg, pj))],
    ['Games played', season?.gp ? String(season.gp) : '—'],
    ['Trade value (FC)', fc ? fc.value.toLocaleString() : '—'],
    ['FC overall rank', fc ? `#${fc.rank}` : '—'],
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/players" className="text-ink-2 hover:text-ink mb-4 inline-flex items-center gap-1.5 text-sm font-bold">
        <ArrowLeft size={16} aria-hidden /> Players
      </Link>
      <ProjNotice data={data} />
      <div className="border-line bg-card rounded-3xl border p-5">
        <div className="flex items-center gap-4">
          <PlayerAvatar player={p} className="size-20 text-2xl" />
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight">{model.name(id)}</h1>
            <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-2 text-sm">
              <PosTag pos={model.pos(id)} />
              <span>{model.team(id) || 'Free agent'}</span>
              {inj && <Pill tone={OUT_INJ.has(inj) ? 'warn' : 'caution'}>{inj}</Pill>}
              <Pill tone={owner ? 'info' : 'prio'}>{owner ? `On ${model.teamName(owner.roster_id)}` : 'Free agent in your league'}</Pill>
            </div>
          </div>
        </div>
        {(p.injury_body_part || p.injury_notes) && (
          <p className="text-ink-2 mt-3 text-sm">{[p.injury_body_part, p.injury_notes].filter(Boolean).join(' — ')}</p>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {tiles.map(([k, v]) => (
            <div key={k} className="border-line bg-panel rounded-2xl border p-3.5 text-center">
              <dd className="text-xl font-extrabold">{v}</dd>
              <dt className="text-ink-3 text-xs">{k}</dt>
            </div>
          ))}
        </dl>
      </div>

      <section className="border-line bg-card mt-5 rounded-3xl border p-5" aria-labelledby="pnews">
        <h2 id="pnews" className="mb-2 text-lg font-extrabold">
          News about {p.last_name || model.name(id)}
        </h2>
        {!newsConfigured ? (
          <EmptyState>The news feed isn't connected yet, so there are no articles to match.</EmptyState>
        ) : news.isPending ? (
          <ListSkeleton rows={3} />
        ) : news.isError ? (
          <ErrorState title="Couldn't load news" onRetry={() => void news.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState>No recent articles mention {model.name(id)}.</EmptyState>
        ) : (
          <NewsList items={items} model={model} />
        )}
      </section>
    </div>
  )
}

export default function PlayerDetail() {
  const { id = '' } = useParams()
  return <LeagueGate>{(data) => <Detail data={data} id={id} />}</LeagueGate>
}
