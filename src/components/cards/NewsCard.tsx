import { Newspaper } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useNews } from '../../hooks/useNews'
import { OUT_INJ } from '../../lib/lineup'
import { NewsNotPublished, playerIdsOf } from '../../lib/news'
import { mentioning, newestFirst } from '../../lib/newsFeed'
import { ArticleCard } from '../news/ArticleCard'
import { PlayerAvatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { Pill, PosTag } from '../ui/Pill'
import { ErrorState, ListSkeleton, Notice } from '../ui/states'
import type { CardProps } from './shared'

export function NewsCard({ data }: CardProps) {
  const { model } = data
  const news = useNews()
  const roster = useMemo(() => model.myRoster()?.players ?? [], [model])
  const mine = useMemo(() => new Set(roster), [roster])
  const articles = useMemo(() => news.data?.articles ?? [], [news.data])
  const aboutMine = useMemo(() => mentioning(articles, mine, (a) => playerIdsOf(a, roster, model.players)), [articles, mine, roster, model.players])
  const shown = (aboutMine.length ? aboutMine : newestFirst(articles)).slice(0, 5)

  const hurt = roster
    .filter((id) => model.injury(id))
    .map((id) => ({ id, inj: model.injury(id) }))
    .sort((a, b) => Number(OUT_INJ.has(b.inj)) - Number(OUT_INJ.has(a.inj)))

  return (
    <Card
      id="news"
      title="News & Injuries"
      context={news.data ? `${aboutMine.length} recent articles about your roster` : 'Latest'}
      icon={Newspaper}
      tone="blue"
    >
      {news.isPending ? (
        <ListSkeleton rows={3} />
      ) : news.isError ? (
        news.error instanceof NewsNotPublished ? (
          <Notice>The news feed hasn't been published yet. It refreshes every 2 hours when the site deploys.</Notice>
        ) : (
          <ErrorState title="Couldn't load the news feed" message="Showing your roster injury report instead." onRetry={() => void news.refetch()} />
        )
      ) : (
        <>
          <h3 className="mb-2 text-base font-extrabold">{aboutMine.length ? 'About your players' : 'Latest headlines'}</h3>
          {shown.length === 0 ? (
            <p className="text-ink-3 text-sm">No articles right now.</p>
          ) : (
            <ul className="divide-line divide-y">
              {shown.map((a) => (
                <li key={a.id} className="py-2">
                  <ArticleCard a={a} variant="compact" highlight={mine} />
                </li>
              ))}
            </ul>
          )}
          <Link to="/news" className="text-accent mt-2 inline-block text-sm font-bold">
            Open News &amp; Articles →
          </Link>
        </>
      )}

      <div className="mt-4">
        <h3 className="mb-1 text-base font-extrabold">Roster report</h3>
        <p className="text-ink-3 mb-1 text-xs">Injury designations from Sleeper.</p>
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
    </Card>
  )
}
