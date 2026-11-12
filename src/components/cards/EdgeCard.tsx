import { TrendingUp } from 'lucide-react'

import { f1 } from '../../lib/format'
import { edge } from '../../lib/insights'
import { PlayerAvatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { Pill } from '../ui/Pill'
import { EmptyState, Notice } from '../ui/states'
import { ProjNotice, type CardProps } from './shared'

export function EdgeCard({ data }: CardProps) {
  const { model, matchups, week, flags } = data
  const e = edge(model, matchups)

  if (!e)
    return (
      <Card id="edge" title="The Edge" icon={TrendingUp} tone="orange">
        <EmptyState>No lineup to compare against waivers yet.</EmptyState>
      </Card>
    )

  return (
    <Card id="edge" title="The Edge" context={`Your lineup vs waivers · Week ${week}`} icon={TrendingUp} tone="orange">
      <ProjNotice data={data} />
      <div className="border-coral/30 bg-panel flex items-start justify-between gap-4 rounded-2xl border p-5">
        <div>
          <div className={`text-5xl leading-[0.9] font-extrabold tracking-tight ${e.upgradePts < 0.1 ? 'text-amber' : 'text-coral'}`}>
            {f1(e.upgradePts)}
          </div>
          <div className="text-ink-2 mt-2 max-w-56 text-sm">projected points sitting on waivers for you</div>
        </div>
        <div className="text-ink-2 min-w-24 text-right text-sm">
          <b className="text-mint">{e.upgrades.length}</b> upgrade{e.upgrades.length !== 1 && 's'}
          <br />
          <b className="text-coral">{e.busts.length}</b> bust risk{e.busts.length !== 1 && 's'}
        </div>
      </div>

      {e.upgrades.length > 0 ? (
        <>
          <h3 className="text-mint mt-4 mb-2.5 text-base font-extrabold">Upgrades available</h3>
          <ul>
            {e.upgrades.slice(0, 4).map((u) => (
              <li key={u.to} className="border-mint mb-3.5 flex gap-3.5 border-l-4 pl-4">
                <PlayerAvatar player={model.players[u.to]} className="size-12" />
                <div className="min-w-0">
                  <div className="mb-1 text-lg font-bold">
                    {model.shortName(u.to)}
                    <span className="text-mint ml-1.5">+{f1(u.gain)}</span>
                  </div>
                  <Pill tone="prio">free agent</Pill>
                  <div className="text-ink-3 mt-1.5 text-sm">
                    Projects higher than {model.shortName(u.from)} ({f1(model.projPts(u.from))}) in your lineup this week.
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-4">
          <Notice tone="ok">No free agent beats a starter by a point or more right now. Your lineup is the best available.</Notice>
        </div>
      )}

      {e.busts.length > 0 && (
        <>
          <h3 className="text-coral mt-4 mb-2.5 text-base font-extrabold">Bust watch</h3>
          <ul>
            {e.busts.slice(0, 4).map((b) => (
              <li key={b.id} className="border-bad mb-3.5 flex gap-3.5 border-l-4 pl-4">
                <PlayerAvatar player={model.players[b.id]} className="size-12" />
                <div className="min-w-0">
                  <div className="mb-1 text-lg font-bold">
                    {model.shortName(b.id)}
                    <span className="text-ink-2 ml-1.5">{f1(b.pj)}</span>
                  </div>
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {b.tags.map((t, i) => (
                      <Pill key={i} tone={t.tone === 'warn' ? 'warn' : 'caution'}>
                        {t.text}
                      </Pill>
                    ))}
                  </div>
                  <div className="text-ink-3 text-sm">{b.note}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {flags.statsMissing && <Notice>Season averages weren't available from Sleeper, so bust calls use injuries and matchups only.</Notice>}
    </Card>
  )
}
