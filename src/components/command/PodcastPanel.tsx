import { Library, Mic, Pause, Play, Plus, SkipBack, SkipForward, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { clock } from '../../lib/ai/episode'
import { EPISODE_TYPES } from '../../lib/ai/podcast'
import { listEpisodes, type Episode } from '../../lib/ai/storage'
import { relTime } from '../../lib/format'
import { CARD } from '../dashboard/styles'
import { usePlayback } from '../studio/usePlayback'

const BTN =
  'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition-colors'

/** Episode artwork: drawn (no stock image), so it never implies a real show or broadcaster. */
function Artwork({ week }: { week: number | null }) {
  return (
    <span
      aria-hidden
      className="from-accent-deep to-purple relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br shadow-lg"
    >
      <Mic size={30} className="text-white/90" />
      <span className="absolute inset-x-0 bottom-0 bg-black/35 py-0.5 text-center text-[10px] font-extrabold tracking-wider text-white uppercase">
        {week ? `War Room · Wk ${week}` : 'War Room'}
      </span>
    </span>
  )
}

/** One bar per script line, height by line length; filled up to the playback position. */
function Waveform({ durations, elapsed, starts }: { durations: number[]; elapsed: number; starts: number[] }) {
  const max = Math.max(1, ...durations)
  const bars = durations.slice(0, 64)
  return (
    <span aria-hidden className="flex h-9 items-center gap-[2px]">
      {bars.map((d, i) => (
        <span
          key={i}
          className={`min-w-[2px] flex-1 rounded-full ${(starts[i] ?? 0) < elapsed ? 'bg-accent' : 'bg-line'}`}
          style={{ height: `${25 + (d / max) * 75}%` }}
        />
      ))}
    </span>
  )
}

function Player({ ep }: { ep: Episode }) {
  const pb = usePlayback(ep)
  const blurb = EPISODE_TYPES.find((t) => t.id === ep.type)?.blurb
  const status = !ep.audio
    ? 'Transcript only · no audio yet'
    : !pb.canPlay
      ? 'No speech voices in this browser'
      : pb.playing
        ? 'Playing'
        : 'Ready to play'
  return (
    <div className="grid gap-3">
      <div className="flex gap-3">
        <Artwork week={ep.week} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-extrabold">{ep.title}</div>
          <p className="text-ink-3 line-clamp-2 text-sm">{blurb}</p>
          <div className="text-ink-3 mt-1 text-xs">
            {relTime(ep.createdAt)} · {ep.format === 'debate' ? 'Two hosts' : 'One host'} ·{' '}
            <span className={pb.playing ? 'text-good font-bold' : ''}>{status}</span>
          </div>
        </div>
      </div>
      {pb.canPlay && (
        <div className="border-line/60 bg-bg/40 grid gap-2 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pb.prevChapter}
              aria-label="Previous chapter"
              className="text-ink-2 hover:text-ink grid size-9 place-items-center rounded-full"
            >
              <SkipBack size={17} aria-hidden />
            </button>
            <button
              type="button"
              onClick={pb.toggle}
              aria-label={pb.playing ? 'Pause episode' : 'Play episode'}
              className="bg-accent text-accent-ink grid size-11 shrink-0 place-items-center rounded-full shadow-md"
            >
              {pb.playing ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden className="translate-x-px" />}
            </button>
            <button
              type="button"
              onClick={pb.nextChapter}
              aria-label="Next chapter"
              className="text-ink-2 hover:text-ink grid size-9 place-items-center rounded-full"
            >
              <SkipForward size={17} aria-hidden />
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
          </div>
          <div className="text-ink-3 flex justify-between text-xs tabular-nums">
            <span className="truncate">{pb.chapterNow?.title ?? 'Intro'}</span>
            <span>
              {clock(pb.elapsed)} / {clock(pb.length)}
              {!pb.cloud && ' (est.)'}
            </span>
          </div>
          {pb.error && <p className="text-bad text-xs font-semibold">{pb.error}</p>}
        </div>
      )}
    </div>
  )
}

/**
 * The latest episode of this league's personalized podcast, playable in place. Episodes are made
 * (and deleted) in the Studio from evidence-checked scripts; the hosts are fictional and their
 * voices synthetic.
 */
export function PodcastPanel({ leagueId }: { leagueId: string }) {
  const [eps, setEps] = useState<Episode[] | null>(null)
  useEffect(() => {
    let live = true
    listEpisodes(leagueId).then((e) => live && setEps(e))
    return () => {
      live = false
    }
  }, [leagueId])
  const latest = eps?.[0] ?? null
  return (
    <section aria-label="AI Podcast" className={`${CARD} grid gap-4 p-5`}>
      <div className="flex items-start gap-3">
        <span className="bg-purple/15 text-purple grid size-10 shrink-0 place-items-center rounded-xl">
          <Mic size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">AI Podcast: The Fantasy War Room</h2>
          <p className="text-ink-3 text-sm">Your personalized weekly podcast.</p>
        </div>
      </div>
      {eps === null ? (
        <div className="bg-line/40 h-20 animate-pulse rounded-xl" />
      ) : latest ? (
        <Player key={latest.id} ep={latest} />
      ) : (
        <div className="flex items-center gap-3">
          <Artwork week={null} />
          <p className="text-ink-2 text-sm">
            No episodes yet. Make one about your team: the matchup, start/sit calls, injuries, weather,
            waivers, trades and the playoff race, written from your league data.
          </p>
        </div>
      )}
      <p className="text-purple flex items-center gap-1.5 text-xs font-semibold">
        <Sparkles size={13} aria-hidden /> Fictional hosts with synthetic voices. Scripts cite your
        league data.
      </p>
      <div className="flex gap-2">
        <Link to="/studio" className={`${BTN} bg-accent text-accent-ink hover:bg-accent-deep`}>
          <Plus size={17} aria-hidden /> New Episode
        </Link>
        <Link
          to="/studio?view=library"
          className={`${BTN} border-line text-ink-2 hover:text-ink hover:bg-raised border`}
        >
          <Library size={17} aria-hidden /> Episode Library
          {eps && eps.length > 0 && <span className="text-ink-3">({eps.length})</span>}
        </Link>
      </div>
    </section>
  )
}
