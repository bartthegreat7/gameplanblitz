import { mean, meanSe, quantile, ridge } from './math.ts'

/*
 * GamePlanBlitz projection engine.
 *
 * Starts from the provider baseline (Sleeper's projection) and learns, per position, how much of
 * the baseline's error is predictable from three signals:
 *   f1  recency-weighted points over the last 3 games played (3:2:1) minus the baseline
 *   f2  recency-weighted expected points from usage (targets, carries, red-zone chances) minus the baseline
 *   f3  previous-season points per game minus the baseline (a stabilizer; 0 when under 4 games)
 * f1 and f2 are scaled by games/3, so a one-game sample counts for a third.
 * Coefficients come from ridge regression on past weeks only. Because the target is the
 * baseline's own error, anything the provider already priced in fits to ~0 (no double counting).
 * A position's correction is only switched on when a rolling backtest shows it beats the
 * baseline by at least two standard errors; otherwise the engine returns the baseline.
 */

export const MODEL_VERSION = 'gpb-1.0'
export type Format = 'ppr' | 'half' | 'std'
export const FORMAT_KEY: Record<Format, string> = {
  ppr: 'pts_ppr',
  half: 'pts_half_ppr',
  std: 'pts_std',
}
/** Nearest standard format to a league's points per reception. */
export const formatFor = (rec: number | undefined): Format =>
  (rec ?? 0) >= 0.75 ? 'ppr' : (rec ?? 0) >= 0.25 ? 'half' : 'std'

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const
export type Pos = (typeof POSITIONS)[number]

export type Stats = Record<string, number>
export const RECENCY_WEIGHTS = [3, 2, 1] as const
export const MIN_PREV_GAMES = 4
/** ridge prior, in pseudo-observations that show no effect */
export const RIDGE_PRIOR = 30
/** a correction is enabled only when it beats the baseline by this many standard errors */
export const GATE_T = 2
export const MIN_BASELINE = 1

/** Usage inputs to expected points, per position (Sleeper weekly stat keys). */
export const XFP_KEYS: Record<string, string[]> = {
  QB: ['pass_att', 'pass_rz_att', 'rush_att', 'rush_rz_att'],
  RB: ['rush_att', 'rush_rz_att', 'rec_tgt', 'rec_rz_tgt'],
  WR: ['rec_tgt', 'rec_rz_tgt', 'rush_att'],
  TE: ['rec_tgt', 'rec_rz_tgt'],
}

export const played = (s: Stats | undefined) => !!s && (s.gp || s.gms_active || 0) > 0

/** One played game, in one scoring format. */
export interface GameUsage {
  week: number
  pts: number
  xfp: number | null
  snapShare: number | null
  targets: number
  carries: number
  rzOpps: number
  tds: number
}

export function gameUsage(week: number, s: Stats, pts: number, xfp: number | null): GameUsage {
  return {
    week,
    pts,
    xfp,
    snapShare: s.off_snp > 0 && s.tm_off_snp > 0 ? s.off_snp / s.tm_off_snp : null,
    targets: s.rec_tgt ?? 0,
    carries: s.rush_att ?? 0,
    rzOpps: (s.rec_rz_tgt ?? 0) + (s.rush_rz_att ?? 0),
    tds: (s.rec_td ?? 0) + (s.rush_td ?? 0) + (s.pass_td ?? 0),
  }
}

/** Expected points from usage: Σ weight × count for the position's usage keys. */
export function xfpOf(
  pos: string,
  s: Stats,
  coef: Record<string, number> | undefined,
): number | null {
  const keys = XFP_KEYS[pos]
  if (!keys || !coef) return null
  return keys.reduce((a, k) => a + (coef[k] ?? 0) * (s[k] ?? 0), 0)
}

/** Recency-weighted mean of the newest-first values (3:2:1). */
export function recencyMean(newestFirst: number[]): number | null {
  const v = newestFirst.slice(0, RECENCY_WEIGHTS.length)
  if (v.length === 0) return null
  let num = 0
  let den = 0
  v.forEach((x, i) => {
    num += x * RECENCY_WEIGHTS[i]
    den += RECENCY_WEIGHTS[i]
  })
  return num / den
}

