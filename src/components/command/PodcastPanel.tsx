import { Headphones, List, Mic, Pause, Play, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAutoEpisodes } from '../../hooks/useAutoEpisodes'
import type { FactSheet } from '../../hooks/useFactSheet'
import type { Ready } from '../../hooks/useLeagueData'
import { SHOWS } from '../../lib/ai/series'
import { useAppStore } from '../../store/app'
import { Link } from 'react-router-dom'

import { clock } from '../../lib/ai/episode'
import { EPISODE_TYPES } from '../../lib/ai/podcast'
import { listEpisodes, type Episode } from '../../lib/ai/storage'
import { relTime } from '../../lib/format'
import { CARD } from '../dashboard/styles'
import { usePlayback } from '../studio/usePlayback'

const BTN =
  'border-line/80 bg-bg/50 hover:border-accent/60 hover:bg-raised inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-semibold transition-colors'

/** Episode artwork: drawn (no stock image), so it never implies a real show or broadcaster. */
function Artwork({ week, label }: { week: number | null; label: string }) {
  return (
    <span
      aria-hidden
      className="border-line/80 from-card-2 to-bg relative flex size-[5.5rem] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-b"
    >
      <Mic size={30} className="text-accent drop-shadow-[0_0_10px_var(--accent-deep)]" />
      <span className="mt-1 text-[13px] leading-none font-extrabold tracking-wide uppercase">
        {week ? `Week ${week}` : 'War Room'}
      </span>
      <span className="text-ink-2 mt-0.5 max-w-full truncate px-1 text-[8px] font-bold tracking-wider uppercase">{label}</span>
    </span>
  )
}

/** One bar per script line, height by line length; filled up to the playback position. */
function Waveform({ durations, elapsed, starts }: { durations: number[]; elapsed: number; starts: number[] }) {
  const max = Math.max(1, ...durations)
  return (
    <span aria-hidden className="flex h-8 items-center gap-[2px]">
      {durations.slice(0, 48).map((d, i) => (
        <span
          key={i}
          className={`min-w-[2px] flex-1 rounded-full ${(starts[i] ?? 0) < elapsed ? 'bg-accent' : 'bg-accent/35'}`}
          style={{ height: `${25 + (d / max) * 75}%` }}
        />
      ))}
    </span>
  )
}

const PLAYED = 'gb-played-episodes'
const readPlayed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(PLAYED) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function Player({ ep, onPlay }: { ep: Episode; onPlay?: () => void }) {
  const pb = usePlayback(ep)
  const type = EPISODE_TYPES.find((t) => t.id === ep.type)
  const status = !ep.audio
    ? 'Transcript only · no audio yet'
    : !pb.canPlay
      ? 'No speech voices in this browser'
      : pb.playing
        ? `Playing · ${pb.chapterNow?.title ?? 'Intro'}`
        : `${relTime(ep.createdAt)} · ${ep.format === 'debate' ? 'two hosts' : 'one host'}`
  return (
    <div className="border-line/70 bg-bg/40 flex gap-3 rounded-xl border p-3">
      <Artwork week={ep.week} label={type?.label ?? 'Episode'} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-extrabold">{ep.title}</div>
        <p className="text-ink-2 truncate text-sm">{type?.blurb}</p>
        {pb.canPlay ? (
          <div className="mt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (!pb.playing) onPlay?.()
                pb.toggle()
              }}
              aria-label={pb.playing ? 'Pause episode' : 'Play episode'}
              className="bg-accent-deep text-select-ink grid size-10 shrink-0 place-items-center rounded-full shadow-[0_0_16px_-4px_var(--accent-deep)]"
            >
              {pb.playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden className="translate-x-px" />}
            </button>
            <div className="relative min-w-0 flex-1">
              <Waveform durations={pb.durations} elapsed={pb.elapsed} starts={pb.starts} />
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.round(pb.length))}
                step={1}
                value={Math.round(pb.elapsed)}
                onChange={(e) => pb.seek(Number(e.target.value))}
                aria-label="Seek"
                aria-valuetext={`${clock(pb.elapsed)} of ${clock(pb.length)}`}
                className="absolute inset-0 w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="text-ink-2 shrink-0 text-xs tabular-nums">
              {pb.playing || pb.elapsed > 0 ? clock(pb.elapsed) : clock(pb.length)}
            </span>
          </div>
        ) : null}
        <p className={`mt-1 truncate text-xs ${pb.playing ? 'text-good font-bold' : 'text-ink-3'}`}>
          {status}
          {!pb.cloud && pb.canPlay && ' · device voices, times estimated'}
        </p>
        {pb.error && <p className="text-bad text-xs font-semibold">{pb.error}</p>}
      </div>
    </div>
  )
}

