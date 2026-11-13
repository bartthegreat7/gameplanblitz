import { Bot, Tv } from 'lucide-react'

import { tickerItems } from '../../lib/ai/episode'
import type { Episode } from '../../lib/ai/storage'

/**
 * The Sports Desk: a TV-style presentation of an episode, driven by the playback position. Network
 * bug, animated chapter title card, the cited fact as an on-screen graphic, a lower third naming
 * the (fictional, AI) host, and a ticker of league results quoted in the episode. Nothing here is
 * footage: it is drawn from the episode's own script and facts. Motion stops under reduced motion.
 */
export function BroadcastStage({ ep, index, chapterTitle }: { ep: Episode; index: number; chapterTitle: string | null }) {
  const line = ep.lines[Math.min(Math.max(0, index), ep.lines.length - 1)]
  const host = line && line.kind !== 'disclosure' ? ep.hosts[line.speaker] ?? ep.hosts[0] : null
  const byId = new Map(ep.facts.map((f) => [f.id, f]))
  const fact = line?.cite.map((id) => byId.get(id)).find(Boolean) ?? null
  const ticker = tickerItems(ep.facts)
  const base = import.meta.env.BASE_URL ?? '/'

  return (
    <figure aria-label="Broadcast view" className="border-line/60 bc-stage relative isolate aspect-video w-full overflow-hidden rounded-2xl border bg-[var(--bc-bg)] text-[var(--bc-ink)]">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${base}images/stadium-background.webp)` }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--bc-bg)] via-[var(--bc-bg)]/70 to-[var(--bc-bg)]/30" />

      {/* network bug + episode */}
      <div className="absolute top-[4%] left-[3%] flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md bg-[var(--bc-blue)] px-2 py-1 text-[clamp(9px,1.5vw,13px)] font-black tracking-wider uppercase">
          <Tv size={14} aria-hidden /> GPB Sports Desk
        </span>
        <span className="rounded-md bg-black/50 px-2 py-1 text-[clamp(8px,1.3vw,11px)] font-bold tracking-wide uppercase">AI-generated</span>
      </div>
      <p className="absolute top-[4%] right-[3%] max-w-[45%] truncate text-right text-[clamp(9px,1.5vw,13px)] font-bold text-[var(--bc-ink)]/80">{ep.title}</p>

      {/* chapter title card, re-keyed so it animates in on each chapter */}
      {chapterTitle && (
        <div key={chapterTitle} className="bc-card absolute top-[16%] left-[3%] max-w-[70%]">
          <p className="text-[clamp(8px,1.2vw,11px)] font-black tracking-[0.2em] text-[var(--bc-light)] uppercase">Now</p>
          <p className="text-[clamp(14px,3.4vw,30px)] leading-tight font-black">{chapterTitle}</p>
        </div>
      )}

      {/* on-screen graphic: the fact being read */}
      {fact && line?.kind === 'fact' && (
        <div key={`${index}-${fact.id}`} className="bc-graphic absolute top-[38%] right-[3%] w-[min(46%,26rem)] rounded-xl border border-white/15 bg-[var(--bc-panel)]/90 p-[clamp(6px,1.4vw,14px)] shadow-2xl">
          <p className="text-[clamp(8px,1.1vw,10px)] font-black tracking-widest text-[var(--bc-amber)] uppercase">{fact.kind === 'fact' ? 'Sleeper data' : 'Model'}</p>
          <p className="text-[clamp(9px,1.5vw,14px)] leading-snug font-semibold">{fact.text}</p>
        </div>
      )}

      {/* lower third */}
      {line && (
        <div className="absolute bottom-[14%] left-[3%] right-[3%] flex items-stretch overflow-hidden rounded-lg shadow-xl">
          <div className="flex shrink-0 flex-col justify-center bg-[var(--bc-blue)] px-[clamp(6px,1.5vw,14px)]">
            {host ? (
              <>
                <p className="text-[clamp(10px,1.8vw,16px)] leading-tight font-black">{host.name}</p>
                <p className="flex items-center gap-1 text-[clamp(7px,1.1vw,10px)] font-bold tracking-wide uppercase opacity-90">
                  <Bot size={11} aria-hidden /> AI host · {host.role}
                </p>
              </>
            ) : (
              <p className="text-[clamp(8px,1.3vw,12px)] font-black tracking-wide uppercase">Disclosure</p>
            )}
          </div>
          <p className="min-w-0 flex-1 bg-[var(--bc-panel)]/95 px-[clamp(6px,1.5vw,14px)] py-[clamp(4px,1vw,10px)] text-[clamp(9px,1.6vw,15px)] leading-snug">
            {line.text}
          </p>
        </div>
      )}

      {/* score ticker */}
      <div className="absolute right-0 bottom-0 left-0 flex h-[10%] items-center overflow-hidden bg-black/70">
        <span className="z-10 flex h-full shrink-0 items-center bg-[var(--bc-amber)] px-[clamp(6px,1.4vw,12px)] text-[clamp(8px,1.3vw,12px)] font-black tracking-wider text-[var(--bc-bg)] uppercase">
          Scores
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          {ticker.length ? (
            <p className="bc-ticker inline-block whitespace-nowrap text-[clamp(9px,1.4vw,13px)] font-semibold">
              {[...ticker, ...ticker].map((t, i) => (
                <span key={i} className="px-[clamp(8px,2vw,24px)]">
                  {t}
                </span>
              ))}
            </p>
          ) : (
            <p className="px-3 text-[clamp(9px,1.4vw,13px)] text-[var(--bc-ink)]/70">{ep.leagueName} · Week {ep.week}</p>
          )}
        </div>
      </div>
      <figcaption className="sr-only">
        Animated presentation of {ep.title}: chapter titles, the fact being read, the AI host and league scores. The transcript below has the same
        content.
      </figcaption>
    </figure>
  )
}
