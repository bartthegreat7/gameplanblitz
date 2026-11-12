/* Small, dependency-free numerics for the projection engine. */

/** Solve A x = b by Gaussian elimination with partial pivoting; zeros if the system is singular. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return new Array(n).fill(0)
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/**
 * Ridge regression. The penalty on feature j is `prior × mean(x_j²)`: shrinkage equal to `prior`
 * extra observations that show no effect, so small samples shrink harder and units don't matter.
 * Columns listed in `free` (e.g. an intercept) are not penalized.
 */
export function ridge(X: number[][], y: number[], prior: number, free: number[] = []): number[] {
  const k = X[0]?.length ?? 0
  if (k === 0 || X.length === 0) return new Array(k).fill(0)
  const A = Array.from({ length: k }, () => new Array(k).fill(0))
  const b = new Array(k).fill(0)
  const sq = new Array(k).fill(0)
  for (let i = 0; i < X.length; i++) {
    const x = X[i]
    for (let a = 0; a < k; a++) {
      b[a] += x[a] * y[i]
      sq[a] += x[a] * x[a]
      for (let c = 0; c < k; c++) A[a][c] += x[a] * x[c]
    }
  }
  for (let a = 0; a < k; a++) if (!free.includes(a)) A[a][a] += prior * (sq[a] / X.length || 1)
  return solve(A, b)
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Linear-interpolated quantile (q in 0..1) of an unsorted list. */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** Mean and standard error of a sample. */
export function meanSe(xs: number[]): { mean: number; se: number } {
  const m = mean(xs)
  if (xs.length < 2) return { mean: m, se: Infinity }
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)
  return { mean: m, se: Math.sqrt(v / xs.length) }
}
