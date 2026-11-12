/* Player matching: which NFL players an article is about. Conservative by design, because a
   wrong match is worse than a missed one:
   - full names only (never last names alone), at least two words;
   - fantasy positions only (QB/RB/WR/TE/K) and active players;
   - when two active players share a name, the article must also name the player's team;
     otherwise the match is skipped. */

import { TEAM_NAMES } from '../../src/lib/newsTaxonomy.ts'
import type { ArticlePlayer } from './feed.ts'

export interface PlayerLite {
  player_id: string
  full_name?: string
  first_name?: string
  last_name?: string
  position?: string | null
  team?: string | null
  active?: boolean
  status?: string | null
}

interface Entry {
  id: string
  name: string
  team: string | null
}

export type PlayerIndex = Map<string, Entry[]>

const FANTASY = new Set(['QB', 'RB', 'WR', 'TE', 'K'])
const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)$/

/** Lowercase, no accents or punctuation, no generational suffix: "D’Andre Swift Jr." → "dandre swift". */
export function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(SUFFIX, '')
}

export function buildPlayerIndex(players: Record<string, PlayerLite>): PlayerIndex {
  const idx: PlayerIndex = new Map()
  for (const p of Object.values(players)) {
    if (!p?.player_id || !p.position || !FANTASY.has(p.position)) continue
    if (!(p.active === true || p.status === 'Active' || p.team)) continue
    const display = p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
    const key = normName(display)
    if (key.split(' ').length < 2) continue
    const list = idx.get(key) ?? []
    list.push({ id: p.player_id, name: display, team: p.team ?? null })
    idx.set(key, list)
  }
  return idx
}

const MAX_NAME_WORDS = 4

/** Players named in `text`, in order of first mention, without duplicates. */
export function matchPlayers(text: string, index: PlayerIndex): ArticlePlayer[] {
  const norm = normName(text)
  const words = norm.split(' ').filter(Boolean)
  const padded = ` ${norm} `
  const teamMentioned = (team: string | null) =>
    !!team && (padded.includes(` ${team.toLowerCase()} `) || (TEAM_NAMES[team] ?? []).some((n) => padded.includes(` ${n} `)))

  const out: ArticlePlayer[] = []
  const seen = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    // prefer the longest name starting here ("amon ra st brown" over a shorter prefix)
    for (let n = Math.min(MAX_NAME_WORDS, words.length - i); n >= 2; n--) {
      const cands = index.get(words.slice(i, i + n).join(' '))
      if (!cands) continue
      const pick = cands.length === 1 ? cands[0] : (() => {
        const withTeam = cands.filter((c) => teamMentioned(c.team))
        return withTeam.length === 1 ? withTeam[0] : null
      })()
      if (pick && !seen.has(pick.id)) {
        seen.add(pick.id)
        out.push({ id: pick.id, name: pick.name })
      }
      i += n - 1 // a name's words are not reused for another, overlapping name
      break
    }
  }
  return out
}
