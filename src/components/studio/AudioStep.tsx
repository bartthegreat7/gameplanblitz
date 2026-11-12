import { AudioLines, Loader2, RotateCcw, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AiError, aiConfigured, CLOUD_VOICES, MAX_TTS_CHARS, synthesize, withRetry } from '../../lib/ai/client'
import { blobDuration } from '../../lib/ai/episode'
import { estimateSeconds, speakable } from '../../lib/ai/podcast'
import { canSpend, record, remainingToday } from '../../lib/ai/quota'
import { deviceVoices, pickHostVoices, speechSupported } from '../../lib/ai/speech'
import { deleteClips, getClip, saveClip, type Episode } from '../../lib/ai/storage'
import { useAppStore } from '../../store/app'
import { AiConsent } from '../ai/AiConsent'

function useDeviceVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => deviceVoices())
  useEffect(() => {
    if (!speechSupported()) return
    const synth = window.speechSynthesis
    const on = () => setVoices(deviceVoices())
    synth.addEventListener?.('voiceschanged', on)
    return () => synth.removeEventListener?.('voiceschanged', on)
  }, [])
  return voices
}

const CONCURRENCY = 3
const spoken = (text: string) => speakable(text).slice(0, MAX_TTS_CHARS)

/** Turns an approved script into audio: device voices (free, on this device) or AI voices (Worker). */
export function AudioStep({ ep, onSaved }: { ep: Episode; onSaved: (e: Episode) => void }) {
  const { aiConsent, aiToken, deviceVoices: devPrefs, cloudVoices, setAi } = useAppStore()
  const configured = aiConfigured()
  const device = speechSupported()
  const [engine, setEngine] = useState<'device' | 'cloud'>(device || !configured ? 'device' : 'cloud')
  const [askConsent, setAskConsent] = useState(false)
  const voices = useDeviceVoices()
  const picked = pickHostVoices(voices, devPrefs)
  const hosts = ep.format === 'debate' ? [0, 1] : [0]
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const chars = ep.lines.reduce((n, l) => n + spoken(l.text).length, 0)
  const busy = progress !== null

  const useDevice = () => {
    const names = hosts.map((h) => picked[h]?.name ?? '')
    onSaved({ ...ep, audio: { engine: 'device', voices: names, durations: ep.lines.map((l) => estimateSeconds(spoken(l.text))) } })
  }

  const generate = async (only?: number[]) => {
    setError(null)
    const todo = only ?? ep.lines.map((_, i) => i)
    const need = todo.reduce((n, i) => n + spoken(ep.lines[i].text).length, 0)
    if (!canSpend('ttsChars', need)) {
      setError(`This episode needs ${need.toLocaleString()} characters of AI speech; ${remainingToday('ttsChars').toLocaleString()} are left today on this device. Try a shorter episode or device voices.`)
      return
    }
    if (!only) await deleteClips(ep.id)
    const ac = new AbortController()
    abort.current = ac
    const bad: number[] = []
    let done = 0
    let fatal: AiError | null = null
    setFailed([])
    setProgress({ done: 0, total: todo.length })
    const queue = [...todo]
    const work = async () => {
      while (queue.length && !ac.signal.aborted && !fatal) {
        const i = queue.shift()!
        const text = spoken(ep.lines[i].text)
        try {
          const blob = await withRetry(
            () => synthesize(text, cloudVoices[ep.lines[i].speaker] ?? cloudVoices[0], { token: aiToken, signal: ac.signal }),
            { signal: ac.signal },
          )
          record('ttsChars', text.length)
          await saveClip(ep.id, i, blob)
        } catch (e) {
          if (ac.signal.aborted) return
          bad.push(i)
          if (e instanceof AiError && (e.code === 'quota' || e.code === 'global-quota' || e.status === 401 || e.status === 403)) fatal = e
        }
        done++
        setProgress({ done, total: todo.length })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, work))
    abort.current = null
    setProgress(null)
    if (ac.signal.aborted) {
      setError('Stopped. Lines already made are kept; create the audio again to finish.')
      return
    }
    if (fatal) setError((fatal as AiError).message)
    const missing = [...bad, ...queue].sort((a, b) => a - b)
    if (missing.length) {
      setFailed(missing)
      if (!fatal) setError(`${missing.length} line${missing.length === 1 ? '' : 's'} failed.`)
      return
    }
    const durations = await Promise.all(
      ep.lines.map(async (l, i) => {
        const blob = await getClip(ep.id, i)
        return (blob && (await blobDuration(blob))) ?? estimateSeconds(spoken(l.text))
      }),
    )
    onSaved({ ...ep, audio: { engine: 'cloud', voices: hosts.map((h) => cloudVoices[h]), durations } })
  }

  return (
    <section aria-label="Voice options" className="grid gap-4">
      <div role="group" aria-label="Voices" className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={engine === 'device'}
          disabled={!device || busy}
          onClick={() => setEngine('device')}
          className={`rounded-2xl border p-4 text-left disabled:opacity-50 ${engine === 'device' ? 'border-accent bg-accent/10' : 'border-line bg-panel'}`}
        >
          <span className="block font-extrabold">Device voices</span>
          <span className="text-ink-2 block text-sm">Free and private: your browser speaks the script. {device ? '' : 'Not available in this browser.'}</span>
        </button>
        <button
          type="button"
          aria-pressed={engine === 'cloud'}
          disabled={!configured || busy}
          onClick={() => (aiConsent ? setEngine('cloud') : setAskConsent(true))}
          className={`rounded-2xl border p-4 text-left disabled:opacity-50 ${engine === 'cloud' ? 'border-accent bg-accent/10' : 'border-line bg-panel'}`}
        >
          <span className="block font-extrabold">AI voices</span>
          <span className="text-ink-2 block text-sm">
            {configured ? 'Licensed synthetic voices (Deepgram Aura on Cloudflare). Makes an MP3 you can keep.' : 'Needs the GameplanBlitz AI Worker (not set up on this site).'}
          </span>
        </button>
      </div>
      {askConsent && (
        <AiConsent
          what="scripts"
          onAllow={() => {
            setAi({ aiConsent: true })
            setEngine('cloud')
            setAskConsent(false)
          }}
          onCancel={() => setAskConsent(false)}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {hosts.map((h) =>
          engine === 'device' ? (
            <label key={h} className="grid gap-1 text-sm font-bold">
              {ep.hosts[h].name}'s voice
              <select
                value={picked[h]?.name ?? ''}
                onChange={(e) => {
                  const next: [string | null, string | null] = [...devPrefs] as [string | null, string | null]
                  next[h] = e.target.value
                  setAi({ deviceVoices: next })
                }}
                className="border-line bg-panel min-h-10 rounded-xl border px-2 font-normal"
                disabled={voices.length === 0}
              >
                {voices.length === 0 && <option value="">Default voice</option>}
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={h} className="grid gap-1 text-sm font-bold">
              {ep.hosts[h].name}'s voice
              <select
                value={cloudVoices[h]}
                onChange={(e) => {
                  const next: [string, string] = [...cloudVoices] as [string, string]
                  next[h] = e.target.value
                  setAi({ cloudVoices: next })
                }}
                className="border-line bg-panel min-h-10 rounded-xl border px-2 font-normal"
              >
                {CLOUD_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    Aura {v.label}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}
      </div>

      {engine === 'cloud' && (
        <p className="text-ink-3 text-xs">
          {chars.toLocaleString()} characters of speech · {remainingToday('ttsChars').toLocaleString()} left today on this device. Voices are synthetic and are not modeled on any real person.
        </p>
      )}

      {progress && (
        <div role="status" aria-live="polite" className="border-line bg-panel flex items-center gap-3 rounded-xl border p-3 text-sm">
          <Loader2 size={18} aria-hidden className="text-accent animate-spin" />
          <span className="flex-1">
            Generating AI audio: line {progress.done} of {progress.total}
          </span>
          <button type="button" onClick={() => abort.current?.abort()} className="border-line inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 font-bold">
            <Square size={14} aria-hidden /> Cancel
          </button>
        </div>
      )}
      {error && <p className="text-bad text-sm font-semibold">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {engine === 'device' ? (
          <button type="button" disabled={!device} onClick={useDevice} className="bg-accent text-accent-ink inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-extrabold disabled:opacity-40">
            <AudioLines size={18} aria-hidden /> Use device voices
          </button>
        ) : (
          <button type="button" disabled={busy || !aiConsent} onClick={() => void generate()} className="bg-accent text-accent-ink inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-extrabold disabled:opacity-40">
            <AudioLines size={18} aria-hidden /> Create AI audio
          </button>
        )}
        {failed.length > 0 && !busy && (
          <button type="button" onClick={() => void generate(failed)} className="border-line inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-bold">
            <RotateCcw size={16} aria-hidden /> Retry {failed.length} failed line{failed.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </section>
  )
}
