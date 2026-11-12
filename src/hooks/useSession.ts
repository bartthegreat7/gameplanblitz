import { useQuery } from '@tanstack/react-query'

import { getLeagues, getNflState, getUser } from '../lib/sleeper'
import { useAppStore } from '../store/app'

/** Who is signed in, their leagues, and the selected league. Everything is read-only Sleeper data. */
export function useSession() {
  const username = useAppStore((s) => s.username)
  const storedLeagueId = useAppStore((s) => s.leagueId)

  const stateQ = useQuery({ queryKey: ['nflState'], queryFn: getNflState, staleTime: 5 * 60_000 })
  const userQ = useQuery({
    queryKey: ['user', username],
    queryFn: () => getUser(username!),
    enabled: !!username,
    staleTime: Infinity,
  })
  const userId = userQ.data?.user_id
  const stateSeason = stateQ.data?.season

  const leaguesQ = useQuery({
    queryKey: ['leagues', userId, stateSeason],
    queryFn: () => getLeagues(userId!, stateSeason!),
    enabled: !!userId && !!stateSeason,
    staleTime: 10 * 60_000,
  })

  const leagues = leaguesQ.data?.leagues ?? []
  const leagueId = leagues.some((l) => l.league_id === storedLeagueId) ? storedLeagueId : (leagues[0]?.league_id ?? null)
  const state = stateQ.data

  const queries = [stateQ, userQ, leaguesQ]
  return {
    username,
    userId,
    leagues,
    leagueId,
    season: leaguesQ.data?.season ?? stateSeason,
    week: state ? Math.max(1, state.week || state.display_week || 1) : 1,
    isLoading: !!username && queries.some((q) => q.isPending && q.fetchStatus !== 'idle'),
    error: (queries.find((q) => q.error)?.error as Error | undefined) ?? null,
    /** signed in but Sleeper doesn't know this username */
    unknownUser: !!username && userQ.isSuccess && !userQ.data,
    noLeagues: leaguesQ.isSuccess && leagues.length === 0,
  }
}
