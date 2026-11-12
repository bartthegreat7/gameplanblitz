/* Projection model build, run server-side by the deploy workflow (Node 24 runs TypeScript directly):
     node scripts/model/build.ts --out public/model.json [--previous <url of the published model.json>]
   Downloads Sleeper's weekly baseline projections and actual stats for the previous and current
   seasons, fits the projection engine (src/lib/projection/engine.ts) with a rolling backtest, and
   writes one static JSON file the app reads. Never fails the deploy: on error the app falls back to
   Sleeper's projections. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  backtest,
  features,
  fitCoef,
  fitXfp,
  FORMAT_KEY,
  gameUsage,
  gate,
  metrics,
  MIN_BASELINE,
  MIN_PREV_GAMES,
  MODEL_VERSION,
  played,
  POSITIONS,
  residualGrid,
  residualQuantiles,
  tierOf,
  TIERS,
  xfpOf,
  type Format,
  type FormatModel,
  type GameUsage,
  type ModelFile,
  type Pos,
  type Prediction,
  type Sample,
  type Stats,
} from '../../src/lib/projection/engine.ts'

const SLEEPER = 'https://api.sleeper.app'
const USER_AGENT =
  'GameplanBlitz model builder (personal, non-commercial; https://github.com/bartthegreat7/gameplanblitz)'
const REGULAR_WEEKS = 18
const FORMATS: Format[] = ['ppr', 'half', 'std']

interface Row {
  id: string
  pos: string
  stats: Stats
  injury: string
}

type Fetch = (url: string) => Promise<unknown>

const defaultFetch: Fetch = async (url) => {
  const r = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.json()
}

/** Normalize Sleeper's array-or-object weekly responses to slim rows. */
export function slimRows(body: unknown): Row[] {
  const list: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? Object.entries(body).map(([player_id, stats]) => ({ player_id, stats }))
      : []
  const out: Row[] = []
  for (const raw of list) {
    const r = raw as {
      player_id?: string
      stats?: Stats
      player?: { position?: string; fantasy_positions?: string[]; injury_status?: string | null }
    }
    if (!r?.player_id || !r.stats) continue
    const pos = r.player?.position ?? r.player?.fantasy_positions?.[0] ?? ''
    out.push({
      id: String(r.player_id),
      pos,
      stats: r.stats,
      injury: r.player?.injury_status ?? '',
    })
  }
  return out
}

export interface SeasonData {
  season: string
  weeks: { week: number; proj: Map<string, Row>; actual: Map<string, Row> }[]
  /** previous season's totals: id -> stats (for points per game) */
  prevTotals: Map<string, Stats>
}

async function loadSeason(
  f: Fetch,
  season: string,
  lastWeek: number,
  log: (m: string) => void,
): Promise<SeasonData> {
  const weeks: SeasonData['weeks'] = []
  for (let w = 1; w <= lastWeek; w++) {
    const [p, a] = await Promise.all([
      f(`${SLEEPER}/projections/nfl/${season}/${w}?season_type=regular`),
      f(`${SLEEPER}/stats/nfl/${season}/${w}?season_type=regular`),
    ])
    const proj = new Map(
      slimRows(p)
        .filter((r) => POSITIONS.includes(r.pos as Pos))
        .map((r) => [r.id, r]),
    )
    const actual = new Map(slimRows(a).map((r) => [r.id, r]))
    weeks.push({ week: w, proj, actual })
  }
  const prev = slimRows(await f(`${SLEEPER}/stats/nfl/${Number(season) - 1}?season_type=regular`))
  log(`season ${season}: ${weeks.length} weeks, ${prev.length} previous-season totals`)
  return { season, weeks, prevTotals: new Map(prev.map((r) => [r.id, r.stats])) }
}

/**
 * Build samples for one format, in time order. xFP weights for week w are fitted on games before w
 * (no look-ahead), and each player's last-3 window only uses games before w in the same season.
 */