/**
 * The latest episode of this league's personalized podcast, playable in place. Episodes are made
 * (and deleted) in the Studio from evidence-checked scripts; the hosts are fictional and their
 * voices synthetic.
 */
export function PodcastPanel({ data, sheet }: { data: Ready; sheet: FactSheet }) {
  const leagueId = data.league.league_id
  const prefs = useAppStore((s) => s.podcast)
  const made = useAutoEpisodes(data, sheet)
  const [eps, setEps] = useState<Episode[] | null>(null)
  const [played, setPlayed] = useState<string[]>(readPlayed)
  useEffect(() => {
    let live = true
    listEpisodes(leagueId).then((e) => live && setEps(e))
    return () => {
      live = false
    }
  }, [leagueId, made])
  const latest = eps?.[0] ?? null
  const fresh = !!latest && latest.week === data.week && prefs.banner && !played.includes(latest.id)
  const markPlayed = () => {
    if (!latest || played.includes(latest.id)) return
    const next = [...played, latest.id].slice(-200)
    setPlayed(next)
    try {
      localStorage.setItem(PLAYED, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <section aria-label="AI Podcast" className={`${CARD} grid gap-3 p-4 sm:p-5`}>
      <div className="flex items-start gap-3">
        <Headphones size={30} aria-hidden className="text-accent shrink-0" />
        <div className="min-w-0">
          <h2 className="text-xl leading-tight font-extrabold tracking-tight">AI Podcast: The Fantasy War Room</h2>
          <p className="text-accent text-sm font-medium">Your personalized weekly podcast.</p>
        </div>
      </div>
      {eps === null ? (
        <div className="bg-line/40 h-28 animate-pulse rounded-xl" />
      ) : latest ? (
        <>
          {fresh && (
            <p role="status" className="border-accent/50 bg-accent/12 text-accent rounded-lg border px-3 py-1.5 text-sm font-extrabold">
              Your Weekly Fantasy Briefing Is Ready
            </p>
          )}
          <Player key={latest.id} ep={latest} onPlay={markPlayed} />
        </>
      ) : (
        <div className="border-line/70 bg-bg/40 flex gap-3 rounded-xl border p-3">
          <Artwork week={null} label="Your team" />
          <p className="text-ink-2 min-w-0 self-center text-sm">
            No episodes yet. Make one about your team: matchup, start/sit calls, injuries, weather,
            waivers, trades and the playoff race, written from your league data.
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <Link to="/studio" className={BTN}>
          <Sparkles size={17} aria-hidden className="text-accent" /> New Episode
        </Link>
        <Link to="/studio?view=library" className={BTN}>
          <List size={17} aria-hidden className="text-accent" /> Episode Library
          {eps && eps.length > 0 && <span className="text-ink-3">({eps.length})</span>}
        </Link>
      </div>
      <p className="text-ink-3 text-xs">
        AI-generated: fictional hosts with synthetic voices. Scripts cite your league data.{' '}
        {prefs.auto
          ? `Automatic: ${SHOWS.filter((s) => prefs.shows.includes(s.type as never)).map((s) => s.series.replace('The Fantasy War Room: ', '')).join(', ')} (prepared when you open GamePlanBitz).`
          : 'Automatic weekly shows are off: turn them on in the Studio.'}
      </p>
    </section>
  )
}
