import { Bot } from 'lucide-react'

import { useFactSheet } from '../../hooks/useFactSheet'
import type { Ready } from '../../hooks/useLeagueData'
import { relTime } from '../../lib/format'
import { GmChat } from '../ai/GmChat'
import { CardLink } from '../dashboard/DashboardCard'
import { CARD } from '../dashboard/styles'
import { DASHBOARD_SEEDS } from './tabs'

/** The AI Fantasy GM, docked in the dashboard's right column (same chat as /ask). */
export function GmPanel({ data }: { data: Ready }) {
  const sheet = useFactSheet(data)
  const team = data.model.teamName(data.model.myRosterId)
  return (
    <section aria-label="AI Fantasy GM" className={`${CARD} flex min-w-0 flex-col p-5`}>
      <div className="mb-3 flex items-start gap-3">
        <span className="bg-accent-deep/20 text-accent grid size-10 shrink-0 place-items-center rounded-xl">
          <Bot size={21} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">AI Fantasy GM</h2>
          <p className="text-ink-3 text-sm">
            Your league-aware assistant for {team}.{' '}
            {sheet.asOf ? `Data as of ${relTime(sheet.asOf)}.` : 'Loading your league data…'}
          </p>
        </div>
        <CardLink to="/ask" className="shrink-0">
          Open
        </CardLink>
      </div>
      <div className="flex h-[30rem] min-h-0 flex-col">
        <GmChat data={data} sheet={sheet} compact seeds={DASHBOARD_SEEDS} />
      </div>
    </section>
  )
}
