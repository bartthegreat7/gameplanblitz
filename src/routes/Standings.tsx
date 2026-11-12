import { StandingsCard } from '../components/cards/RosterCards'
import { LeagueGate } from '../components/LeagueGate'

export default function Standings() {
  return (
    <LeagueGate>
      {(data) => (
        <div className="mx-auto max-w-2xl">
          <h1 className="sr-only">Standings</h1>
          <StandingsCard data={data} />
        </div>
      )}
    </LeagueGate>
  )
}
