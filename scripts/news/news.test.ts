import { categorize } from '../../src/lib/newsTaxonomy.ts'
import { aggregate, type Deps, type NewsFile } from './aggregate.ts'
import {
  canonicalUrl,
  cleanText,
  decodeEntities,
  dedupe,
  excerptOf,
  EXCERPT_MAX,
  hashId,
  mergeArticles,
  normalizeItem,
  parseFeed,
  safeUrl,
  type NewsArticle,
} from './feed.ts'
import { buildPlayerIndex, matchPlayers, normName } from './players.ts'
import type { Source } from './sources.ts'

const SRC: Source = { id: 'pub', name: 'Pub', homepage: 'https://www.pub.com', url: 'https://www.pub.com/feed', kind: 'article', enabled: true, note: '' }
const NEWS_SRC: Source = { ...SRC, id: 'pubnews', kind: 'news', url: 'https://www.pub.com/news' }
const NOW = Date.parse('2026-11-11T12:00:00Z')

/* ---------------- text ---------------- */

describe('text sanitizing', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('A &amp; B &#8217;s &#x2019; &quot;x&quot; &nbsp;y &bogus;')).toBe('A & B ’s ’ "x"  y &bogus;')
  })
  it('strips markup, scripts and double-encoded tags, and collapses whitespace', () => {
    expect(cleanText('<![CDATA[<p>Hello <b>world</b></p><script>alert(1)</script>]]>')).toBe('Hello world')
    expect(cleanText('&lt;p&gt;Encoded &amp;amp; nested&lt;/p&gt;')).toBe('Encoded & nested')
    expect(cleanText('  a \n\n b\t')).toBe('a b')
  })
  it('keeps excerpts short, cut at a word, and drops WordPress footers', () => {
    expect(excerptOf('Short one. The post Short one appeared first on Pub.')).toBe('Short one.')
    const long = 'word '.repeat(100)
    const e = excerptOf(long)
    expect(e.length).toBeLessThanOrEqual(EXCERPT_MAX)
    expect(e.endsWith('…')).toBe(true)
    expect(e).not.toMatch(/wor…$/) // not cut mid-word
  })
})

describe('urls and ids', () => {
  it('allows http(s) only, optionally restricted to a publisher domain', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,hi')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
    expect(safeUrl('https://www.pub.com/a', 'www.pub.com')).toBe('https://www.pub.com/a')
    expect(safeUrl('https://news.pub.com/a', 'pub.com')).toBe('https://news.pub.com/a')
    expect(safeUrl('https://evil.com/pub.com', 'pub.com')).toBeNull()
    expect(safeUrl('https://notpub.com/a', 'pub.com')).toBeNull()
  })
  it('canonicalizes tracking params, fragments, www and trailing slashes', () => {
    expect(canonicalUrl('https://www.pub.com/a/?utm_source=x&id=2#top')).toBe('https://pub.com/a/?id=2')
    expect(canonicalUrl('https://www.pub.com/a/')).toBe('https://pub.com/a')
    expect(canonicalUrl('https://pub.com/a?utm_medium=rss')).toBe('https://pub.com/a')
  })
  it('hashes deterministically', () => {
    expect(hashId('abc')).toBe(hashId('abc'))
    expect(hashId('abc')).not.toBe(hashId('abd'))
    expect(hashId('abc')).toMatch(/^[0-9a-f]{16}$/)
  })
})

/* ---------------- parsing ---------------- */

const RSS = `<?xml version="1.0"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>Pub</title><link>https://www.pub.com</link><atom:link href="https://www.pub.com/feed" rel="self"/>
<item>
  <title><![CDATA[Waiver Wire Pickups: Week 10 &amp; More]]></title>
  <link>https://www.pub.com/waivers-week-10/?utm_source=rss</link>
  <dc:creator><![CDATA[Jane Writer]]></dc:creator>
  <pubDate>Tue, 10 Nov 2026 15:00:00 +0000</pubDate>
  <category><![CDATA[NFL]]></category><category>Waiver Wire</category>
  <description><![CDATA[<p>The best adds this week.</p>]]></description>
  <content:encoded><![CDATA[<p>SECRET FULL ARTICLE BODY that must never be stored.</p>]]></content:encoded>
  <media:content url="https://cdn.pub.com/img.jpg" medium="image"/>
</item>
<item><title>No link</title></item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>News</title>
<entry>
  <title type="html">Star Back: Out for Week 10</title>
  <link rel="alternate" href="https://www.pub.com/news/star-back"/><link rel="enclosure" href="https://cdn/x.mp3"/>
  <author><name>Desk</name></author>
  <published>2026-11-11T10:00:00Z</published><updated>2026-11-11T11:00:00Z</updated>
  <summary>Star Back (ankle) is out.</summary>
  <category term="Injuries"/>
</entry></feed>`

