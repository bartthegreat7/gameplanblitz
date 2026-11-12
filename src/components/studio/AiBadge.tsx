import { Sparkles } from 'lucide-react'

/** Always-visible disclosure: who wrote the script and what kind of voices read it. */
export function AiBadge({ engine, writer }: { engine: 'device' | 'cloud' | null; writer: 'built-in' | 'ai' }) {
  const voice = engine === 'cloud' ? 'AI voices (Deepgram Aura)' : engine === 'device' ? 'synthetic device voices' : 'no audio yet'
  return (
    <span
      className="border-purple/50 bg-purple/10 text-purple inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold"
      title="The hosts are fictional. Their voices are synthetic and the script is computer-generated."
    >
      <Sparkles size={13} aria-hidden />
      AI-generated hosts · {voice} · {writer === 'ai' ? 'AI-written script' : 'script from your data'}
    </span>
  )
}
