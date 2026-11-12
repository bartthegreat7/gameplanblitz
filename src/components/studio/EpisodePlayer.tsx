import { Pause, Play, Share2, SkipBack, SkipForward, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { chapterMarks, clock, locate, starts, total } from '../../lib/ai/episode'
import { speakable } from '../../lib/ai/podcast'
import { deviceVoices, pickHostVoices, speakLine, speechSupported } from '../../lib/ai/speech'
import { getClip, type Episode } from '../../lib/ai/storage'
import { relTime } from '../../lib/format'
import { FactRow } from '../ai/FactRow'
import { CARD, PAD } from '../dashboard/styles'
import { AiBadge } from './AiBadge'

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]
const KIND_CLS: Record<string, string> = {
  fact: 'text-good border-good/40',
  opinion: 'text-amber border-amber/40',
  banter: 'text-ink-3 border-line',
  disclosure: 'text-purple border-purple/40',
}

/**
 * Plays an episode line by line: device voices speak each line (resume restarts the current line),
 * AI voices play the stored clips (exact seeking). One timeline drives the seek bar, chapters and
 * the highlighted transcript line.
 */
export function EpisodePlayer({
  ep,
  onToggleSaved,
  onShare,
  onDelete,
}: {
  ep: Episode
  onToggleSaved: () => void
  onShare: () => void
  onDelete: () => void
}) {
  const durations = useMemo(() => ep.audio?.durations ?? [], [ep.audio])
  const s = useMemo(() => starts(durations), [durations])
  const length = total(durations)
  const marks = useMemo(() => chapterMarks(ep, durations), [ep, durations])
  const cloud = ep.audio?.engine === 'cloud'
  const canPlay = !!ep.audio && (cloud || speechSupported())

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const audio = useRef<HTMLAudioElement | null>(null)
  const url = useRef<string | null>(null)
  const stopSpeech = useRef<(() => void) | null>(null)
  const lineStarted = useRef(0)
  const lineRefs = useRef<(HTMLLIElement | null)[]>([])
  const indexRef = useRef(0)
  const rateRef = useRef(1)
  /** the latest playLine, so a finished line can start the next one */
  const playRef = useRef<(i: number, offset?: number) => Promise<void>>(async () => {})

  const stopAll = useCallback(() => {
    stopSpeech.current?.()
    stopSpeech.current = null
    audio.current?.pause()
  }, [])

  useEffect(
    () => () => {
      stopAll()
      if (url.current) URL.revokeObjectURL(url.current)
    },
    [stopAll],
  )
  const voices = useMemo(
    () => (cloud || !speechSupported() ? [] : pickHostVoices(deviceVoices(), ep.audio?.voices ?? [])),
    [cloud, ep.audio],
  )

  const playLine = useCallback(
    async (i: number, offset = 0) => {
      stopAll()
      if (i >= ep.lines.length) {
        setPlaying(false)
        setIndex(0)
        indexRef.current = 0
        setElapsed(0)
        return
      }
      indexRef.current = i
      setIndex(i)
      setElapsed((s[i] ?? 0) + offset)
      lineRefs.current[i]?.scrollIntoView?.({ block: 'nearest' })
      setPlaying(true)
      setError(null)
      if (cloud) {
        const blob = await getClip(ep.id, i)
        if (indexRef.current !== i) return
        if (!blob) {
          setError(`The audio for line ${i + 1} is missing. Create the audio again.`)
          setPlaying(false)
          return
        }
        if (url.current) URL.revokeObjectURL(url.current)
        url.current = URL.createObjectURL(blob)
        const a = (audio.current ??= new Audio())
        a.src = url.current
        a.playbackRate = rateRef.current
        a.currentTime = offset
        a.ontimeupdate = () => setElapsed((s[i] ?? 0) + a.currentTime)
        a.onended = () => void playRef.current(i + 1)
        a.onerror = () => {
          setError('This browser could not play the audio.')
          setPlaying(false)
        }
        try {
          await a.play()
        } catch {
          setPlaying(false)
        }
      } else {
        lineStarted.current = performance.now()
        const l = ep.lines[i]
        stopSpeech.current = speakLine(speakable(l.text), {
          voice: voices[l.speaker] ?? null,
          rate: rateRef.current,
          onEnd: () => void playRef.current(i + 1),
          onError: (e) => {
            setError(`Speech stopped (${e}).`)
            setPlaying(false)
          },
        })
      }
    },
    [cloud, ep.id, ep.lines, s, stopAll, voices],
  )

  useEffect(() => {
    playRef.current = playLine
  })

  // device voices report no progress: advance the clock by the estimate while a line plays
  useEffect(() => {
    if (!playing || cloud) return
    const t = setInterval(() => {
      const i = indexRef.current
      const into = ((performance.now() - lineStarted.current) / 1000) * rateRef.current
      setElapsed((s[i] ?? 0) + Math.min(into, durations[i] ?? 0))
    }, 250)
    return () => clearInterval(t)
  }, [playing, cloud, s, durations])

  const toggle = () => {
    if (playing) {
      if (cloud) audio.current?.pause()
      else stopAll()
      setPlaying(false)
    } else if (cloud && audio.current?.src && audio.current.currentTime > 0 && !audio.current.ended) {
      audio.current.playbackRate = rateRef.current
      void audio.current.play().then(() => setPlaying(true))
    } else void playLine(indexRef.current)
  }

  const seek = (t: number) => {
    const { index: i, offset } = locate(durations, t)
    if (playing) void playLine(i, cloud ? offset : 0)
    else {
      stopAll()
      indexRef.current = i
      setIndex(i)
      setElapsed(cloud ? t : (s[i] ?? 0))
      if (cloud && audio.current) audio.current.removeAttribute('src')
    }
  }
  const jump = (i: number) => (playing ? void playLine(i) : seek(s[i] ?? 0))
  const chapterNow = [...marks].reverse().find((c) => c.index <= index)
  const prevChapter = () => {
    const k = marks.findIndex((c) => c === chapterNow)
    const target = elapsed - (chapterNow?.at ?? 0) > 3 ? chapterNow : marks[Math.max(0, k - 1)]
    if (target) jump(target.index)
  }
  const nextChapter = () => {
    const k = marks.findIndex((c) => c === chapterNow)
    const target = marks[k + 1]
    if (target) jump(target.index)
  }
  const setSpeed = (r: number) => {
    rateRef.current = r
    setRate(r)
    if (cloud && audio.current) audio.current.playbackRate = r
    else if (playing) void playLine(indexRef.current) // speech rate applies from the start of a line
  }

  const byId = new Map(ep.facts.map((f) => [f.id, f]))
  const cited = [...new Set(ep.lines.flatMap((l) => l.cite))].map((id) => byId.get(id)).filter(Boolean)
  const num = new Map(cited.map((f, k) => [f!.id, k + 1]))

  return (
    <section aria-label="Episode player" className={`${CARD} ${PAD} grid gap-4`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">{ep.title}</h2>
          <p className="text-ink-3 text-sm">
            The War Room · {ep.leagueName} · {relTime(ep.createdAt)} · {ep.format === 'debate' ? `${ep.hosts[0].name} & ${ep.hosts[1].name}` : ep.hosts[0].name}
          </p>
        </div>
        <AiBadge engine={ep.audio?.engine ?? null} writer={ep.writer} />
      </div>

      {canPlay ? (
        <div className="border-line/60 bg-bg/40 grid gap-3 rounded-2xl border p-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={prevChapter} aria-label="Previous chapter" className="border-line grid size-10 place-items-center rounded-full border">
              <SkipBack size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? 'Pause' : 'Play'}
              className="bg-accent text-accent-ink grid size-14 place-items-center rounded-full shadow-lg"
            >
              {playing ? <Pause size={24} aria-hidden /> : <Play size={24} aria-hidden className="translate-x-px" />}
            </button>
            <button type="button" onClick={nextChapter} aria-label="Next chapter" className="border-line grid size-10 place-items-center rounded-full border">
              <SkipForward size={18} aria-hidden />
            </button>
            <div className="ml-2 min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{chapterNow?.title ?? 'Intro'}</div>
              <div className="text-ink-3 text-xs" aria-live="off">
                {clock(elapsed)} / {clock(length)}
                {!cloud && ' · estimated'}
              </div>
            </div>
            <label className="text-ink-2 flex items-center gap-1.5 text-xs font-bold">
              Speed
              <select value={rate} onChange={(e) => setSpeed(Number(e.target.value))} className="border-line bg-panel min-h-9 rounded-lg border px-2">
                {SPEEDS.map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(length))}
            step={1}
            value={Math.round(elapsed)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            aria-valuetext={`${clock(elapsed)} of ${clock(length)}`}
            className="accent-accent w-full"
          />
          {!cloud && <p className="text-ink-3 text-xs">Device voices: times are estimates and resuming restarts the current line.</p>}
          {error && <p className="text-bad text-sm font-semibold">{error}</p>}
        </div>
      ) : (
        <p className="text-ink-2 text-sm">
          {ep.audio ? "This browser has no speech voices. Read the transcript below, or create AI audio." : 'No audio yet. Create audio below, or read the transcript.'}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Chapters">
          <h3 className="text-ink-3 mb-2 text-xs font-extrabold tracking-wide uppercase">Chapters</h3>
          <ol className="grid gap-1">
            {marks.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => jump(c.index)}
                  aria-current={chapterNow?.id === c.id ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${chapterNow?.id === c.id ? 'bg-active text-ink font-bold' : 'text-ink-2 hover:bg-panel'}`}
                >
                  <span className="truncate">{c.title}</span>
                  <span className="text-ink-3 text-xs tabular-nums">{clock(c.at)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div>
          <h3 className="text-ink-3 mb-2 text-xs font-extrabold tracking-wide uppercase">Transcript</h3>
          <ol aria-label="Transcript" className="grid max-h-[28rem] gap-1.5 overflow-y-auto pr-1">
            {ep.lines.map((l, i) => (
              <li
                key={i}
                ref={(el) => {
                  lineRefs.current[i] = el
                }}
                aria-current={i === index && playing ? 'true' : undefined}
                className={`rounded-xl border px-3 py-2 text-sm ${i === index && playing ? 'border-accent bg-accent/10' : 'border-transparent'}`}
              >
                <button type="button" onClick={() => jump(i)} className="w-full text-left">
                  <span className="mr-1.5 font-extrabold">{ep.hosts[l.speaker]?.name ?? 'Host'}</span>
                  <span className={`mr-1.5 rounded-full border px-1.5 py-px text-[10px] font-extrabold tracking-wide uppercase ${KIND_CLS[l.kind]}`}>{l.kind}</span>
                  <span className="text-ink-2">{l.text}</span>
                  {l.cite.map((id) => (
                    <sup key={id} className="text-accent ml-0.5 font-bold">
                      [{num.get(id)}]
                    </sup>
                  ))}
                </button>
              </li>
            ))}
          </ol>
          {cited.length > 0 && (
            <details className="mt-3">
              <summary className="text-ink-2 cursor-pointer text-xs font-bold">Sources ({cited.length}) · facts as of {relTime(ep.factsAsOf)}</summary>
              <ol className="mt-2 grid gap-1.5">
                {cited.map((f, k) => (
                  <FactRow key={f!.id} fact={f!} n={k + 1} />
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onToggleSaved} aria-pressed={ep.saved} className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold ${ep.saved ? 'border-amber text-amber' : 'border-line text-ink-2'}`}>
          <Star size={16} aria-hidden className={ep.saved ? 'fill-current' : ''} /> {ep.saved ? 'Saved' : 'Save episode'}
        </button>
        <button type="button" onClick={onShare} className="border-line text-ink-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold">
          <Share2 size={16} aria-hidden /> Share or export
        </button>
        <span className="ml-auto">
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-sm font-bold">
              Delete this episode and its audio?
              <button type="button" onClick={onDelete} className="bg-bad text-bad-ink min-h-10 rounded-xl px-3">
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="border-line min-h-10 rounded-xl border px-3">
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-bad inline-flex min-h-10 items-center gap-1.5 px-2 text-sm font-bold">
              <Trash2 size={16} aria-hidden /> Delete
            </button>
          )}
        </span>
      </div>
    </section>
  )
}
