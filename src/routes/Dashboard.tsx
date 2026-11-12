import { EdgeCard } from '../components/cards/EdgeCard'
import { GameDayCard } from '../components/cards/GameDayCard'
import { LineupCheckCard } from '../components/cards/LineupCheckCard'
import { NewsCard } from '../components/cards/NewsCard'
import { PlayerValueCard, RosterCard, StandingsCard } from '../components/cards/RosterCards'
import { TradeMachineCard } from '../components/cards/TradeMachineCard'
import { WaiverBidsCard, WaiverWireCard } from '../components/cards/WaiverCards'
import { LeagueGate } from '../components/LeagueGate'

export default function Dashboard() {
  return (
    <LeagueGate>
      {(data) => (
        <div className="lg:columns-2 lg:gap-5">
          <h1 className="sr-only">
            {data.league.name} dashboard, Week {data.week}
          </h1>
          <GameDayCard data={data} />
          <LineupCheckCard data={data} />
          <EdgeCard data={data} />
          <NewsCard data={data} />
          <TradeMachineCard data={data} />
          <WaiverWireCard data={data} />
          <WaiverBidsCard data={data} />
          <StandingsCard data={data} />
          <RosterCard data={data} />
          <PlayerValueCard data={data} />
        </div>
      )}
    </LeagueGate>
  )
}
