/* News taxonomy shared by the aggregator (scripts/news, run by Node in CI) and the app.
   Self-contained on purpose: no imports, so Node can run it directly with type stripping. */

export const NEWS_CATEGORIES = [
  'Breaking News',
  'Start / Sit',
  'Waiver Wire',
  'Trade Targets',
  'Injury Updates',
  'Player Rankings',
  'Sleepers & Busts',
  'Matchup Analysis',
  'Dynasty Football',
  'Keeper Strategy',
  'NFL Draft',
  'Rest-of-Season Rankings',
] as const

export type NewsCategory = (typeof NEWS_CATEGORIES)[number]

/**
 * Keyword rules, applied to the title, excerpt and the publisher's own tags. Deliberately
 * conservative: an article can match several categories, or none.
 */
export const CATEGORY_RULES: [NewsCategory, RegExp | RegExp[]][] = [
  ['Start / Sit', /\bstart\s*\/\s*sit\b|\bstart or sit\b|\bstart[- ]?em\b|\bsit[- ]?em\b|\bstarts? and sits?\b|\bwho to start\b/i],
  ['Waiver Wire', /\bwaivers?\b|\bpickups?\b|\bFAAB\b|\bstreamers?\b|\bstreaming\b|\bwaiver wire\b/i],
  ['Trade Targets', /\btrade (targets?|advice|value|chart|analyzer)\b|\bbuy[- ]low\b|\bsell[- ]high\b|\bplayers to (buy|sell)\b/i],
  ['Injury Updates', /\binjur(y|ies|ed)\b|\bquestionable\b|\bdoubtful\b|\bruled out\b|\bconcussion\b|\bhamstring\b|\bankle\b|\bknee\b|\bgroin\b|\bshoulder\b|\blimited practice\b|\bdid not practice\b|\binjured reserve\b|\bplaced on IR\b|\bout for\b/i],
  ['Player Rankings', /\brankings?\b|\btiers?\b|\btop \d+\b/i],
  ['Sleepers & Busts', /\bsleepers?\b|\bbusts?\b|\bbreakouts?\b|\boverrated\b|\bunderrated\b/i],
  ['Matchup Analysis', /\bmatchups?\b|\bDFS\b|\bgame preview\b|\bdefense vs\b|\bvs\. [A-Z]/i],
  ['Dynasty Football', /\bdynasty\b|\brookies?\b|\bprospects?\b|\bdevy\b/i],
  ['Keeper Strategy', /\bkeepers?\b/i],
  ['NFL Draft', /\bNFL draft\b|\bmock draft\b|\bbig board\b|\bscouting combine\b|\bdraft prospects?\b|\bpre-draft\b/i],
  // the phrase in any case; the acronym only in capitals, so words like "roster" never match
  ['Rest-of-Season Rankings', [/\brest[- ]of[- ]season\b/i, /\bROS\b/]],
]

/** Categories for one article. Player-news blurbs (kind "news") are always Breaking News. */
export function categorize(text: string, kind: 'news' | 'article'): NewsCategory[] {
  const out = new Set<NewsCategory>()
  if (kind === 'news') out.add('Breaking News')
  for (const [cat, re] of CATEGORY_RULES) if ((Array.isArray(re) ? re : [re]).some((r) => r.test(text))) out.add(cat)
  return NEWS_CATEGORIES.filter((c) => out.has(c))
}

/** Team code → words that name the team in text (city and nickname), for disambiguating players. */
export const TEAM_NAMES: Record<string, string[]> = {
  ARI: ['arizona', 'cardinals'], ATL: ['atlanta', 'falcons'], BAL: ['baltimore', 'ravens'], BUF: ['buffalo', 'bills'],
  CAR: ['carolina', 'panthers'], CHI: ['chicago', 'bears'], CIN: ['cincinnati', 'bengals'], CLE: ['cleveland', 'browns'],
  DAL: ['dallas', 'cowboys'], DEN: ['denver', 'broncos'], DET: ['detroit', 'lions'], GB: ['green bay', 'packers'],
  HOU: ['houston', 'texans'], IND: ['indianapolis', 'colts'], JAX: ['jacksonville', 'jaguars'], KC: ['kansas city', 'chiefs'],
  LV: ['las vegas', 'raiders'], LAC: ['chargers'], LAR: ['rams'], MIA: ['miami', 'dolphins'],
  MIN: ['minnesota', 'vikings'], NE: ['new england', 'patriots'], NO: ['new orleans', 'saints'], NYG: ['giants'],
  NYJ: ['jets'], PHI: ['philadelphia', 'eagles'], PIT: ['pittsburgh', 'steelers'], SF: ['san francisco', '49ers', 'niners'],
  SEA: ['seattle', 'seahawks'], TB: ['tampa bay', 'buccaneers', 'bucs'], TEN: ['tennessee', 'titans'], WAS: ['washington', 'commanders'],
}