describe('parseFeed', () => {
  it('reads RSS items: title, link, author, date, summary, tags and image, never the article body', () => {
    const [a, b] = parseFeed(RSS)
    expect(a).toMatchObject({
      title: 'Waiver Wire Pickups: Week 10 & More',
      link: 'https://www.pub.com/waivers-week-10/?utm_source=rss',
      author: 'Jane Writer',
      published: 'Tue, 10 Nov 2026 15:00:00 +0000',
      summary: 'The best adds this week.',
      image: 'https://cdn.pub.com/img.jpg',
      categories: ['NFL', 'Waiver Wire'],
    })
    expect(JSON.stringify(a)).not.toMatch(/SECRET FULL ARTICLE BODY/)
    expect(b.link).toBe('')
  })
  it('reads Atom entries, preferring the alternate link', () => {
    const [e] = parseFeed(ATOM)
    expect(e).toMatchObject({
      title: 'Star Back: Out for Week 10',
      link: 'https://www.pub.com/news/star-back',
      author: 'Desk',
      published: '2026-11-11T10:00:00Z',
      summary: 'Star Back (ankle) is out.',
      categories: ['Injuries'],
      image: null,
    })
  })
  it('returns nothing for non-feeds', () => {
    expect(parseFeed('<html><body>Not found</body></html>')).toEqual([])
  })
})

describe('normalizeItem', () => {
  const [item] = parseFeed(RSS)
  it('builds a sanitized article with categories', () => {
    const a = normalizeItem(item, SRC, NOW)!
    expect(a).toMatchObject({ title: 'Waiver Wire Pickups: Week 10 & More', publisher: 'Pub', publisherId: 'pub', kind: 'article', author: 'Jane Writer', excerpt: 'The best adds this week.', image: 'https://cdn.pub.com/img.jpg', players: [] })
    expect(a.ts).toBe(Date.parse('2026-11-10T15:00:00Z'))
    expect(a.categories).toEqual(['Waiver Wire'])
    expect(a.id).toBe(hashId('https://pub.com/waivers-week-10'))
  })
  it('rejects items without a title or with a link off the publisher\'s domain', () => {
    expect(normalizeItem({ ...item, title: '' }, SRC, NOW)).toBeNull()
    expect(normalizeItem({ ...item, link: 'https://evil.com/x' }, SRC, NOW)).toBeNull()
    expect(normalizeItem({ ...item, link: 'javascript:void(0)' }, SRC, NOW)).toBeNull()
  })
  it('caps future dates at now and fills missing dates with now', () => {
    expect(normalizeItem({ ...item, published: '2099-01-01T00:00:00Z' }, SRC, NOW)!.ts).toBe(NOW)
    expect(normalizeItem({ ...item, published: null }, SRC, NOW)!.ts).toBe(NOW)
    expect(normalizeItem({ ...item, published: 'garbage' }, SRC, NOW)!.ts).toBe(NOW)
  })
  it('marks player-news blurbs as breaking news', () => {
    const [e] = parseFeed(ATOM)
    expect(normalizeItem(e, NEWS_SRC, NOW)!.categories).toEqual(['Breaking News', 'Injury Updates'])
  })
  it('drops a non-http image', () => {
    expect(normalizeItem({ ...item, image: 'javascript:x' }, SRC, NOW)!.image).toBeNull()
  })
})

/* ---------------- categories ---------------- */

