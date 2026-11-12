/* Device speech: the browser's own text-to-speech voice for reading answers aloud (nothing is
   uploaded by GameplanBlitz) and, where available, speech recognition for asking questions by voice.
   Chrome and Edge process recognition on the vendor's servers; the UI says so. */

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

/** Speaks a text. Returns a function that stops it. */
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
