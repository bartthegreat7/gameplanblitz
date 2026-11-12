/* Publisher feeds. Every feed here was verified on 2026-11-11: published by the publisher itself
   (RSS/Atom), not disallowed by robots.txt, and used only for headline + short excerpt +
   publisher-supplied thumbnail + link back. Full article bodies are never stored, even when a
   feed includes them (FantasyPros embeds content:encoded; it is ignored). Personal,
   non-commercial use. Set `enabled: false` to drop a source. */

export interface Source {
  id: string
  name: string
  homepage: string
  url: string
  /** "news" = short player-news blurbs, "article" = analysis pieces */
  kind: 'news' | 'article'
  enabled: boolean
  /** how the feed's use was checked; shown in the app's publisher list */
  note: string
}

export const SOURCES: Source[] = [
  {
    id: 'fantasypros',
    name: 'FantasyPros',
    homepage: 'https://www.fantasypros.com',
    url: 'https://www.fantasypros.com/feed/',
    kind: 'article',
    enabled: true,
    note: 'Public site RSS feed. Article bodies in the feed are ignored.',
  },
  {
    id: '4for4',
    name: '4for4',
    homepage: 'https://www.4for4.com',
    url: 'https://www.4for4.com/articles/rss.xml',
    kind: 'article',
    enabled: true,
    note: 'Articles RSS advertised on the homepage. Many articles are premium; links go to 4for4.',
  },
  {
    id: 'rotowire-news',
    name: 'RotoWire',
    homepage: 'https://www.rotowire.com',
    url: 'https://www.rotowire.com/rss/news.php?sport=NFL',
    kind: 'news',
    enabled: true,
    note: 'RotoWire publishes NFL player-news RSS "for blogs and personal websites".',
  },
  {
    id: 'rotowire-articles',
    name: 'RotoWire',
    homepage: 'https://www.rotowire.com',
    url: 'https://www.rotowire.com/rss/articles.php?sport=NFL',
    kind: 'article',
    enabled: true,
    note: 'RotoWire publishes NFL article RSS "for blogs and personal websites".',
  },
  {
    id: 'rotoworld',
    name: 'NBC Sports Rotoworld',
    homepage: 'https://www.nbcsports.com/fantasy/football',
    url: 'https://www.nbcsports.com/fantasy/football.atom',
    kind: 'news',
    enabled: true,
    note: 'Atom feed advertised on the NBC Sports fantasy football page.',
  },
  {
    id: 'rotoballer',
    name: 'RotoBaller',
    homepage: 'https://www.rotoballer.com',
    url: 'https://www.rotoballer.com/category/nfl/feed',
    kind: 'article',
    enabled: true,
    note: 'Public NFL category RSS feed. RotoBaller also offers partner feeds; switch if you join that program.',
  },
  {
    id: 'dynastynerds',
    name: 'Dynasty Nerds',
    homepage: 'https://www.dynastynerds.com',
    url: 'https://www.dynastynerds.com/feed/',
    kind: 'article',
    enabled: true,
    note: 'Public site RSS feed.',
  },
]

/** Publishers requested but not integrated, and why. Shown in the app; never faked. */
export const UNAVAILABLE = [
  { name: 'Draft Sharks', reason: 'No RSS/Atom feed or public API found (checked /feed, /rss, and homepage feed links). Scraping is not allowed.' },
  { name: 'Footballguys', reason: 'No RSS/Atom feed or public API found (checked /rss and homepage feed links). Scraping is not allowed.' },
]

export const USER_AGENT = 'GameplanBlitz-News/1.0 (personal non-commercial fantasy dashboard; fetches each feed at most every 2 hours)'