describe('categorize', () => {
  it.each([
    ['Week 10 Start/Sit: Quarterbacks', 'Start / Sit'],
    ['Start em or sit em: RBs', 'Start / Sit'],
    ['Top Waiver Wire Pickups', 'Waiver Wire'],
    ['FAAB bids for Week 9', 'Waiver Wire'],
    ['Players to Buy Low & Sell High', 'Trade Targets'],
    ['Trade Value Chart Week 10', 'Trade Targets'],
    ['Puka Nacua (ankle) ruled out', 'Injury Updates'],
    ['WR Rankings Week 10', 'Player Rankings'],
    ['Week 10 Sleepers and Busts', 'Sleepers & Busts'],
    ['Matchup Analysis: Jaguars vs. Titans', 'Matchup Analysis'],
    ['Dynasty Rookie Rankings', 'Dynasty Football'],
    ['Keeper League Strategy', 'Keeper Strategy'],
    ['2027 NFL Mock Draft 2.0', 'NFL Draft'],
    ['Rest-of-Season Rankings Update', 'Rest-of-Season Rankings'],
    ['ROS outlook for rookie RBs', 'Rest-of-Season Rankings'],
  ])('%s → %s', (title, cat) => {
    expect(categorize(title, 'article')).toContain(cat)
  })
  it('supports several categories and none', () => {
    expect(categorize('Dynasty Rookie Rankings: Sleepers', 'article')).toEqual(['Player Rankings', 'Sleepers & Busts', 'Dynasty Football'])
    expect(categorize('Survivor pool picks', 'article')).toEqual([])
  })
  it('does not treat a fantasy draft as the NFL draft, or "ros" inside a word as ROS', () => {
    expect(categorize('Fantasy draft strategy for snake drafts', 'article')).not.toContain('NFL Draft')
    expect(categorize('Prospero ROSter notes', 'article')).not.toContain('Rest-of-Season Rankings')
  })
})

/* ---------------- dedupe / merge ---------------- */

const art = (over: Partial<NewsArticle>): NewsArticle => ({
  id: 'x', title: 'T', url: 'https://pub.com/t', publisher: 'Pub', publisherId: 'pub', kind: 'article', author: null,
  ts: NOW, published: new Date(NOW).toISOString(), excerpt: '', image: null, categories: [], players: [], tags: [], ...over,
})

describe('dedupe and merge', () => {
  it('drops repeats by id and by same publisher + same title, keeping the newest', () => {
    const out = dedupe([
      art({ id: 'a', title: 'Hello World', ts: NOW - 10 }),
      art({ id: 'a', title: 'Hello World', ts: NOW - 5 }),
      art({ id: 'b', title: 'hello,  world!', ts: NOW - 1, publisherId: 'pub-2' }),
      art({ id: 'c', title: 'Hello World', publisher: 'Other', ts: NOW }),
    ])
    expect(out.map((a) => a.id)).toEqual(['c', 'b'])
  })
  it('merges history, lets fresh copies win, drops old items and caps the total', () => {
    const prev = [art({ id: 'old', ts: NOW - 30 * 86_400_000 }), art({ id: 'keep', title: 'K', ts: NOW - 86_400_000 }), art({ id: 'upd', title: 'U', excerpt: 'stale' })]
    const fresh = [art({ id: 'upd', title: 'U', excerpt: 'fresh' }), art({ id: 'new', title: 'N', ts: NOW - 100 })]
    const out = mergeArticles(prev, fresh, { now: NOW, maxAgeDays: 14, maxItems: 10 })
    expect(out.map((a) => a.id).sort()).toEqual(['keep', 'new', 'upd'])
    expect(out.find((a) => a.id === 'upd')!.excerpt).toBe('fresh')
    expect(mergeArticles(prev, fresh, { now: NOW, maxAgeDays: 14, maxItems: 2 })).toHaveLength(2)
  })
})

/* ---------------- players ---------------- */

