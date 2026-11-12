import { Shirt } from 'lucide-react'

import { ProjNotice } from '../components/cards/shared'
import { MyTeam } from '../components/command/MyTeam'
import { LeagueGate } from '../components/LeagueGate'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { useProjectionEngine } from '../hooks/useProjectionEngine'

function TeamView({ data }: { data: Ready }) {
  const gm = useGmBrief(data)
  const engine = useProjectionEngine(data)
  return (
    <div className="@container/main grid gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Shirt size={22} aria-hidden className="text-accent" /> My Team
        </h1>
        <p className="text-ink-3 text-sm">
          {data.model.teamName(data.model.myRosterId)} · Week {data.week} · {data.league.name}
        </p>
      </div>
      <ProjNotice data={data} />
      <MyTeam data={data} gm={gm} projOf={(id) => engine.projectionFor(id).value} />
    </div>
  )
}

export default function Team() {
  return <LeagueGate>{(data) => <TeamView data={data} />}</LeagueGate>
}
