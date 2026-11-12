import { Newspaper } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useNews } from '../../hooks/useNews'
import { OUT_INJ } from '../../lib/lineup'
import { buildNameIndex, matchPlayers, newsConfigured } from '../../lib/news'
import { NewsList, type NewsItem } from '../NewsList'
import { Card } from '../ui/Card'
import { Pill, PosTag } from '../ui/Pill'
import { PlayerAvatar } from '../ui/Avatar'
import { Segmented } from '../ui/Segmented'
import { EmptyState, ErrorState, ListSkeleton, Notice } from '../ui/states'
import type { CardProps } from './shared'

export function NewsCard({ data }: CardProps) {
  const { model } = data
  const news = useNews({ limit: 40 })
  const [filter, setFilter] = useState<'all' | 'mine'>('all')

  const roster = useMemo(() => model.myRoster()?.players ?? [], [model])
  const items = useMemo<NewsItem[]>(() => {
    const idx = buildNameIndex(roster, model.players)
    return (news.data?.articles ?? []).slice(0, 40).map((article) => ({ article, hits: matchPlayers(article, idx) }))
  }, [news.data, roster, model.players])

  const mineCount = items.filter((i) => i.hits.length).length
  const shown = (filter === 'mine' ? items.filter((i) => i.hits.length) : items).slice(0, 12)

  const hurt = roster
    .filter((id) => model.injury(id))
    .map((id) => ({ id, inj: model.injury(id) }))
    .sort((a, b) => Number(OUT_INJ.has(b.inj)) - Number(OUT_INJ.has(a.inj)))

  const report = (
    <div>
      <h3 className="mb-1 text-base font-extrabold">Roster report</h3>
      {hurt.length === 0 ? (
        <Notice tone="ok">No injury designations on your roster right now.</Notice>
      ) : (
        hurt.map(({ id, inj }) => {
          const p = model.players[id]
          const bits = [p?.injury_body_part, p?.injury_notes].filter(Boolean).join(' — ')
          return (
            <Link key={id} to={`/players/${id}`} className="border-line/60 flex items-center gap-3 border-t py-3 first:border-t-0">
              <PlayerAvatar player={p} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{model.name(id)}</div>
                <div className="text-ink-3 flex items-center gap-1.5 text-xs">
                  <PosTag pos={model.pos(id)} />
                  <span>{model.team(id) || 'FA'}</span>
                  <Pill tone={OUT_INJ.has(inj) ? 'warn' : 'caution'}>{inj}</Pill>
                </div>
                {bits && <div className="text-ink-3 mt-1 text-xs">{bits.length > 140 ? bits.slice(0, 139) + '…' : bits}</div>}
              </div>
            </Link>
          )
        })
      )}
    </div>
  )

  if (!newsConfigured)
    return (
      <Card id="news" title="News & Injuries" context="Roster report" icon={Newspaper} tone="blue">
        <p className="text-ink-2 mb-3">Injury designations for your players, straight from Sleeper.</p>
        {report}
        <div className="mt-3">
          <Notice>Article feeds aren't connected yet. Set VITE_NEWS_API at build time once the news Worker is deployed.</Notice>
        </div>
      </Card>
    )

  return (
    <Card
      id="news"
      title="News & Injuries"
      context={news.data ? `${items.length} recent · ${mineCount} about your roster` : 'Latest'}
      icon={Newspaper}
      tone="blue"
    >
      {news.isPending ? (
        <ListSkeleton rows={4} />
      ) : news.isError ? (
        <>
          <ErrorState title="Couldn't load the news feed" message="Showing your roster injury report instead." onRetry={() => void news.refetch()} />
          <div className="mt-4">{report}</div>
        </>
      ) : items.length === 0 ? (
        <>
          <EmptyState>No articles right now.</EmptyState>
          {report}
        </>
      ) : (
        <>
          <Segmented
            label="News filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All news' },
              { value: 'mine', label: 'My roster' },
            ]}
          />
          {shown.length === 0 ? <EmptyState>Nothing about your players in the latest articles.</EmptyState> : <NewsList items={shown} model={model} />}
          <Link to="/news" className="text-mint mt-2 inline-block text-sm font-bold">
            Open the news hub →
          </Link>
          <div className="mt-4">{report}</div>
        </>
      )}
    </Card>
  )
}
