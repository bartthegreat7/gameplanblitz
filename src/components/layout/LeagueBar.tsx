import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

import { useSession } from '../../hooks/useSession'
import { useAppStore } from '../../store/app'

/** League picker + refresh, shown once a Sleeper username is connected. */
export function LeagueBar() {
  const { username, leagues, leagueId, week } = useSession()
  const setLeagueId = useAppStore((s) => s.setLeagueId)
  const qc = useQueryClient()
  const fetching = useIsFetching() > 0
  if (!username || leagues.length === 0) return null

  return (
    <div className="mb-4 flex items-center gap-2.5">
      <label className="sr-only" htmlFor="league-select">
        League
      </label>
      <select
        id="league-select"
        value={leagueId ?? ''}
        onChange={(e) => setLeagueId(e.target.value)}
        className="border-line bg-card text-ink min-w-0 flex-1 rounded-2xl border px-4 py-3 font-bold"
      >
        {leagues.map((l) => (
          <option key={l.league_id} value={l.league_id}>
            {l.name}
          </option>
        ))}
      </select>
      <span className="text-ink-3 hidden text-sm font-semibold sm:inline">Week {week}</span>
      <button
        type="button"
        onClick={() => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'players' })}
        aria-label="Refresh live data"
        className="border-line bg-card text-ink-2 hover:text-ink grid size-11 shrink-0 place-items-center rounded-full border"
      >
        <RefreshCw size={20} aria-hidden className={fetching ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
