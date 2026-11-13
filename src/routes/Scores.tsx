import { Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { WeekSelect } from '../components/layout/Menus'
import { LeagueGate } from '../components/LeagueGate'
import { AwardsPanel, RacePanel, RankingsPanel, SharePanel, StoriesPanel } from '../components/league/LeagueReport'
import { ScoreList } from '../components/league/ScoreList'
import { EmptyState } from '../components/ui/states'
import { useLeagueBoard } from '../hooks/useLeagueBoard'
import type { Ready } from '../hooks/useLeagueData'
import { useLeagueReport } from '../hooks/useLeagueReport'
import { useLeagueSeason } from '../hooks/useLeagueSeason'
import { recordsThrough } from '../lib/analytics/league'
import { relTime } from '../lib/format'

function ScoresView({ data }: { data: Ready }) {
  const { model: m, week, league } = data
  const board = useLeagueBoard(data)
  const [params] = useSearchParams()
  const focus = params.get('m') !== null ? Number(params.get('m')) : null
  const final = board.games.length > 0 && board.games.every((g) => g.status === 'final')
  const report = useLeagueReport(data, board.games, final)
  const { season } = useLeagueSeason(data)
  // records entering the viewed week, rebuilt from Sleeper's scores
  const entering = useMemo(() => recordsThrough(season, week - 1), [season, week])
  const record = (id: number) => {
    const r = entering.get(id)
    return r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : week === 1 ? '0-0' : null
  }
  const live = board.games.filter((g) => g.status === 'live').length
  return (
    <div className="mx-auto grid max-w-6xl gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Trophy size={22} aria-hidden className="text-amber" /> Scores Around the League
          </h1>
          <p className="text-ink-3 text-sm">
            {league.name} · Week {week} ·{' '}
            {final ? 'Final' : live ? `${live} matchup${live === 1 ? '' : 's'} live` : 'Not started'} · Points are Sleeper&apos;s
            (facts); projected finals and win odds are model estimates
            {board.updatedAt ? ` · updated ${relTime(board.updatedAt)}` : ''}
          </p>
        </div>
        <WeekSelect className="bg-card/80" />
      </div>

      {board.games.length === 0 ? (
        <EmptyState>Sleeper has no Week {week} matchups for this league.</EmptyState>
      ) : (
        <ScoreList m={m} games={board.games} record={record} odds={report.odds} focus={focus} />
      )}

      {report.reportWeek >= 1 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <AwardsPanel m={m} awards={report.awards} week={report.reportWeek} />
          <StoriesPanel stories={report.stories} week={report.reportWeek} />
        </div>
      )}
      <RankingsPanel m={m} power={report.power} change={report.change} through={report.through} />
      <RacePanel m={m} odds={report.odds} games={board.games} />
      {board.games.length > 0 && (
        <SharePanel
          m={m}
          leagueName={league.name}
          week={week}
          final={final}
          games={board.games}
          awards={report.reportWeek === week ? (report.awards?.awards ?? []) : []}
          stories={report.reportWeek === week ? report.stories : []}
          power={report.power}
          change={report.change}
        />
      )}
    </div>
  )
}

export default function Scores() {
  return <LeagueGate>{(data) => <ScoresView data={data} />}</LeagueGate>
}
