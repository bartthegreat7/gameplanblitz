import { dueShows, episodeKey, showDueDates } from './series'

// a normal week: TNF Thu 11/13, Sun 11/16, MNF Mon 11/17
const normal = ['2025-11-13', '2025-11-16', '2025-11-16', '2025-11-17']
// an international week: Thu 9/4, Fri 9/5 (Brazil), Sun 9/7
const intl = ['2025-09-04', '2025-09-05', '2025-09-07']
// a late-season week with Saturday games: Thu 12/18, Sat 12/20, Sun 12/21
const saturday = ['2025-12-18', '2025-12-20', '2025-12-21']

describe('weekly show schedule', () => {
  it('derives due dates from the week’s game dates', () => {
    expect(showDueDates(normal)).toEqual({ recap: '2025-11-11', preview: '2025-11-13', kickoff: '2025-11-16' })
    expect(showDueDates(intl)!.kickoff).toBe('2025-09-05') // the Friday international game comes first
    expect(showDueDates(saturday)!.kickoff).toBe('2025-12-20')
    expect(showDueDates([])).toBeNull()
  })

  it('makes each enabled show due once, from 6 AM local on its day', () => {
    const base = { gameDates: normal, enabled: ['recap', 'preview', 'kickoff'] as const, existing: new Set<never>() }
    const at = (today: string, hour: number, existing = new Set<'recap' | 'preview' | 'kickoff'>()) =>
      dueShows({ ...base, enabled: [...base.enabled], today, hour, existing })
    expect(at('2025-11-11', 5)).toEqual([])
    expect(at('2025-11-11', 6)).toEqual(['recap'])
    expect(at('2025-11-13', 9)).toEqual(['recap', 'preview'])
    expect(at('2025-11-13', 9, new Set(['recap']))).toEqual(['preview']) // no duplicates
    expect(at('2025-11-16', 7, new Set(['recap', 'preview']))).toEqual(['kickoff'])
    expect(at('2025-11-17', 7, new Set(['recap', 'preview']))).toEqual([]) // a late kickoff briefing is skipped
    expect(at('2025-11-18', 7)).toEqual([]) // the week is over
  })

  it('respects the opt-in list and keys episodes for idempotency', () => {
    expect(dueShows({ gameDates: normal, today: '2025-11-13', hour: 9, enabled: ['preview'], existing: new Set() })).toEqual(['preview'])
    expect(dueShows({ gameDates: normal, today: '2025-11-13', hour: 9, enabled: [], existing: new Set() })).toEqual([])
    expect(episodeKey('L1', '2025', 11, 'recap')).toBe('L1:2025:11:recap')
  })
})
