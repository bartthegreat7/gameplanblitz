import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* WCAG 2.x contrast audit of the theme tokens in index.css, for both themes. */

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

function tokens(selector: RegExp): Record<string, string> {
  const block = css.match(selector)?.[1] ?? ''
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}
const dark = tokens(/:root \{([^}]*)\}/)
const light = { ...dark, ...tokens(/:root\[data-theme='light'\] \{([^}]*)\}/) }

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** [text token, background token] pairs the UI actually renders. */
const PAIRS: [string, string][] = [
  ['ink', 'bg'], ['ink', 'card'], ['ink', 'panel'],
  ['ink-2', 'card'], ['ink-2', 'panel'], ['ink-2', 'bg'],
  ['ink-3', 'card'], ['ink-3', 'panel'], ['ink-3', 'bg'],
  ['accent', 'card'], ['accent', 'panel'], ['accent', 'bg'],
  ['accent-ink', 'accent'], ['bad-ink', 'bad'], ['logo-ink', 'logo-to'],
  ['good', 'card'], ['good', 'panel'], ['bad', 'card'], ['bad', 'panel'],
  ['ink', 'sidebar'], ['ink-2', 'sidebar'], ['ink-3', 'sidebar'], ['accent', 'sidebar'],
  ['ink', 'raised'], ['ink-2', 'raised'], ['ink-3', 'raised'], ['accent', 'raised'], ['ink-2', 'active'], ['select-ink', 'select'], ['ink-3', 'card-2'], ['ink-2', 'card-2'], ['ink-2', 'card-2'], ['ink-3', 'card-2'], ['accent', 'card-2'], ['accent', 'active'], ['ink', 'active'],
  ['purple', 'card'], ['ink', 'plan-from'], ['ink', 'plan-to'], ['ink-2', 'plan-from'], ['ink-2', 'plan-to'], ['accent', 'plan-from'],
  ['amber', 'card'], ['amber', 'panel'], ['coral', 'card'], ['blue', 'card'], ['blue', 'panel'],
]

describe.each([
  ['dark', dark],
  ['light', light],
])('%s theme contrast (WCAG AA 4.5:1)', (_name, t) => {
  it.each(PAIRS)('%s on %s', (fg, bg) => {
    expect(t[fg], `token --${fg}`).toBeDefined()
    expect(t[bg], `token --${bg}`).toBeDefined()
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
  })
})
