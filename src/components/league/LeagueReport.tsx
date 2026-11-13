import { Award as AwardIcon, Check, Copy, Download, ListOrdered, Share2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'

import type { Award, PowerRow, Story, weekAwards } from '../../lib/analytics/league'
import type { TeamOdds } from '../../lib/analytics/playoffs'
import { awardText, leagueRecapText } from '../../lib/analytics/recap'
import type { BoardGame } from '../../lib/analytics/scoreboard'
import { f1 } from '../../lib/format'
import { standings } from '../../lib/insights'
import type { Model } from '../../lib/model'
import { CARD } from '../dashboard/styles'
import { TeamAvatar } from '../ui/Avatar'
import { EmptyState } from '../ui/states'

const pct = (x: number) => (x >= 99.5 ? '>99%' : x > 0 && x < 1 ? '<1%' : `${Math.round(x)}%`)

export function AwardsPanel({ m, awards, week }: { m: Model; awards: ReturnType<typeof weekAwards> | null; week: number }) {
  return (
    <section aria-label="Weekly awards" className={`${CARD} p-4 sm:p-5`}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        <AwardIcon size={20} aria-hidden className="text-amber" /> Week {week} Awards
      </h2>
      {!awards || awards.awards.length === 0 ? (
        <EmptyState>Awards appear once Week {week} has final scores.</EmptyState>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {awards.awards.map((a) => (
              <li key={a.id} className="border-line/70 bg-card-2/60 flex items-center gap-3 rounded-xl border p-3">
                <TeamAvatar user={m.ownerOf(a.rosterId)} className="size-9 shrink-0 text-xs" />
                <div className="min-w-0">
                  <div className="text-amber text-[11px] font-extrabold tracking-wider uppercase">
                    {a.title}
                    {a.model && <span className="text-ink-3"> · model</span>}
                  </div>
                  <div className="text-sm">{awardText(a, m.teamName, m.name).replace(/^[^:]+: /, '')}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-ink-3 mt-2 text-xs">
            Not awarded: {awards.unavailable.map((u) => `${u.title} (${u.reason})`).join('; ')}.
          </p>
        </>
      )}
    </section>
  )
}

export function StoriesPanel({ stories, week }: { stories: Story[]; week: number }) {
  return (
    <section aria-label="Storylines" className={`${CARD} p-4 sm:p-5`}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        <Sparkles size={20} aria-hidden className="text-accent" /> Week {week} Storylines
      </h2>
      {stories.length === 0 ? (
        <EmptyState>No standout storylines in Week {week}: no upset of the leader, no sub-point finish, no streaks of 3+.</EmptyState>
      ) : (
        <ul className="grid gap-1.5 text-sm">
          {stories.map((s) => (
            <li key={s.id} className="flex gap-2">
              <span aria-hidden className="text-accent">•</span>
              {s.text}
            </li>
          ))}
        </ul>
      )}
      <p className="text-ink-3 mt-2 text-xs">From Sleeper scores and records only.</p>
    </section>
  )
}

export function RankingsPanel({ m, power, change, through }: { m: Model; power: PowerRow[]; change: Map<number, number>; through: number }) {
  const official = standings(m)
  return (
    <section aria-label="Standings and power rankings" className={`${CARD} grid gap-4 p-4 sm:p-5 md:grid-cols-2`}>
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
          <ListOrdered size={20} aria-hidden className="text-accent" /> Official standings
        </h2>
        <p className="text-ink-3 mb-2 text-xs">Sleeper&apos;s records, as of now</p>
        <ol className="grid gap-1 text-sm">
          {official.map((r, i) => (
            <li key={r.rosterId} className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${r.me ? 'bg-active/60 font-bold' : ''}`}>
              <span className="truncate">
                <span className="text-ink-3 mr-2 inline-block w-4 text-xs">{i + 1}</span>
                {m.teamName(r.rosterId)}
              </span>
              <span className="tabular-nums">
                {r.w}-{r.l}
                {r.t ? `-${r.t}` : ''} · {f1(r.pf)}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
          <TrendingUp size={20} aria-hidden className="text-good" /> Power rankings
        </h2>
        <p className="text-ink-3 mb-2 text-xs">
          GamePlanBitz model through Week {through}: 50% all-play record, 30% points per game, 20% this week&apos;s projected best lineup
        </p>
        {power.length === 0 ? (
          <EmptyState>Power rankings start after Week 1.</EmptyState>
        ) : (
          <ol className="grid gap-1 text-sm">
            {power.map((r) => {
              const c = change.get(r.rosterId) ?? 0
              return (
                <li key={r.rosterId} className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${r.rosterId === m.myRosterId ? 'bg-active/60 font-bold' : ''}`}>
                  <span className="truncate">
                    <span className="text-ink-3 mr-2 inline-block w-4 text-xs">{r.rank}</span>
                    {m.teamName(r.rosterId)}
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {c !== 0 && (
                      <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${c > 0 ? 'text-good' : 'text-bad'}`}>
                        {c > 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
                        <span className="sr-only">{c > 0 ? 'up' : 'down'}</span>
                        {Math.abs(c)}
                      </span>
                    )}
                    <span className="text-ink-2 text-xs">{Math.round(r.allPlayPct * 100)}% all-play</span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

export function RacePanel({ m, odds, games }: { m: Model; odds: TeamOdds[] | null; games: BoardGame[] }) {
  if (!odds) return null
  const by = new Map(odds.map((o) => [o.rosterId, o]))
  const bubble = (id: number) => {
    const p = by.get(id)?.playoffPct ?? 0
    return p >= 5 && p <= 95
  }
  const key = games.filter((g) => g.b && bubble(g.a.rosterId) && bubble(g.b.rosterId) && g.status !== 'final')
  const fading = odds.filter((o) => o.playoffPct > 0 && o.playoffPct < 10)
  return (
    <section aria-label="Playoff race" className={`${CARD} grid gap-3 p-4 sm:p-5`}>
      <h2 className="text-lg font-extrabold">Playoff race</h2>
      <p className="text-ink-3 -mt-2 text-xs">Seeded simulation of the remaining schedule (model, not a guarantee)</p>
      <ol className="grid gap-1 text-sm sm:grid-cols-2">
        {[...odds].sort((a, b) => b.playoffPct - a.playoffPct).map((o) => (
          <li key={o.rosterId} className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${o.rosterId === m.myRosterId ? 'bg-active/60 font-bold' : ''}`}>
            <span className="truncate">{m.teamName(o.rosterId)}</span>
            <span className="tabular-nums">{pct(o.playoffPct)}</span>
          </li>
        ))}
      </ol>
      {key.length > 0 && (
        <p className="text-sm">
          <b>Matchups with playoff stakes:</b> {key.map((g) => `${m.teamName(g.a.rosterId)} vs ${m.teamName(g.b!.rosterId)}`).join('; ')}.
        </p>
      )}
      {fading.length > 0 && (
        <p className="text-sm">
          <b>Approaching elimination:</b> {fading.map((o) => `${m.teamName(o.rosterId)} (${pct(o.playoffPct)})`).join(', ')}.
        </p>
      )}
    </section>
  )
}

/** Draws the recap as a shareable image (no external services): returns a PNG blob. */
async function recapImage(title: string, lines: string[]): Promise<Blob | null> {
  const css = getComputedStyle(document.documentElement)
  const v = (k: string) => css.getPropertyValue(k).trim() || '#000'
  const W = 1080
  const H = 140 + lines.length * 40 + 60
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = v('--bg')
  g.fillRect(0, 0, W, H)
  g.fillStyle = v('--accent')
  g.font = '800 44px system-ui, sans-serif'
  g.fillText(title, 56, 90)
  g.font = '500 28px system-ui, sans-serif'
  lines.forEach((l, i) => {
    g.fillStyle = l.startsWith('•') || /^\d+\./.test(l) ? v('--ink-2') : v('--ink')
    g.fillText(l.length > 70 ? `${l.slice(0, 69)}…` : l, 56, 150 + i * 40)
  })
  g.fillStyle = v('--ink-3')
  g.font = '500 22px system-ui, sans-serif'
  g.fillText('Scores from Sleeper · GamePlanBitz', 56, H - 30)
  return new Promise((r) => c.toBlob((b) => r(b), 'image/png'))
}

/** Copy, share or save the recap. Nothing leaves this browser unless you do one of these. */
export function SharePanel({
  m,
  leagueName,
  week,
  final,
  games,
  awards,
  stories,
  power,
  change,
}: {
  m: Model
  leagueName: string
  week: number
  final: boolean
  games: BoardGame[]
  awards: Award[]
  stories: Story[]
  power: PowerRow[]
  change: Map<number, number>
}) {
  const [done, setDone] = useState<string | null>(null)
  const text = leagueRecapText({
    leagueName,
    week,
    final,
    games: games.map((g) => ({ a: { rosterId: g.a.rosterId, points: g.a.points }, b: g.b ? { rosterId: g.b.rosterId, points: g.b.points } : null })),
    name: m.teamName,
    playerName: m.name,
    awards,
    stories,
    power,
    change,
  })
  const flash = (s: string) => {
    setDone(s)
    setTimeout(() => setDone(null), 2500)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      flash('Recap copied')
    } catch {
      flash('Copy blocked by the browser: select the text below instead')
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: `Around the League · Week ${week}`, text })
    } catch {
      /* cancelled */
    }
  }
  const image = async () => {
    const lines = text.split('\n').slice(2, -2).filter((l) => l.trim() !== '')
    const blob = await recapImage(`Around the League · Week ${week}`, lines)
    if (!blob) return flash('This browser cannot draw the image')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `around-the-league-week-${week}.png`
    a.click()
    URL.revokeObjectURL(url)
    flash('Image saved')
  }
  const btn = 'border-line hover:border-accent/60 hover:bg-raised inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold transition-colors'
  return (
    <section aria-label="Share the recap" className={`${CARD} grid gap-3 p-4 sm:p-5`}>
      <h2 className="text-lg font-extrabold">Share Around the League</h2>
      <p className="text-ink-3 -mt-2 text-xs">
        Private by default: nothing is posted anywhere. Copy, share or save it yourself, for example into your league chat.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={btn}>
          <Copy size={16} aria-hidden /> Copy recap
        </button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button type="button" onClick={() => void share()} className={btn}>
            <Share2 size={16} aria-hidden /> Share…
          </button>
        )}
        <button type="button" onClick={() => void image()} className={btn}>
          <Download size={16} aria-hidden /> Save as image
        </button>
        {done && (
          <span role="status" className="text-good inline-flex items-center gap-1 text-sm font-semibold">
            <Check size={16} aria-hidden /> {done}
          </span>
        )}
      </div>
      <details>
        <summary className="text-ink-2 cursor-pointer text-sm font-bold">Preview the text</summary>
        <pre className="border-line/60 bg-bg/50 mt-2 max-h-72 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">{text}</pre>
      </details>
    </section>
  )
}

