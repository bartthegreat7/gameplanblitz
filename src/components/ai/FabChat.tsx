import { useFactSheet } from '../../hooks/useFactSheet'
import type { Ready } from '../../hooks/useLeagueData'
import { LeagueGate } from '../LeagueGate'
import { seedsFor } from '../../lib/ai/seeds'
import { GmChat } from './GmChat'

function Inner({ data, path }: { data: Ready; path: string }) {
  const sheet = useFactSheet(data)
  const seeds = seedsFor(path, data.model.name, (id) => !!data.model.players[id])
  return (
    <div className="flex h-[68dvh] min-h-0 flex-col md:h-full">
      <GmChat data={data} sheet={sheet} compact seeds={seeds} />
    </div>
  )
}

export default function FabChat({ path }: { path: string }) {
  return <LeagueGate>{(data) => <Inner data={data} path={path} />}</LeagueGate>
}