const PLAYERS = {
  p1: { player_id: 'p1', full_name: "D'Andre Swift", position: 'RB', team: 'CHI', active: true },
  p2: { player_id: 'p2', full_name: 'Gardner Minshew II', position: 'QB', team: 'LV', active: true },
  p3: { player_id: 'p3', full_name: 'Amon-Ra St. Brown', position: 'WR', team: 'DET', active: true },
  dupA: { player_id: 'dupA', full_name: 'Mike Williams', position: 'WR', team: 'NYJ', active: true },
  dupB: { player_id: 'dupB', full_name: 'Mike Williams', position: 'WR', team: 'PIT', active: true },
  lb: { player_id: 'lb', full_name: 'Josh Allen', position: 'LB', team: 'JAX', active: true },
  qb: { player_id: 'qb', full_name: 'Josh Allen', position: 'QB', team: 'BUF', active: true },
  retired: { player_id: 'retired', full_name: 'Old Timer', position: 'RB', team: null, active: false },
  mono: { player_id: 'mono', full_name: 'Prince', position: 'WR', team: 'DAL', active: true },
}
const index = buildPlayerIndex(PLAYERS)
const ids = (t: string) => matchPlayers(t, index).map((p) => p.id)

describe('player matching', () => {
  it('normalizes names: accents, apostrophes, hyphens, suffixes', () => {
    expect(normName("D'Andre Swift Jr.")).toBe('dandre swift')
    expect(normName('Gardner Minshew II')).toBe('gardner minshew')
    expect(normName('José Núñez')).toBe('jose nunez')
    expect(normName('Amon-Ra St. Brown')).toBe('amon ra st brown')
  })
  it('indexes only active fantasy-position players with full names', () => {
    expect(index.has('old timer')).toBe(false)
    expect(index.has('prince')).toBe(false)
    expect(index.get('josh allen')!.map((e) => e.id)).toEqual(['qb']) // the linebacker is not indexed
  })
  it('matches full names in order, without duplicates', () => {
    expect(ids("Swift and Gardner Minshew lead; D'Andre Swift again, Amon-Ra St. Brown too")).toEqual(['p2', 'p1', 'p3'])
  })
  it('never matches a last name alone', () => {
    expect(ids('Swift was limited; Minshew starts; Brown sits')).toEqual([])
  })
  it('resolves shared names only when the article names the team', () => {
    expect(ids('Mike Williams caught two passes')).toEqual([])
    expect(ids('Jets receiver Mike Williams caught two passes')).toEqual(['dupA'])
    expect(ids('Mike Williams (PIT) is questionable')).toEqual(['dupB'])
    expect(ids('Mike Williams of the Jets and the Steelers')).toEqual([]) // still ambiguous
  })
  it('maps "Josh Allen" to the quarterback, not the linebacker', () => {
    expect(ids('Josh Allen threw three touchdowns')).toEqual(['qb'])
  })
})

/* ---------------- aggregation ---------------- */

const A: Source = { ...SRC, id: 'a', name: 'Alpha', homepage: 'https://www.pub.com', url: 'https://feeds/a' }
const B: Source = { ...SRC, id: 'b', name: 'Beta', homepage: 'https://www.pub.com', url: 'https://feeds/b', kind: 'news' }

function deps(over: Partial<Record<string, string | Error>> = {}, json: Record<string, unknown | Error> = {}): Deps & { logs: string[] } {
  const logs: string[] = []
  return {
    logs,
    now: () => NOW,
    log: (m) => logs.push(m),
    fetchText: async (u) => {
      const r = over[u] ?? (u === 'https://feeds/a' ? RSS : u === 'https://feeds/b' ? ATOM : new Error('404'))
      if (r instanceof Error) throw r
      return r
    },
    fetchJson: async (u) => {
      const r = u in json ? json[u] : u.includes('sleeper') ? { s: { player_id: 's', full_name: 'Star Back', position: 'RB', team: 'BUF', active: true } } : new Error('404')
      if (r instanceof Error) throw r
      return r
    },
  }
}