export interface Features {
  baseline: number
  /** recency-weighted points over the last 3 games played */
  recent: number | null
  recentXfp: number | null
  /** games behind `recent` (0-3) */
  games: number
  prevPpg: number | null
  /** f1, f2, f3 as fed to the model */
  x: [number, number, number]
}

export function features(
  baseline: number,
  last3NewestFirst: GameUsage[],
  prevPpg: number | null,
): Features {
  const g = last3NewestFirst.slice(0, 3)
  const recent = recencyMean(g.map((u) => u.pts))
  const xs = g.map((u) => u.xfp).filter((v): v is number => v !== null)
  const recentXfp = xs.length === g.length ? recencyMean(xs) : null
  const scale = g.length / 3
  return {
    baseline,
    recent,
    recentXfp,
    games: g.length,
    prevPpg,
    x: [
      recent === null ? 0 : (recent - baseline) * scale,
      recentXfp === null ? 0 : (recentXfp - baseline) * scale,
      prevPpg === null ? 0 : prevPpg - baseline,
    ],
  }
}

/* ---------------- fitting ---------------- */

export interface Sample {
  pos: Pos
  week: number
  /** season-week ordinal, for ordering across seasons */
  t: number
  f: Features
  actual: number
  /** Sleeper's injury designation on the projection, when given */
  injury: string
}

export interface Coef {
  /** [intercept, f1, f2, f3] */
  beta: [number, number, number, number]
  n: number
}

export function fitCoef(rows: Sample[]): Coef {
  if (rows.length < 30) return { beta: [0, 0, 0, 0], n: rows.length }
  const X = rows.map((r) => [1, ...r.f.x])
  const y = rows.map((r) => r.actual - r.f.baseline)
  const b = ridge(X, y, RIDGE_PRIOR, [0])
  return { beta: [b[0], b[1], b[2], b[3]], n: rows.length }
}

export function predict(f: Features, c: Coef | null): number {
  if (!c || f.baseline < MIN_BASELINE) return f.baseline
  const [b0, b1, b2, b3] = c.beta
  return Math.max(0, f.baseline + b0 + b1 * f.x[0] + b2 * f.x[1] + b3 * f.x[2])
}

/** Fit expected-points weights per position from played games (ridge, no intercept). */
export function fitXfp(
  games: { pos: string; stats: Stats; pts: number }[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const pos of Object.keys(XFP_KEYS)) {
    const keys = XFP_KEYS[pos]
    const rows = games.filter((g) => g.pos === pos)
    if (rows.length < 50) continue
    const w = ridge(
      rows.map((g) => keys.map((k) => g.stats[k] ?? 0)),
      rows.map((g) => g.pts),
      1,
    )
    out[pos] = Object.fromEntries(keys.map((k, i) => [k, w[i]]))
  }
  return out
}

/* ---------------- intervals ---------------- */

/** projection tiers for interval widths: errors grow with the projection */
export const TIERS = [8, 15] as const
export const tierOf = (proj: number) => (proj < TIERS[0] ? 0 : proj < TIERS[1] ? 1 : 2)
/** [p10, p50, p90] of (actual − projection), per tier */
export type Quantiles = [number, number, number][]

export function residualQuantiles(rows: { proj: number; actual: number }[]): Quantiles {
  return [0, 1, 2].map((t) => {
    const e = rows.filter((r) => tierOf(r.proj) === t).map((r) => r.actual - r.proj)
    return e.length >= 20 ? [quantile(e, 0.1), quantile(e, 0.5), quantile(e, 0.9)] : [0, 0, 0]
  })
}

/** 5th, 10th, ... 95th percentiles: the published error distribution, used for simulations */
export const QGRID = Array.from({ length: 19 }, (_, i) => (i + 1) / 20)
/** per tier: 19 error quantiles (actual - projection), or [] when the tier has too few games */
export type ErrorGrid = number[][]

export function residualGrid(rows: { proj: number; actual: number }[]): ErrorGrid {
  return [0, 1, 2].map((t) => {
    const e = rows.filter((r) => tierOf(r.proj) === t).map((r) => r.actual - r.proj)
    return e.length >= 40 ? QGRID.map((q) => quantile(e, q)) : []
  })
}

