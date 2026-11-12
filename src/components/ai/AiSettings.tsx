import { useState } from 'react'

import { AI_API, aiConfigured, AiError, getUsage, type Usage } from '../../lib/ai/client'
import { LOCAL_LIMITS, remainingToday } from '../../lib/ai/quota'
import { clearChat, deleteEpisode, listEpisodes } from '../../lib/ai/storage'
import { useAppStore } from '../../store/app'

/** Settings for the AI Fantasy GM and Podcast Studio: service status, consent, token, usage, data. */
export function AiSettings() {
  const { aiConsent, aiToken, leagueId, setAi } = useAppStore()
  const configured = aiConfigured()
  const [token, setToken] = useState(aiToken)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'episodes' | 'chat' | null>(null)
  const host = (() => {
    try {
      return new URL(AI_API).host
    } catch {
      return AI_API
    }
  })()

  const check = async () => {
    setMsg(null)
    try {
      setUsage(await getUsage(aiToken))
    } catch (e) {
      setMsg(e instanceof AiError ? e.message : 'Could not reach the AI service.')
    }
  }
  const wipe = async (what: 'episodes' | 'chat') => {
    if (what === 'episodes') {
      const eps = await listEpisodes()
      await Promise.all(eps.map((e) => deleteEpisode(e.id)))
      setMsg(`Deleted ${eps.length} episode${eps.length === 1 ? '' : 's'} and their audio.`)
    } else if (leagueId) {
      await clearChat(leagueId)
      setMsg('Cleared the Fantasy GM conversation for this league.')
    }
    setConfirm(null)
  }

  return (
    <section aria-label="AI features" className="border-line bg-card rounded-3xl border p-5">
      <h2 className="text-lg font-extrabold">AI Fantasy GM &amp; Podcast Studio</h2>
      <p className="text-ink-3 mt-0.5 mb-3 text-sm">
        Built-in answers, scripts and device voices work without any AI service. AI answers, AI scripts and AI voices go through the GameplanBlitz AI Worker, which keeps the API keys server-side.
      </p>
      <p className="text-sm">
        {configured ? (
          <>
            AI service: <b>{host}</b>
          </>
        ) : (
          <>AI service: not set up on this site. Deploy the Worker in <code>worker/</code> and build with <code>VITE_AI_API</code> (see <code>worker/README.md</code>).</>
        )}
      </p>
      {configured && (
        <div className="mt-4 grid gap-4">
          <label className="flex items-start gap-2.5 text-sm font-semibold">
            <input type="checkbox" checked={aiConsent} onChange={(e) => setAi({ aiConsent: e.target.checked })} className="accent-accent mt-0.5 size-4" />
            Allow sending my league facts (team and player names, projections, standings, injury designations, headlines) to the AI service when I use AI answers, scripts or voices.
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setAi({ aiToken: token.trim() })
              setMsg('Access token saved in this browser.')
            }}
            className="grid gap-1.5 text-sm"
          >
            <label htmlFor="ai-token" className="font-bold">
              Access token (if your Worker requires one)
            </label>
            <div className="flex gap-2">
              <input id="ai-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="border-line bg-panel min-h-10 flex-1 rounded-xl border px-3" />
              <button type="submit" className="border-line bg-panel min-h-10 rounded-xl border px-3 font-bold">
                Save
              </button>
            </div>
            <span className="text-ink-3 text-xs">Kept in this browser only; never built into the site.</span>
          </form>
          <div className="text-sm">
            <p className="text-ink-2">
              Left today on this device: {remainingToday('chat')}/{LOCAL_LIMITS.chat} AI questions, {remainingToday('scripts')}/{LOCAL_LIMITS.scripts} AI scripts,{' '}
              {remainingToday('ttsChars').toLocaleString()}/{LOCAL_LIMITS.ttsChars.toLocaleString()} characters of AI speech.
            </p>
            <button type="button" onClick={() => void check()} className="border-line bg-panel mt-2 min-h-10 rounded-xl border px-3 font-bold">
              Check service usage
            </button>
            {usage && (
              <p className="text-ink-2 mt-2">
                Service limits today: {usage.chat.used}/{usage.chat.limit} questions, {usage.scripts.used}/{usage.scripts.limit} scripts, {usage.ttsChars.used.toLocaleString()}/{usage.ttsChars.limit.toLocaleString()} speech characters. Resets in {Math.ceil(usage.resetsInSeconds / 3600)} h.
              </p>
            )}
          </div>
        </div>
      )}
      <div className="border-line mt-4 flex flex-wrap gap-2 border-t pt-4 text-sm">
        {confirm ? (
          <span className="flex flex-wrap items-center gap-2 font-bold">
            {confirm === 'episodes' ? 'Delete every podcast episode, transcript and audio file in this browser?' : 'Clear the Fantasy GM conversation for this league?'}
            <button type="button" onClick={() => void wipe(confirm)} className="bg-bad text-bad-ink min-h-10 rounded-xl px-3">
              Delete
            </button>
            <button type="button" onClick={() => setConfirm(null)} className="border-line min-h-10 rounded-xl border px-3">
              Cancel
            </button>
          </span>
        ) : (
          <>
            <button type="button" onClick={() => setConfirm('episodes')} className="border-bad/40 text-bad min-h-10 rounded-xl border px-3 font-bold">
              Delete all episodes
            </button>
            <button type="button" disabled={!leagueId} onClick={() => setConfirm('chat')} className="border-line text-ink-2 min-h-10 rounded-xl border px-3 font-bold">
              Clear GM conversation
            </button>
          </>
        )}
      </div>
      {msg && (
        <p role="status" className="text-ink-2 mt-2 text-sm">
          {msg}
        </p>
      )}
    </section>
  )
}
