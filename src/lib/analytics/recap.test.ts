import { awardText, leagueRecapText, resultLine } from './recap'

const name = (id: number) => ({ 1: 'Ants', 2: 'Bears', 3: 'Cats' })[id] ?? '?'
const pname = (id: string) => (id === 'p' ? 'Pat Player' : id)

describe('recap text', () => {
  it('writes results, ties and close finishes', () => {
    expect(resultLine({ a: { rosterId: 1, points: 98.2 }, b: { rosterId: 2, points: 120.4 } }, name)).toBe('Bears 120.4 def. Ants 98.2 (by 22.2)')
    expect(resultLine({ a: { rosterId: 1, points: 100.4 }, b: { rosterId: 2, points: 100 } }, name)).toBe('Ants 100.4 def. Bears 100.0 (by 0.40)')
    expect(resultLine({ a: { rosterId: 1, points: 90 }, b: { rosterId: 2, points: 90 } }, name)).toBe('Ants and Bears tied at 90.0')
  })

  it('describes awards and assembles a shareable recap with labeled power rankings', () => {
    expect(awardText({ id: 'bench', title: '', rosterId: 3, otherId: null, value: 31, playerId: 'p' }, name, pname)).toBe(
      "Best bench performance: Pat Player scored 31.0 on Cats's bench",
    )
    const text = leagueRecapText({
      leagueName: 'Test League',
      week: 5,
      final: true,
      games: [{ a: { rosterId: 1, points: 98.2 }, b: { rosterId: 2, points: 120.4 } }],
      name,
      playerName: pname,
      awards: [{ id: 'high', title: '', rosterId: 2, otherId: null, value: 120.4 }],
      stories: [{ id: 's', text: 'Bears has won 3 straight.', rosterIds: [2] }],
      power: [
        { rosterId: 2, rank: 1, score: 80, allPlayPct: 0.8, pointsPerGame: 110, strength: null },
        { rosterId: 1, rank: 2, score: 40, allPlayPct: 0.4, pointsPerGame: 95, strength: null },
      ],
      change: new Map([[2, 1], [1, -1]]),
    })
    expect(text.split('\n')).toEqual([
      'Around the League · Test League · Week 5',
      '',
      'Bears 120.4 def. Ants 98.2 (by 22.2)',
      '',
      'Weekly awards',
      '• Highest score: Bears with 120.4',
      '',
      'Storylines',
      '• Bears has won 3 straight.',
      '',
      'Power rankings (GamePlanBitz model, not the official standings)',
      '1. Bears (up 1)',
      '2. Ants (down 1)',
      '',
      'Scores from Sleeper · recap by GamePlanBitz',
    ])
  })
})