/** A 19-point grid from just [p10, p50, p90]: linear between them, tails held at p10/p90 (narrower, conservative). */
export function gridFromTriple(t: [number, number, number]): number[] {
  return QGRID.map((q) =>
    q <= 0.1
      ? t[0]
      : q <= 0.5
        ? t[0] + ((q - 0.1) / 0.4) * (t[1] - t[0])
        : q <= 0.9
          ? t[1] + ((q - 0.5) / 0.4) * (t[2] - t[1])
          : t[2],
  )
}

export interface Range {
  floor: number
  median: number
  ceiling: number
}

export function rangeFor(proj: number, q: Quantiles | undefined): Range | null {
  const t = q?.[tierOf(proj)]
  if (!t || (t[0] === 0 && t[2] === 0)) return null
  return {
    floor: Math.max(0, proj + t[0]),
    median: Math.max(0, proj + t[1]),
    ceiling: Math.max(0, proj + t[2]),
  }
}

/* ---------------- rolling backtest ---------------- */

export interface Prediction {
  pos: Pos
  week: number
  t: number
  baseline: number
  model: number
  actual: number
  injury: string
  /** 80% interval from residual quantiles fitted on earlier weeks only */
  lo: number | null
  hi: number | null
}

/**
 * Rolling-origin backtest: for each evaluation week, fit on strictly earlier weeks and predict
 * that week. No look-ahead.
 */
export function backtest(samples: Sample[], evalFrom: number): Prediction[] {
  const ts = [...new Set(samples.map((s) => s.t))]
    .sort((a, b) => a - b)
    .filter((t) => t >= evalFrom)
  const out: Prediction[] = []
  for (const t of ts) {
    const train = samples.filter((s) => s.t < t)
    const test = samples.filter((s) => s.t === t)
    for (const pos of POSITIONS) {
      const tr = train.filter((s) => s.pos === pos)
      const te = test.filter((s) => s.pos === pos)
      if (te.length === 0) continue
      const c = fitCoef(tr)
      // interval widths from earlier out-of-sample predictions only (falls back to none until there are enough)
      const q = residualQuantiles(
        out.filter((p) => p.pos === pos).map((p) => ({ proj: p.model, actual: p.actual })),
      )
      for (const s of te) {
        const m = predict(s.f, c)
        const r = rangeFor(m, q)
        out.push({
          pos,
          week: s.week,
          t,
          baseline: s.f.baseline,
          model: m,
          actual: s.actual,
          injury: s.injury,
          lo: r?.floor ?? null,
          hi: r?.ceiling ?? null,
        })
      }
    }
  }
  return out
}

export interface Metrics {
  n: number
  maeBaseline: number
  maeModel: number
  rmseBaseline: number
  rmseModel: number
  /** mean (projection − actual): positive = projections too high */
  biasBaseline: number
  biasModel: number
  /** share of actuals inside the 80% interval (target 0.8) */
  coverage: number | null
}

export function metrics(p: Prediction[]): Metrics {
  const eb = p.map((x) => x.baseline - x.actual)
  const em = p.map((x) => x.model - x.actual)
  const withI = p.filter((x) => x.lo !== null && x.hi !== null)
  return {
    n: p.length,
    maeBaseline: mean(eb.map(Math.abs)),
    maeModel: mean(em.map(Math.abs)),
    rmseBaseline: Math.sqrt(mean(eb.map((e) => e * e))),
    rmseModel: Math.sqrt(mean(em.map((e) => e * e))),
    biasBaseline: mean(eb),
    biasModel: mean(em),
    coverage: withI.length
      ? withI.filter((x) => x.actual >= x.lo! && x.actual <= x.hi!).length / withI.length
      : null,
  }
}

export interface Gate {
  enabled: boolean
  /** mean of (|model error| − |baseline error|); negative = model better */
  delta: number
  se: number
  n: number
  reason: string
}

