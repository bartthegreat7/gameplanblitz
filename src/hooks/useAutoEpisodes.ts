import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { buildEpisode } from '../lib/ai/autoEpisode'
import { aiConfigured, fetchServerEpisodes } from '../lib/ai/client'
import { dueShows } from '../lib/ai/series'
import { listEpisodes, newId, saveEpisode } from '../lib/ai/storage'
import { getSchedule } from '../lib/sleeper'
import { useAppStore } from '../store/app'
import type { FactSheet } from './useFactSheet'
import type { Ready } from './useLeagueData'
import { useSession } from './useSession'

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Opted-in automatic shows, prepared when GamePlanBitz is open: if this week's Weekly Review, Game
 * Plan or Kickoff Briefing is due and missing, it is written from the fact sheet and saved to the
 * library (one per show per week). This is not a background scheduler: with the site closed, only the
 * AI Worker's scheduled job can prepare episodes. Returns a counter that changes when episodes are added.
 */
export function useAutoEpisodes(data: Ready, sheet: FactSheet) {
  const prefs = useAppStore((s) => s.podcast)
  const username = useAppStore((s) => s.username)
  const token = useAppStore((s) => s.aiToken)
  const { currentWeek } = useSession()
  const { league, season, week } = data
  const scheduleQ = useQuery({ queryKey: ['schedule', season], queryFn: () => getSchedule(season), staleTime: 30 * 60_000, retry: 1 })
  const busy = useRef(false)
  const [made, setMade] = useState(0)
  const ready = prefs.auto && week === currentWeek && sheet.pending.length === 0 && !!scheduleQ.data && sheet.facts.length > 0
  const showsKey = prefs.shows.join(',')
  useEffect(() => {
    if (!ready || busy.current) return
    busy.current = true
    const gameDates = (scheduleQ.data ?? []).filter((g) => g.week === week).map((g) => g.date)
    void (async () => {
      try {
        let eps = await listEpisodes(league.league_id)
        let synced = 0
        if (aiConfigured() && username) {
          // episodes the Worker's scheduled job prepared: keep a copy in this browser's library
          try {
            const remote = await fetchServerEpisodes(username, league.league_id, token)
            const have = new Set(eps.map((e) => e.id))
            for (const ep of remote.filter((e) => !have.has(e.id))) {
              await saveEpisode(ep)
              synced++
            }
            if (synced) eps = await listEpisodes(league.league_id)
          } catch {
            /* the server is optional: prepare locally instead */
          }
        }
        // any episode of the show this week counts, made by hand or automatically
        const existing = new Set(eps.filter((e) => e.week === week && (e.season ?? season) === season).map((e) => e.type))
        const now = new Date()
        const due = dueShows({ gameDates, today: localDay(now), hour: now.getHours(), enabled: prefs.shows, existing })
        let added = 0
        for (const type of due) {
          const ep = buildEpisode({
            id: newId(),
            type,
            facts: sheet.facts,
            factsAsOf: sheet.asOf ?? now.getTime(),
            leagueId: league.league_id,
            leagueName: league.name,
            season,
            week,
            length: type === 'recap' ? prefs.length : 'short',
            format: prefs.format,
            tone: prefs.tone,
            now: now.getTime(),
            auto: true,
          })
          if (ep) {
            await saveEpisode(ep)
            added++
          }
        }
        if (added || synced) setMade((n) => n + 1)
      } finally {
        busy.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, showsKey, prefs.length, prefs.format, prefs.tone, league.league_id, season, week])
  return made
}
