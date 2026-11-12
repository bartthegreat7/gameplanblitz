import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { chapterMarks, locate, starts, total } from '../../lib/ai/episode'
import { speakable } from '../../lib/ai/podcast'
import { deviceVoices, pickHostVoices, speakLine, speechSupported } from '../../lib/ai/speech'
import { getClip, type Episode } from '../../lib/ai/storage'

/**
 * Plays an episode line by line: device voices speak each line (resume restarts the current line),
 * AI voices play the stored clips (exact seeking). One timeline drives the seek bar, chapters and
 * the highlighted transcript line. Shared by the Studio player and the dashboard mini-player.
 */
export function usePlayback(ep: Episode) {
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


  return {
    durations,
    starts: s,
    length,
    marks,
    cloud,
    canPlay,
    index,
    playing,
    rate,
    elapsed,
    error,
    lineRefs,
    toggle,
    seek,
    jump,
    chapterNow,
    prevChapter,
    nextChapter,
    setSpeed,
  }
}
