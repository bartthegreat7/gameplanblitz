/* Fantasy GM Academy curriculum: short, practical lessons. Each ends with a tool where you can
   practice on your own league. General strategy guidance, not predictions. */

export interface Lesson {
  id: string
  title: string
  summary: string
  principles: string[]
  practice: { label: string; to: string }
}

export const LESSONS: Lesson[] = [
  {
    id: 'process',
    title: 'Judge decisions by process, not points',
    summary: 'A good decision can lose and a bad one can win. Review what you knew before kickoff.',
    principles: [
      'Write down why you made a call before the games, then compare with what happened.',
      'One week is mostly noise: a player can score 5 or 25 on the same projection.',
      'Repeated gaps between your lineup and the best projected lineup are the habit worth fixing.',
    ],
    practice: { label: 'Review your weekly decisions below', to: '/academy' },
  },
  {
    id: 'startsit',
    title: 'Start/sit: projections, ranges and your matchup',
    summary: 'Start the higher projection by default; let the range break close calls.',
    principles: [
      'Differences under about a point are coin flips; do not overthink them.',
      'If you are a big favorite, prefer the steadier player (higher floor).',
      'If you are a big underdog, a higher ceiling gives you more paths to an upset.',
      'Check designations and game dates before lock: a Questionable tag is not an Out.',
    ],
    practice: { label: 'Open the Start/Sit Simulator', to: '/startsit' },
  },
  {
    id: 'waivers',
    title: 'Waiver wire: value over the next few weeks',
    summary: 'Add players for the weeks ahead, not for last week’s box score.',
    principles: [
      'Rising snaps, targets and touches tend to lead points; a single big game often does not.',
      'Drop the player whose role is shrinking, not the one with the bad week.',
      'In FAAB leagues, bid for the size of the upgrade and the weeks left, not the headline.',
    ],
    practice: { label: 'Open the Waiver Sniper', to: '/waivers' },
  },
  {
    id: 'trades',
    title: 'Trades: fair value and fit',
    summary: 'The best trades are fair on value and help both lineups.',
    principles: [
      'Trade from depth you cannot start for a starter you need.',
      'Two-for-one deals favor the side getting the best player: account for the open roster spot.',
      'You cannot know another manager’s intentions; offer deals that make sense for their roster too.',
    ],
    practice: { label: 'Open the Trade War Room', to: '/trades' },
  },
  {
    id: 'keepers',
    title: 'Keepers: cost versus market value',
    summary: 'Keep players whose cost is well below where they would go in the draft.',
    principles: [
      'A keeper is worth the rounds saved, not just how good the player is.',
      'Young players with growing roles hold value longer.',
      'Check your league’s keeper rules; Sleeper does not store keeper costs.',
    ],
    practice: { label: 'Open Keeper Tools', to: '/keepers' },
  },
  {
    id: 'draft',
    title: 'Draft preparation',
    summary: 'Draft for your league’s scoring and starting slots.',
    principles: [
      'Know your scoring: points per reception and superflex change player values a lot.',
      'Wait on positions with deep replacement value; secure scarce ones.',
      'Leave room on the bench for upside picks you can drop early.',
    ],
    practice: { label: 'See player values', to: '/players' },
  },
  {
    id: 'playoffs',
    title: 'Playoff strategy',
    summary: 'Plan for the weeks that decide your season.',
    principles: [
      'Check bye weeks and schedules for the playoff weeks before the trade deadline.',
      'Once you are safely in, trade depth for a stronger starting lineup.',
      'Know your remaining strength of schedule; the playoff race is a simulation, not a promise.',
    ],
    practice: { label: 'Open the Playoff Simulator', to: '/playoffs' },
  },
  {
    id: 'risk',
    title: 'Risk management',
    summary: 'Spread your exposure and keep a plan B.',
    principles: [
      'Avoid stacking several starters on one bye week.',
      'Keep a playable backup for injury-prone starters and Questionable players with late games.',
      'Weather matters only at the extremes (strong wind, heavy precipitation).',
    ],
    practice: { label: 'Try a scenario in the What-If Simulator', to: '/simulate' },
  },
]