export function buildSamples(
  seasons: SeasonData[],
  format: Format,
): { samples: Sample[]; xfpGames: { pos: string; stats: Stats; pts: number }[] } {
  const key = FORMAT_KEY[format]
  const samples: Sample[] = []
  const xfpGames: { pos: string; stats: Stats; pts: number }[] = []
  seasons.forEach((sd, si) => {
    const logs = new Map<string, { week: number; stats: Stats; pos: string }[]>()
    const posOf = new Map<string, string>()
    for (const { week, proj, actual } of sd.weeks) {
      const xfpCoef = fitXfp(xfpGames)
      const t = si * 100 + week
      for (const [id, pr] of proj) {
        posOf.set(id, pr.pos)
        const baseline = pr.stats[key] ?? 0
        if (baseline < MIN_BASELINE) continue
        const past = (logs.get(id) ?? []).slice(-3).reverse()
        const usage: GameUsage[] = past.map((g) =>
          gameUsage(g.week, g.stats, g.stats[key] ?? 0, xfpOf(pr.pos, g.stats, xfpCoef[pr.pos])),
        )
        const tot = sd.prevTotals.get(id)
        const gp = tot ? tot.gp || tot.gms_active || 0 : 0
        const prevPpg = tot && gp >= MIN_PREV_GAMES ? (tot[key] ?? 0) / gp : null
        const a = actual.get(id)
        samples.push({
          pos: pr.pos as Pos,
          week,
          t,
          f: features(baseline, usage, prevPpg),
          actual: played(a?.stats) ? (a!.stats[key] ?? 0) : 0,
          injury: pr.injury,
        })
      }
      // after the week: record games played for future windows and xFP fitting
      for (const [id, a] of actual) {
        if (!played(a.stats)) continue
        const pos = posOf.get(id) ?? a.pos
        if (!POSITIONS.includes(pos as Pos)) continue
        const list = logs.get(id) ?? []
        list.push({ week, stats: a.stats, pos })
        logs.set(id, list)
        xfpGames.push({ pos, stats: a.stats, pts: a.stats[key] ?? 0 })
      }
    }
  })
  return { samples, xfpGames }
}

function formatModel(
  samples: Sample[],
  preds: Prediction[],
  xfpGames: { pos: string; stats: Stats; pts: number }[],
): FormatModel {
  const fm: FormatModel = {
    xfp: fitXfp(xfpGames),
    positions: {},
    baselineQuantiles: {},
    baselineGrid: {},
  }
  for (const pos of POSITIONS) {
    const s = samples.filter((x) => x.pos === pos)
    const p = preds.filter((x) => x.pos === pos)
    if (s.length === 0) continue
    fm.positions[pos] = {
      coef: fitCoef(s),
      quantiles: residualQuantiles(p.map((x) => ({ proj: x.model, actual: x.actual }))),
      grid: residualGrid(p.map((x) => ({ proj: x.model, actual: x.actual }))),
      gate: gate(p),
    }
    fm.baselineQuantiles[pos] = residualQuantiles(
      p.map((x) => ({ proj: x.baseline, actual: x.actual })),
    )
    fm.baselineGrid![pos] = residualGrid(p.map((x) => ({ proj: x.baseline, actual: x.actual })))
  }
  return fm
}

const injuryBucket = (s: string) =>
  !s ? 'No designation' : s === 'Questionable' ? 'Questionable' : 'Other designation'

export interface BuildOptions {
  previousUrl?: string | null
}

