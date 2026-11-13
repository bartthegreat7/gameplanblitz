import type { EpisodeType } from './podcast'
import { datesOfWeek, dueShows, episodeKey, showDueDates } from './series'

// a normal week: TNF Thu 11/13, Sun 11/16, MNF Mon 11/17
const normal = ['2025-11-13', '2025-11-16', '2025-11-16', '2025-11-17']
// an international week: Thu 9/4, Fri 9/5 (Brazil), Sun 9/7
const intl = ['2025-09-04', '2025-09-05', '2025-09-07']
// a late-season week with Saturday games: Thu 12/18, Sat 12/20, Sun 12/21
const saturday = ['2025-12-18', '2025-12-20', '2025-12-21']
// a holiday week that opens on Wednesday 12/25, after a previous week ending Monday 12/23
const christmas = ['2024-12-25', '2024-12-26', '2024-12-28', '2024-12-29']
const beforeChristmas = ['2024-12-19', '2024-12-21', '2024-12-22', '2024-12-23']

const ALL: EpisodeType[] = ['recap', 'moves', 'preview', 'kickoff']

describe('weekly show schedule', () => {
  it('derives Monday, Tuesday, Thursday and weekend due dates from the week’s game dates', () => {
    expect(showDueDates(normal)).toEqual({ recap: '2025-11-10', moves: '2025-11-11', preview: '2025-11-13', kickoff: '2025-11-16' })
    expect(showDueDates(intl)!.kickoff).toBe('2025-09-05') // the Friday international game comes first
    expect(showDueDates(saturday)!.kickoff).toBe('2025-12-20')
    expect(showDueDates([])).toBeNull()
  })

  it('never puts the Postgame Report before the previous week’s last game is over', () => {
    // first game Wednesday 12/25: three days before is Sunday 12/22, but Monday Night Football is 12/23
    expect(showDueDates(christmas, beforeChristmas)).toEqual({ recap: '2024-12-24', moves: '2024-12-24', preview: '2024-12-25', kickoff: '2024-12-26' })
  })

  it('makes each enabled show due once, from the chosen hour on its day', () => {
    const at = (today: string, hour: number, existing = new Set<EpisodeType>(), dueHour?: number) =>
      dueShows({ gameDates: normal, enabled: ALL, today, hour, existing, dueHour })
    expect(at('2025-11-10', 5)).toEqual([])
    expect(at('2025-11-10', 6)).toEqual(['recap'])
    expect(at('2025-11-10', 6, new Set(), 9)).toEqual([]) // the user prefers 9 AM
    expect(at('2025-11-11', 7, new Set(['recap']))).toEqual(['moves'])
    expect(at('2025-11-13', 9)).toEqual(['recap', 'moves', 'preview']) // late shows are still made, once
    expect(at('2025-11-13', 9, new Set(['recap', 'moves']))).toEqual(['preview']) // no duplicates
    expect(at('2025-11-16', 7, new Set(['recap', 'moves', 'preview']))).toEqual(['kickoff'])
    expect(at('2025-11-17', 7, new Set(['recap', 'moves', 'preview']))).toEqual([]) // a late kickoff briefing is skipped
    expect(at('2025-11-18', 7)).toEqual([]) // the week is over
  })

  it('respects the opt-in list, reads a week’s dates from the schedule and keys episodes for idempotency', () => {
    expect(dueShows({ gameDates: normal, today: '2025-11-13', hour: 9, enabled: ['preview'], existing: new Set() })).toEqual(['preview'])
    expect(dueShows({ gameDates: normal, today: '2025-11-13', hour: 9, enabled: [], existing: new Set() })).toEqual([])
    expect(datesOfWeek([{ week: 1, date: '2025-09-04' }, { week: 2, date: '2025-09-11' }, { week: 1, date: null }], 1)).toEqual(['2025-09-04'])
    expect(episodeKey('L1', '2025', 11, 'moves')).toBe('L1:2025:11:moves')
  })
})
