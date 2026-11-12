/** Which player positions can fill each Sleeper roster slot. */
export const SLOT_ELIG: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  WRRB_WRT: ['WR', 'RB', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
}

export const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI'])
/** Injury designations that mean the player will not play. */
export const OUT_INJ = new Set(['Out', 'IR', 'PUP', 'Sus', 'NA', 'DNR', 'COV'])
/** Positions we model as startable for waivers/trades/edge. */
export const STARTABLE = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
/** Positions tradeable in the Trade Machine (flex positions + QB/K/DEF). */
export const TRADEABLE = new Set([...SLOT_ELIG.FLEX, 'QB', 'K', 'DEF'])

export const startSlotsOf = (rosterPositions: string[]) => rosterPositions.filter((p) => !BENCH_SLOTS.has(p))

export interface LineupPick {
  id: string
  pos: string
  pj: number
}
export interface LineupSlot {
  slot: string
  pick: LineupPick | null
}

/**
 * Greedy optimal lineup: slots with the fewest eligible positions fill first (so strict slots
 * beat flex slots), each taking the highest-projected remaining eligible player.
 */
export function optimalLineup(
  playerIds: string[],
  startSlots: string[],
  posOf: (id: string) => string,
  projOf: (id: string) => number,
): LineupSlot[] {
  const avail: LineupPick[] = playerIds
    .filter((p) => p && p !== '0')
    .map((id) => ({ id, pos: posOf(id), pj: projOf(id) }))
    .sort((a, b) => b.pj - a.pj)

  const slots = startSlots.map((slot) => ({
    slot,
    elig: SLOT_ELIG[slot] ?? [slot],
    pick: null as LineupPick | null,
  }))
  const order = slots.map((s, i) => ({ i, span: s.elig.length })).sort((a, b) => a.span - b.span)

  const used = new Set<string>()
  for (const { i } of order) {
    const s = slots[i]
    for (const pl of avail) {
      if (used.has(pl.id)) continue
      if (s.elig.includes(pl.pos)) {
        s.pick = pl
        used.add(pl.id)
        break
      }
    }
  }
  return slots.map(({ slot, pick }) => ({ slot, pick }))
}

export const lineupTotal = (line: LineupSlot[]) => line.reduce((t, s) => t + (s.pick ? s.pick.pj : 0), 0)

export const flexLabel = (s: string) =>
  s === 'SUPER_FLEX' ? 'SFLX' : s === 'WRRB_FLEX' || s === 'WRRB_WRT' ? 'FLEX' : s
