import { useMemo, useState } from 'react'

import { LeagueGate } from '../components/LeagueGate'
import { Analyzer } from '../components/trades/Analyzer'
import { TradeCard } from '../components/trades/TradeBody'
import { ProjNotice } from '../components/cards/shared'
import { Segmented } from '../components/ui/Segmented'
import { EmptyState, ListSkeleton, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { HORIZON_WEEKS } from '../hooks/useProjectionHorizon'
import { useTradeInputs } from '../hooks/useTradeInputs'
import { findTrades, MIN_FAIRNESS, TRADE_CONFIDENCE_RUBRIC, type TradeInput } from '../lib/analytics/trades'

type Tab = 'finder' | 'analyzer'

function TradesView({ data }: { data: Ready }) {
  const { model, league, season, week } = data
  const t = useTradeInputs(league, season, week, model)
  const [tab, setTab] = useState<Tab>('finder')

  const ready = !!t.values && t.horizon.length > 0 && t.horizon[0].proj.size > 0
  const input = useMemo<TradeInput | null>(
    () =>
      ready
        ? { model, league, horizon: t.horizon, schedule: t.schedule, values: new Map([...t.values!].map(([id, v]) => [id, v.value])), picks: t.picks, scale: t.scale }
        : null,
    [ready, model, league, t.horizon, t.schedule, t.values, t.picks, t.scale],
  )
  const finder = useMemo(() => (input ? findTrades(input) : null), [input])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Trade War Room</h1>
      <p className="text-ink-3 mb-4 text-sm">
        Every trade is judged two ways: market value on FantasyCalc's {t.scale} scale, and what it does to each team's best lineup over the next {HORIZON_WEEKS} weeks of Sleeper projections.
      </p>

      <ProjNotice data={data} />
      {t.valuesFailed && <Notice>FantasyCalc values couldn't be loaded, so trades can't be priced right now. Use Refresh to retry.</Notice>}
      {t.scheduleFailed && <Notice>The NFL schedule couldn't be loaded, so bye weeks aren't accounted for.</Notice>}
      {t.scale === 'dynasty' && t.picksFailed && <Notice>Traded draft picks couldn't be loaded, so picks are left out.</Notice>}
      {t.scale === 'dynasty' && (
        <Notice tone="ok">Dynasty league: players and picks are priced on FantasyCalc's dynasty scale so they can be compared.</Notice>
      )}

      <Segmented
        label="Trade tools"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'finder', label: 'Trade finder' },
          { value: 'analyzer', label: 'Analyze a trade' },
        ]}
      />

      {!input ? (
        t.valuesLoading || t.horizonLoading ? (
          <ListSkeleton rows={4} />
        ) : (
          <EmptyState>
            {t.valuesFailed ? 'Trade values are unavailable right now.' : `Sleeper hasn't published Week ${week} projections yet, so lineup impact can't be measured.`}
          </EmptyState>
        )
      ) : tab === 'analyzer' ? (
        <Analyzer input={input} />
      ) : (
        finder && (
          <>
            <h2 className="mb-1 text-lg font-extrabold">Win-win trades</h2>
            <p className="text-ink-3 mb-3 text-sm">
              1-for-1 swaps that are at least {Math.round(MIN_FAIRNESS * 100)}% fair on value and improve both lineups. Designated keepers are never suggested. Each deal is judged on its own, so several may use the same player of yours.
            </p>
            {finder.mutual.length === 0 ? (
              <EmptyState>No fair 1-for-1 swap improves both lineups right now. Try the analyzer for multi-player deals.</EmptyState>
            ) : (
              <ul className="grid gap-3">
                {finder.mutual.map((e) => (
                  <TradeCard key={`${e.give.players[0]}-${e.get.players[0]}`} model={model} e={e} values={input!.values} />
                ))}
              </ul>
            )}

            {finder.oneSided.length > 0 && (
              <>
                <h2 className="mt-8 mb-1 text-lg font-extrabold">Fair, but may need a sweetener</h2>
                <p className="text-ink-3 mb-3 text-sm">Fair on value and good for you, but the other lineup doesn't improve. They may want something extra.</p>
                <ul className="grid gap-3">
                  {finder.oneSided.map((e) => (
                    <TradeCard key={`${e.give.players[0]}-${e.get.players[0]}`} model={model} e={e} values={input!.values} />
                  ))}
                </ul>
              </>
            )}
            <p className="text-ink-3 mt-3 text-xs">{finder.evaluated} fair player pairs checked across the league.</p>
          </>
        )
      )}

      <details className="border-line bg-card mt-6 rounded-2xl border p-4 text-sm">
        <summary className="cursor-pointer font-bold">How trades are judged</summary>
        <ul className="text-ink-2 mt-3 list-disc space-y-1.5 pl-5">
          <li><b>Lineup impact:</b> each team's best lineup after the trade minus before, for each of the next {HORIZON_WEEKS} weeks, from Sleeper projections in your league's scoring. Out players count zero this week; IR/PUP/suspended players count zero throughout; byes count zero.</li>
          <li><b>Market value:</b> FantasyCalc values, summed per side. Fairness = 1 − |difference| ÷ larger side. Summing ignores the premium the market pays to consolidate into one star.</li>
          <li><b>Draft picks</b> are only offered in dynasty leagues, where FantasyCalc prices them (rounds 1–4 of upcoming drafts) on the same scale as players.</li>
          <li><b>Acceptance</b> is an estimate from value and lineup fit, never a prediction of what the other manager will do.</li>
          <li><b>Keepers:</b> designated keepers are never suggested and are flagged in the analyzer. Keeper costs aren't tracked yet.</li>
          <li><b>Confidence:</b>
            <ul className="mt-1 list-[circle] space-y-0.5 pl-5">
              {TRADE_CONFIDENCE_RUBRIC.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </li>
        </ul>
      </details>
    </div>
  )
}

export default function Trades() {
  return <LeagueGate>{(data) => <TradesView data={data} />}</LeagueGate>
}
