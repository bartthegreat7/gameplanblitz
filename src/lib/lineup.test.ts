import { lineupTotal, optimalLineup, startSlotsOf } from './lineup'

const POS: Record<string, string> = { q1: 'QB', q2: 'QB', r1: 'RB', r2: 'RB', r3: 'RB', w1: 'WR', t1: 'TE' }
const PJ: Record<string, number> = { q1: 20, q2: 19, r1: 15, r2: 12, r3: 11, w1: 18, t1: 7 }
const posOf = (id: string) => POS[id] ?? ''
const projOf = (id: string) => PJ[id] ?? 0

const picks = (line: ReturnType<typeof optimalLineup>) => line.map((s) => s.pick?.id ?? null)

describe('optimalLineup', () => {
  it('fills strict slots first, then flex with the best remaining eligible player', () => {
    const line = optimalLineup(['q1', 'r1', 'r2', 'r3', 'w1'], ['QB', 'RB', 'RB', 'FLEX'], posOf, projOf)
    expect(picks(line)).toEqual(['q1', 'r1', 'r2', 'w1']) // FLEX takes WR 18 over RB 11
    expect(lineupTotal(line)).toBe(65)
  })

  it('does not let a flex slot steal a player a strict slot needs', () => {
    // FLEX listed first, but RB slot must still get the top RB
    const line = optimalLineup(['r1', 'r2'], ['FLEX', 'RB'], posOf, projOf)
    expect(line.find((s) => s.slot === 'RB')?.pick?.id).toBe('r1')
    expect(line.find((s) => s.slot === 'FLEX')?.pick?.id).toBe('r2')
  })

  it('lets SUPER_FLEX take a second QB', () => {
    const line = optimalLineup(['q1', 'q2', 'r1'], ['QB', 'SUPER_FLEX'], posOf, projOf)
    expect(picks(line)).toEqual(['q1', 'q2'])
  })

  it('leaves a slot empty when nobody is eligible and never reuses a player', () => {
    const line = optimalLineup(['r1'], ['RB', 'RB', 'TE'], posOf, projOf)
    expect(picks(line)).toEqual(['r1', null, null])
  })

  it('ignores empty-slot placeholders ("0")', () => {
    const line = optimalLineup(['0', 'r1'], ['RB'], posOf, projOf)
    expect(picks(line)).toEqual(['r1'])
  })
})

describe('startSlotsOf', () => {
  it('drops bench, IR and taxi slots', () => {
    expect(startSlotsOf(['QB', 'RB', 'FLEX', 'BN', 'BN', 'IR', 'TAXI'])).toEqual(['QB', 'RB', 'FLEX'])
  })
})
