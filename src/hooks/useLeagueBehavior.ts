import { useMemo } from 'react'

import { managerProfiles, partnerIdeas, tendencies, type ManagerProfile, type Tendency } from '../lib/analytics/behavior'
import { leagueXray, tradePartners } from '../lib/analytics/xray'
import type { Ready } from './useLeagueData'
import { useLeagueHistory } from './useLeagueHistory'

/** League Behavioral Intelligence: every manager's observable moves, tendencies and partner ideas. */
export function useLeagueBehavior(data: Ready, opts: { past?: boolean } = {}) {
  const { model: m } = data
  const h = useLeagueHistory(data, opts)
  const weeks = h.current.weeks
  const profiles = useMemo(() => {
    // draft roster ids belong to that season: map them to this season's roster by manager
    const nowRosterOf = (userId: string | null) => (userId ? (m.rosters.find((r) => r.owner_id === userId)?.roster_id ?? null) : null)
    return managerProfiles({
      rosterIds: m.rosters.map((r) => r.roster_id),
      transactions: h.allTransactions,
      weeks,
      slots: m.startSlots.length,
      pos: m.pos,
      drafts: h.seasons
        .filter((s) => s.draft?.length)
        .map((s) => ({
          season: s.season,
          picks: s.draft!,
          rosterFor: (rid: number) => nowRosterOf(s.rosters.find((r) => r.roster_id === rid)?.owner_id ?? null),
        })),
    })
  }, [m, h.allTransactions, weeks, h.seasons])
  const all = useMemo(() => [...profiles.values()], [profiles])
  const traits = useMemo(() => new Map<number, Tendency[]>(all.map((p) => [p.rosterId, tendencies(p, all)])), [all])
  const ideas = useMemo(() => {
    const xs = leagueXray(m, { byeWeeksOf: () => [], transactions: h.allTransactions })
    return partnerIdeas(m.myRosterId, tradePartners(xs, m.myRosterId), profiles)
  }, [m, h.allTransactions, profiles])
  return {
    profiles: all as ManagerProfile[],
    traits,
    ideas,
    weeks,
    loading: h.tradesLoading || h.seasonLoading,
    pastLoading: h.pastLoading,
  }
}
