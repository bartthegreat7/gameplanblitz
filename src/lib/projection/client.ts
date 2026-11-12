import { pointsFor, seasonPPG, type Scoring } from '../scoring'
import { getJson, HttpError, type StatLine, type StatRow } from '../sleeper'
import {
  features,
  formatFor,
  gameUsage,
  MIN_PREV_GAMES,
  project,
  xfpOf,
  type FormatModel,
  type GameUsage,
  type ModelFile,
  type Projection,
} from './engine'

/** The model file hasn't been published yet (local development before the first CI run). */
export class ModelNotPublished extends Error {
  constructor() {
    super('The projection model has not been published yet')
  }
}

export async function getModelFile(): Promise<ModelFile> {
  try {
    const f = await getJson<ModelFile>(`${import.meta.env.BASE_URL}model.json`)
    if (!f || !f.formats) throw new Error('Unrecognized model file')
    return f
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new ModelNotPublished()
    throw e
  }
}

export interface PlayerGame {
  week: number
  stats: StatLine
}

/** Per-player played games (ascending by week) from completed weekly stat rows. */
export function gamesByPlayer(
  weeks: { week: number; rows: StatRow[] }[],
): Map<string, PlayerGame[]> {
  const map = new Map<string, PlayerGame[]>()
  for (const { week, rows } of [...weeks].sort((a, b) => a.week - b.week))
    for (const r of rows) {
      if ((r.stats.gp || r.stats.gms_active || 0) <= 0) continue
      const list = map.get(r.player_id)
      if (list) list.push({ week, stats: r.stats })
      else map.set(r.player_id, [{ week, stats: r.stats }])
    }
  return map
}

export interface EngineInputs {
  model: ModelFile | null
  scoring: Scoring
  /** games before the target week */
  games: Map<string, PlayerGame[]>
  prevSeason: Record<string, StatLine> | null
}

export interface PlayerProjection extends Projection {
  /** the last 3 games, newest first, scored in league scoring */
  recentGames: GameUsage[]
  prevGames: number
}

/** The engine for one player in this league's scoring (baseline = Sleeper's projection in league scoring). */
export function projectPlayer(
  id: string,
  pos: string,
  baseline: number,
  inp: EngineInputs,
): PlayerProjection {
  const fm: FormatModel | undefined = inp.model?.formats[formatFor(inp.scoring.rec)]
  const recentGames = (inp.games.get(id) ?? [])
    .slice(-3)
    .reverse()
    .map((g) =>
      gameUsage(
        g.week,
        g.stats,
        pointsFor(g.stats, inp.scoring),
        xfpOf(pos, g.stats, fm?.xfp[pos]),
      ),
    )
  const prev = inp.prevSeason?.[id]
  const prevGames = prev ? prev.gp || prev.gms_active || 0 : 0
  const prevPpg = prevGames >= MIN_PREV_GAMES ? seasonPPG(prev, inp.scoring) : null
  return { ...project(pos, features(baseline, recentGames, prevPpg), fm), recentGames, prevGames }
}
