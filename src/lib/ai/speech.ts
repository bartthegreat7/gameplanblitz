/* Device speech: the browser's own text-to-speech voices (licensed with the operating system or
   browser; nothing is uploaded by GameplanBlitz) and, where available, speech recognition for asking
   questions by voice. Chrome and Edge process recognition on the vendor's servers; the UI says so. */

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

/** English voices first, then the rest. */
export function deviceVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  const all = window.speechSynthesis.getVoices()
  const en = all.filter((v) => /^en\b|^en-/i.test(v.lang))
  return [...en, ...all.filter((v) => !en.includes(v))]
}

/** Two different voices for two hosts when the device has them. */
export function pickHostVoices(voices: SpeechSynthesisVoice[], wanted: (string | null)[]): (SpeechSynthesisVoice | null)[] {
  const byName = (n: string | null) => (n ? voices.find((v) => v.name === n) ?? null : null)
  const a = byName(wanted[0]) ?? voices[0] ?? null
  const b = byName(wanted[1]) ?? voices.find((v) => v !== a) ?? a
  return [a, b]
}

/** Speaks one line. Returns a function that stops it. */
export function speakLine(
  text: string,
  opts: { voice: SpeechSynthesisVoice | null; rate: number; onEnd: () => void; onError?: (e: string) => void },
): () => void {
  const synth = window.speechSynthesis
  const u = new SpeechSynthesisUtterance(text)
  if (opts.voice) {
    u.voice = opts.voice
    u.lang = opts.voice.lang
  }
  u.rate = opts.rate
  let stopped = false
  u.onend = () => {
    if (!stopped) opts.onEnd()
  }
  u.onerror = (e) => {
    if (!stopped && e.error !== 'interrupted' && e.error !== 'canceled') opts.onError?.(e.error)
  }
  synth.speak(u)
  return () => {
    stopped = true
    synth.cancel()
  }
}

type RecognitionCtor = new () => {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
