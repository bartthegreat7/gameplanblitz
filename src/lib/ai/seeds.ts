/** Starter questions that fit the page the user is on. */
export function seedsFor(path: string, name: (id: string) => string, known: (id: string) => boolean): string[] | undefined {
  const player = /^\/players\/([^/]+)/.exec(path)?.[1]
  if (player && known(player)) {
    const n = name(player)
    return [`Should I start ${n}?`, `What does the model project for ${n}?`, `Is ${n} injured?`, `Any news on ${n}?`]
  }
  const map: Record<string, string[]> = {
    '/waivers': ['Who should I pick up?', 'Is anyone worth a stash?'],
    '/breakouts': ['Who should I pick up?', 'Any breakout pickups?'],
    '/trades': ['Any trade ideas?', 'What are my playoff odds?'],
    '/market': ['Any trade ideas?', 'Who should I pick up?'],
    '/playoffs': ['What are my playoff odds?', 'How does my matchup look?'],
    '/standings': ['Show me the standings', 'What are my playoff odds?'],
    '/scouting': ['How does my opponent look?', 'Will I win this week?'],
    '/keepers': ['Who should I keep?'],
    '/injuries': ['Any injury concerns in my lineup?', 'Who should I start?'],
    '/gameday': ['Will I win this week?', 'Any injury concerns in my lineup?'],
  }
  return map[path]
}
