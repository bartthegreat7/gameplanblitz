import type { Article } from './news'
import { playerIdsOf } from './news'
import {
  breakingNews,
  EMPTY_FILTERS,
  featured,
  filterArticles,
  longTerm,
  mentioning,
  trendingPlayers,
  type FilterContext,
} from './newsFeed'

const NOW = Date.parse('2026-11-11T12:00:00Z')
const H = 3_600_000
const art = (id: string, over: Partial<Article> = {}): Article => ({
  id, title: `Title ${id}`, url: `https://pub.com/${id}`, publisher: 'Pub', publisherId: 'pub', kind: 'article', ts: NOW - H, excerpt: '', categories: [], players: [], ...over,
})
const idsOf = (a: Article) => (a.players ?? []).map((p) => p.id)

describe('breakingNews', () => {
  it('lists player news from the last 24 hours, newest first', () => {
    const list = [art('old', { kind: 'news', ts: NOW - 30 * H }), art('a', { kind: 'news', ts: NOW - 2 * H }), art('b', { categories: ['Breaking News'], ts: NOW - H }), art('analysis')]
    expect(breakingNews(list, NOW).map((a) => a.id)).toEqual(['b', 'a'])
  })
})

describe('featured', () => {
  it('prefers recent analysis with images and priority publishers, one per publisher', () => {
    const list = [
      art('news', { kind: 'news', image: 'https://i/x.jpg', publisher: 'N' }),
      art('plain', { publisher: 'A', ts: NOW - 0.5 * H }),
      art('img', { publisher: 'B', image: 'https://i/b.jpg', ts: NOW - 3 * H }),
      art('fp', { publisher: 'FantasyPros', publisherId: 'fantasypros', ts: NOW - 2 * H }),
      art('img2', { publisher: 'B', image: 'https://i/b2.jpg', ts: NOW - 4 * H }),
      art('stale', { publisher: 'C', image: 'https://i/c.jpg', ts: NOW - 100 * H }),
    ]
    expect(featured(list, NOW).map((a) => a.id)).toEqual(['img', 'fp', 'plain'])
  })
})

describe('trendingPlayers', () => {
  it('needs coverage from at least two publishers inside the window', () => {
    const p = (id: string, name: string) => ({ id, name })
    const list = [
      art('1', { publisher: 'A', players: [p('x', 'Xavier'), p('y', 'Yan')] }),
      art('2', { publisher: 'B', players: [p('x', 'Xavier')] }),
      art('3', { publisher: 'A', players: [p('y', 'Yan')] }), // same publisher twice: not trending
      art('4', { publisher: 'C', players: [p('x', 'Xavier')], ts: NOW - 200 * H }), // outside the window
    ]
    expect(trendingPlayers(list, NOW)).toEqual([{ id: 'x', name: 'Xavier', publishers: 2, articles: 2 }])
  })
})

describe('mentioning and longTerm', () => {
  const list = [
    art('mine', { players: [{ id: 'r1', name: 'R' }], ts: NOW - 2 * H }),
    art('dyn', { categories: ['Dynasty Football'] }),
    art('rookie', { players: [{ id: 'rk', name: 'Rook' }] }),
    art('none'),
  ]
  it('finds articles about given players, newest first', () => {
    expect(mentioning(list, new Set(['r1']), idsOf).map((a) => a.id)).toEqual(['mine'])
    expect(mentioning(list, new Set(), idsOf)).toEqual([])
  })
  it('collects long-term categories and rookie coverage', () => {
    expect(longTerm(list, (id) => id === 'rk', idsOf).map((a) => a.id).sort()).toEqual(['dyn', 'rookie'])
  })
})

describe('filterArticles', () => {
  const list = [
    art('w', { title: 'Waiver Wire Pickups', publisher: 'FantasyPros', categories: ['Waiver Wire'], players: [{ id: 'rb', name: 'Rusher Runnerson' }], ts: NOW - 2 * H }),
    art('t', { title: 'Trade targets', publisher: '4for4', categories: ['Trade Targets'], players: [{ id: 'wr', name: 'Wideout Catchwell' }], ts: NOW - 50 * H }),
    art('o', { title: 'Old injury report', publisher: '4for4', categories: ['Injury Updates'], ts: NOW - 200 * H }),
  ]
  const ctx: FilterContext = {
    now: NOW,
    saved: ['t'],
    read: ['w'],
    idsOf,
    playerInfo: (id) => ({ rb: { team: 'BUF', pos: 'RB' }, wr: { team: 'MIA', pos: 'WR' } })[id] ?? null,
  }
  const ids = (patch: Partial<typeof EMPTY_FILTERS>) => filterArticles(list, { ...EMPTY_FILTERS, ...patch }, ctx).map((a) => a.id)

  it('returns everything, newest first, by default', () => expect(ids({})).toEqual(['w', 't', 'o']))
  it('sorts oldest first on request', () => expect(ids({ sort: 'oldest' })).toEqual(['o', 't', 'w']))
  it('searches titles', () => expect(ids({ q: 'waiver' })).toEqual(['w']))
  it('searches tagged player names', () => expect(ids({ player: 'catch' })).toEqual(['t']))
  it('filters by team and position of tagged players', () => {
    expect(ids({ team: 'BUF' })).toEqual(['w'])
    expect(ids({ position: 'WR' })).toEqual(['t'])
    expect(ids({ team: 'BUF', position: 'WR' })).toEqual([]) // one player must satisfy both
  })
  it('filters by publisher, category and date range', () => {
    expect(ids({ publisher: '4for4' })).toEqual(['t', 'o'])
    expect(ids({ category: 'Injury Updates' })).toEqual(['o'])
    expect(ids({ range: '24h' })).toEqual(['w'])
    expect(ids({ range: '3d' })).toEqual(['w', 't'])
  })
  it('shows saved or unread only', () => {
    expect(ids({ scope: 'saved' })).toEqual(['t'])
    expect(ids({ scope: 'unread' })).toEqual(['t', 'o'])
  })
})

describe('playerIdsOf', () => {
  it('trusts the aggregator\'s matches when present, else falls back to name search over candidates', () => {
    expect(playerIdsOf(art('a', { players: [{ id: 'x', name: 'X' }] }), ['y'], {})).toEqual(['x'])
    const legacy = { id: 'b', title: 'Saquon Barkley is questionable', url: 'https://x' }
    expect(playerIdsOf(legacy, ['s'], { s: { position: 'RB', full_name: 'Saquon Barkley', last_name: 'Barkley' } })).toEqual(['s'])
  })
})

describe('featured relevance', () => {
  it('ranks a categorized fantasy piece above an uncategorized one, even one with an image', () => {
    const list = [
      art('survivor', { publisher: '4for4', publisherId: '4for4', image: 'https://i/s.jpg', categories: [] }),
      art('waivers', { publisher: 'RotoBaller', categories: ['Waiver Wire'] }),
    ]
    expect(featured(list, NOW).map((a) => a.id)).toEqual(['waivers', 'survivor'])
  })
})