/** Enable a position's correction only if the backtest improvement is at least GATE_T standard errors. */
export function gate(p: Prediction[]): Gate {
  const d = p.map((x) => Math.abs(x.model - x.actual) - Math.abs(x.baseline - x.actual))
  const { mean: m, se } = meanSe(d)
  if (p.length < 200)
    return {
      enabled: false,
      delta: m,
      se,
      n: p.length,
      reason: `Too few backtest games (${p.length}; need 200).`,
    }
  if (m < 0 && -m >= GATE_T * se)
    return {
      enabled: true,
      delta: m,
      se,
      n: p.length,
      reason: `Beats the baseline by ${(-m).toFixed(2)} pts per game (${(-m / se).toFixed(1)} standard errors).`,
    }
  return {
    enabled: false,
    delta: m,
    se,
    n: p.length,
    reason:
      m < 0
        ? `Improvement (${(-m).toFixed(2)} pts) is within noise (${(-m / se).toFixed(1)} SE; need ${GATE_T}).`
        : 'Does not beat the baseline in backtesting.',
  }
}

/* ---------------- published model file ---------------- */

export interface PositionModel {
  coef: Coef
  quantiles: Quantiles
  /** optional finer error distribution (newer model files) */
  grid?: ErrorGrid
  gate: Gate
}

export interface FormatModel {
  xfp: Record<string, Record<string, number>>
  positions: Partial<Record<Pos, PositionModel>>
  /** baseline intervals: residual quantiles of the baseline itself (used when the correction is off) */
  baselineQuantiles: Partial<Record<Pos, Quantiles>>
  baselineGrid?: Partial<Record<Pos, ErrorGrid>>
}

export interface Breakdown {
  week: number
  pos: Pos
  n: number
  maeBaseline: number
  maeModel: number
}

export interface ModelFile {
  version: typeof MODEL_VERSION
  updated: string
  /** last completed week in the training data */
  trainedThrough: { season: string; week: number }
  seasons: string[]
  formats: Partial<Record<Format, FormatModel>>
  /** backtest results for the PPR format (the published accuracy report) */
  accuracy: {
    format: Format
    overall: Metrics
    byPosition: Partial<Record<Pos, Metrics>>
    byWeek: Breakdown[]
    byInjury: { status: string; metrics: Metrics }[]
    bySize: { label: string; metrics: Metrics }[]
  } | null
  /** earlier published versions, newest first (kept so changes can be compared fairly) */
  history: {
    version: string
    updated: string
    trainedThrough: { season: string; week: number }
    overall: Metrics | null
  }[]
  notes: string[]
}

/* ---------------- the engine, for one player ---------------- */

export interface Projection {
  /** the projection to use: corrected when the position's correction is enabled, else the baseline */
  value: number
  baseline: number
  corrected: number | null
  enabled: boolean
  features: Features
  range: Range | null
  /** 19 outcome quantiles (5th..95th pct.) in points, for simulations; null without error data */
  dist: number[] | null
  /** each signal's contribution in points (0 when the correction is off) */
  contributions: { label: string; pts: number }[]
}

export function project(pos: string, f: Features, fm: FormatModel | undefined): Projection {
  const pm = fm?.positions[pos as Pos]
  const corrected = pm ? predict(f, pm.coef) : null
  const enabled = !!pm?.gate.enabled && corrected !== null
  const value = enabled ? corrected! : f.baseline
  const q = enabled ? pm!.quantiles : fm?.baselineQuantiles[pos as Pos]
  const tier = tierOf(value)
  const fine = (enabled ? pm?.grid : fm?.baselineGrid?.[pos as Pos])?.[tier]
  const triple = q?.[tier]
  const offsets =
    fine && fine.length === QGRID.length
      ? fine
      : triple && !(triple[0] === 0 && triple[2] === 0)
        ? gridFromTriple(triple)
        : null
  const [b0, b1, b2, b3] = pm?.coef.beta ?? [0, 0, 0, 0]
  const contributions =
    enabled && f.baseline >= MIN_BASELINE
      ? [
          { label: 'Baseline bias correction', pts: b0 },
          { label: 'Recent scoring (last 3)', pts: b1 * f.x[0] },
          { label: 'Recent usage (expected points)', pts: b2 * f.x[1] },
          { label: 'Previous season', pts: b3 * f.x[2] },
        ]
      : []
  return {
    value,
    baseline: f.baseline,
    corrected,
    enabled,
    features: f,
    range: rangeFor(value, q),
    dist: offsets ? offsets.map((o) => Math.max(0, value + o)) : null,
    contributions,
  }
}