describe('aggregate', () => {
  it('fetches every source, tags players and reports status', async () => {
    const f = await aggregate(deps(), { sources: [A, B], playersUrl: 'https://sleeper/players' })
    expect(f.sources.map((s) => [s.id, s.ok, s.count])).toEqual([['a', true, 1], ['b', true, 1]])
    expect(f.articles).toHaveLength(2)
    expect(f.articles.find((a) => a.publisher === 'Beta')!.players).toEqual([{ id: 's', name: 'Star Back' }])
    expect(f.playersMatched).toBe(true)
    expect(f.unavailable.map((u) => u.name)).toEqual(['Draft Sharks', 'Footballguys'])
    expect(f.publishers).toEqual(['Alpha', 'Beta'])
  })

  it('keeps going when a feed breaks, and records the error', async () => {
    const f = await aggregate(deps({ 'https://feeds/b': new Error('timeout') }), { sources: [A, B], playersUrl: 'https://sleeper/p' })
    expect(f.sources.find((s) => s.id === 'b')).toMatchObject({ ok: false, count: 0, error: 'timeout', lastSuccess: null })
    expect(f.articles.map((a) => a.publisher)).toEqual(['Alpha'])
  })

  it('treats a page with items but nothing usable as a broken feed', async () => {
    const offsite = RSS.replace(/https:\/\/www\.pub\.com\/waivers-week-10\//, 'https://elsewhere.com/x')
    const f = await aggregate(deps({ 'https://feeds/a': offsite }), { sources: [A], playersUrl: 'https://sleeper/p' })
    expect(f.sources[0]).toMatchObject({ ok: false, error: '2 items, none usable' })
  })

  it('merges the previously published file and carries last-success times for failing sources', async () => {
    const previous: NewsFile = {
      version: 1, updated: '', unavailable: [], categories: [], publishers: [], playersMatched: true,
      sources: [{ id: 'b', name: 'Beta', homepage: '', kind: 'news', ok: true, count: 1, error: null, fetchedAt: '', lastSuccess: '2026-11-10T00:00:00.000Z', note: '' }],
      articles: [art({ id: 'hist', title: 'Earlier Star Back story', publisher: 'Beta', ts: NOW - 86_400_000 })],
    }
    const d = deps({ 'https://feeds/b': new Error('down') }, { 'https://prev/news.json': previous })
    const f = await aggregate(d, { sources: [A, B], previousUrl: 'https://prev/news.json', playersUrl: 'https://sleeper/p' })
    expect(f.articles.map((a) => a.id)).toContain('hist')
    expect(f.articles.find((a) => a.id === 'hist')!.players).toEqual([{ id: 's', name: 'Star Back' }]) // re-tagged
    expect(f.sources.find((s) => s.id === 'b')!.lastSuccess).toBe('2026-11-10T00:00:00.000Z')
  })

  it('ignores a previous file that is not a news file', async () => {
    const d = deps({}, { 'https://prev/x': { hello: 'world' } })
    const f = await aggregate(d, { sources: [A], previousUrl: 'https://prev/x', playersUrl: 'https://sleeper/p' })
    expect(f.articles).toHaveLength(1)
    expect(d.logs.join('\n')).toMatch(/not a news file/)
  })

  it('still publishes when the player list is unavailable, keeping earlier tags', async () => {
    const previous = { version: 1, updated: '', unavailable: [], categories: [], publishers: [], playersMatched: true, sources: [], articles: [art({ id: 'hist', title: 'Old', players: [{ id: 'z', name: 'Zed' }] })] }
    const f = await aggregate(deps({}, { 'https://sleeper/p': new Error('down'), 'https://prev': previous }), { sources: [A], previousUrl: 'https://prev', playersUrl: 'https://sleeper/p' })
    expect(f.playersMatched).toBe(false)
    expect(f.articles.find((a) => a.id === 'hist')!.players).toEqual([{ id: 'z', name: 'Zed' }])
  })

  it('produces a valid, empty file when every source fails and there is no history', async () => {
    const f = await aggregate(deps({ 'https://feeds/a': new Error('x'), 'https://feeds/b': new Error('y') }), { sources: [A, B], playersUrl: 'https://sleeper/p' })
    expect(f.articles).toEqual([])
    expect(f.sources.every((s) => !s.ok)).toBe(true)
    expect(f.version).toBe(1)
  })

  it('skips disabled sources', async () => {
    const f = await aggregate(deps(), { sources: [A, { ...B, enabled: false }], playersUrl: 'https://sleeper/p' })
    expect(f.sources.map((s) => s.id)).toEqual(['a'])
  })
})