export async function build(
  opts: BuildOptions = {},
  f: Fetch = defaultFetch,
  log: (m: string) => void = console.log,
): Promise<ModelFile> {
  const state = (await f(`${SLEEPER}/v1/state/nfl`)) as {
    season: string
    week: number
    season_type: string
  }
  const season = state.season
  const completed =
    state.season_type === 'regular'
      ? Math.max(0, Math.min(REGULAR_WEEKS, state.week - 1))
      : state.season_type === 'pre'
        ? 0
        : REGULAR_WEEKS
  const prevSeason = String(Number(season) - 1)
  log(`state: season ${season} (${state.season_type}), ${completed} completed weeks`)

  const seasons = [await loadSeason(f, prevSeason, REGULAR_WEEKS, log)]
  if (completed > 0) seasons.push(await loadSeason(f, season, completed, log))

  const file: ModelFile = {
    version: MODEL_VERSION,
    updated: new Date().toISOString(),
    trainedThrough: {
      season: completed > 0 ? season : prevSeason,
      week: completed > 0 ? completed : REGULAR_WEEKS,
    },
    seasons: seasons.map((s) => s.season),
    formats: {},
    accuracy: null,
    history: [],
    notes: [
      'Baseline: Sleeper weekly projections. Actuals: Sleeper weekly stats.',
      'Backtest: rolling origin from week 4 of the previous season; each week is predicted by a model fitted on earlier weeks only.',
      'Intervals: 10th-90th percentile of earlier out-of-sample errors, by position and projection tier (<8, 8-15, 15+).',
      `A position's correction is used only if it beats the baseline by ${2} standard errors in the backtest.`,
      'Players who did not play count as 0 (what a fantasy lineup scores).',
      'Not modeled: route participation and practice reports (not available from Sleeper), weather (no validated adjustment yet).',
    ],
  }

  for (const format of FORMATS) {
    const { samples, xfpGames } = buildSamples(seasons, format)
    const preds = backtest(samples, 4)
    file.formats[format] = formatModel(samples, preds, xfpGames)
    const g = Object.entries(file.formats[format]!.positions)
      .map(([p, m]) => `${p}:${m!.gate.enabled ? 'on' : 'off'}`)
      .join(' ')
    log(`${format}: ${samples.length} samples, ${preds.length} backtest predictions, gates ${g}`)
    if (format === 'ppr') {
      const cur = preds.filter((p) => p.t >= 100) // current-season weeks
      file.accuracy = {
        format,
        overall: metrics(preds),
        byPosition: Object.fromEntries(
          POSITIONS.map((pos) => [pos, metrics(preds.filter((p) => p.pos === pos))]).filter(
            ([, m]) => (m as { n: number }).n > 0,
          ),
        ),
        byWeek: [...new Set(cur.map((p) => p.week))]
          .sort((a, b) => a - b)
          .flatMap((week) =>
            POSITIONS.map((pos) => {
              const w = cur.filter((p) => p.week === week && p.pos === pos)
              const m = metrics(w)
              return { week, pos, n: m.n, maeBaseline: m.maeBaseline, maeModel: m.maeModel }
            }).filter((b) => b.n > 0),
          ),
        byInjury: ['No designation', 'Questionable', 'Other designation']
          .map((status) => ({
            status,
            metrics: metrics(preds.filter((p) => injuryBucket(p.injury) === status)),
          }))
          .filter((b) => b.metrics.n > 0),
        bySize: [0, 1, 2].map((t) => ({
          label:
            t === 0
              ? `Projected under ${TIERS[0]}`
              : t === 1
                ? `Projected ${TIERS[0]}-${TIERS[1]}`
                : `Projected ${TIERS[1]}+`,
          metrics: metrics(preds.filter((p) => tierOf(p.baseline) === t)),
        })),
      }
    }
  }

  if (opts.previousUrl) {
    try {
      const prev = (await f(opts.previousUrl)) as Partial<ModelFile>
      if (prev?.version && prev.updated) {
        const entry = {
          version: prev.version,
          updated: prev.updated,
          trainedThrough: prev.trainedThrough!,
          overall: prev.accuracy?.overall ?? null,
        }
        file.history = [entry, ...(prev.history ?? [])].slice(0, 52)
      }
    } catch (e) {
      log(`previous model unavailable: ${String(e)}`)
    }
  }
  return file
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }
  const out = arg('--out') ?? 'public/model.json'
  const file = await build({
    previousUrl: arg('--previous') ?? process.env.MODEL_PREVIOUS_URL ?? null,
  })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(file))
  console.log(`wrote ${out}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
