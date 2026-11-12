import { AlertTriangle, ArrowUp, Bot, Info, Mic, MicOff, RotateCcw, Sparkles, Square, Trash2, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import type { FactSheet } from '../../hooks/useFactSheet'
import type { Ready } from '../../hooks/useLeagueData'
import {
  aiAnswer,
  answerLocally,
  EMPTY_CONTEXT,
  parseQuestion,
  suggestions,
  type Answer,
  type Context,
} from '../../lib/ai/assistant'
import { AiError, aiConfigured, streamGm, withRetry } from '../../lib/ai/client'
import type { Fact } from '../../lib/ai/facts'
import { canSpend, record, remainingToday } from '../../lib/ai/quota'
import { deviceVoices, recognitionCtor, speakLine, speechSupported } from '../../lib/ai/speech'
import { clearChat, loadChat, newId, saveChat, type ChatMessage } from '../../lib/ai/storage'
import { relTime } from '../../lib/format'
import { useAppStore } from '../../store/app'
import { AiConsent } from './AiConsent'
import { FactRow } from './FactRow'

const partsText = (a?: Answer) => (a ? a.parts.map((p) => p.text).join('\n') : '')
/** cited facts, numbered in the order the answer first uses them */
const citedFacts = (a: Answer, facts: Fact[]) =>
  [...new Set(a.parts.flatMap((p) => p.cite))]
    .map((id) => facts.find((f) => f.id === id))
    .filter((f): f is Fact => !!f)
const stripCites = (s: string) => s.replace(/\[F\d{1,4}\]/g, '')
/** event-time clock (handlers only, never during render) */
const stamp = () => Date.now()

function AnswerCard({ msg, compact, onRetry, onBuiltIn }: { msg: ChatMessage; compact: boolean; onRetry: () => void; onBuiltIn: () => void }) {
  const cited = msg.cited ?? []
  const num = new Map(cited.map((f, i) => [f.id, i + 1]))
  const ai = msg.engine === 'ai'
  return (
    <article aria-label="Fantasy GM answer" className="border-line/70 bg-card/80 min-w-0 rounded-2xl border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${ai ? 'border-purple/50 bg-purple/10 text-purple' : 'border-line bg-panel text-ink-2'}`}>
          {ai ? <Sparkles size={12} aria-hidden /> : <Bot size={12} aria-hidden />}
          {ai ? 'AI answer · Claude' : 'Built-in answer · no AI'}
        </span>
        <span className="text-ink-3 font-semibold">{relTime(msg.at)}</span>
      </div>
      {msg.status === 'streaming' && (
        <p className="text-ink-2 text-sm whitespace-pre-wrap" aria-live="polite">
          {stripCites(msg.text) || 'Thinking…'}
        </p>
      )}
      {msg.status === 'cancelled' && (
        <p className="text-ink-3 text-sm">
          {stripCites(msg.text) ? `${stripCites(msg.text)} ` : ''}
          <em>Stopped.</em>
        </p>
      )}
      {msg.status === 'error' && (
        <div className="text-sm">
          <p className="text-bad flex items-start gap-2 font-semibold">
            <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
            {msg.error}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onRetry} className="border-line bg-panel inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 font-bold">
              <RotateCcw size={14} aria-hidden /> Retry
            </button>
            <button type="button" onClick={onBuiltIn} className="border-line bg-panel min-h-9 rounded-lg border px-3 font-bold">
              Answer without AI
            </button>
          </div>
        </div>
      )}
      {msg.answer && msg.status === 'done' && (
        <>
          <div className="grid gap-2 text-sm leading-relaxed">
            {msg.answer.parts.map((p, i) => (
              <div key={i}>
                <p>
                  {p.text}
                  {p.cite.map((id) =>
                    num.has(id) ? (
                      <sup key={id} className="text-accent ml-0.5 font-bold" aria-label={`source ${num.get(id)}`}>
                        [{num.get(id)}]
                      </sup>
                    ) : null,
                  )}
                </p>
                {p.flags?.map((f) => (
                  <p key={f} className="text-amber mt-1 flex items-start gap-1.5 text-xs font-semibold">
                    <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" />
                    Unverified: {f}
                  </p>
                ))}
              </div>
            ))}
          </div>
          {msg.answer.uncertainty && (
            <p className="text-ink-3 mt-3 flex items-start gap-1.5 text-xs">
              <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
              {msg.answer.uncertainty}
            </p>
          )}
          {msg.answer.links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {msg.answer.links.map((l) => (
                <Link key={l.to} to={l.to} className="border-accent/40 text-accent rounded-full border px-2.5 py-1 text-xs font-bold hover:underline">
                  {l.label}
                </Link>
              ))}
            </div>
          )}
          {cited.length > 0 && (
            <details className="mt-3" open={!compact}>
              <summary className="text-ink-2 cursor-pointer text-xs font-bold">
                Sources ({cited.length})
              </summary>
              <ol className="mt-2 grid gap-1.5">
                {cited.map((f, i) => (
                  <FactRow key={f.id} fact={f} n={i + 1} />
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </article>
  )
}

/**
 * The AI Fantasy GM conversation. Built-in answers arrange cited facts with no AI; AI answers
 * (when the site has a Worker and the user consented) are checked against the same facts.
 */
export function GmChat({ data, sheet, compact = false, seeds }: { data: Ready; sheet: FactSheet; compact?: boolean; seeds?: string[] }) {
  const { model: m, league } = data
  const { aiConsent, aiToken, readAloud, deviceVoices: voicePrefs, setAi } = useAppStore()
  const configured = aiConfigured()
  const [engine, setEngine] = useState<'built-in' | 'ai'>(configured && aiConsent ? 'ai' : 'built-in')
  const [askConsent, setAskConsent] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [ctx, setCtx] = useState<Context>(EMPTY_CONTEXT)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const stopSpeech = useRef<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const Recognition = recognitionCtor()

  useEffect(() => {
    let live = true
    loadChat(league.league_id).then((ms) => {
      if (!live) return
      // keep anything asked while the saved conversation was loading
      setMessages((now) => [...ms, ...now.filter((x) => !ms.some((y) => y.id === x.id))])
      setLoaded(true)
    })
    return () => {
      live = false
      abortRef.current?.abort()
      stopSpeech.current?.()
    }
  }, [league.league_id])
  useEffect(() => {
    if (loaded) void saveChat(league.league_id, messages)
  }, [loaded, messages, league.league_id])
  useEffect(() => {
    // in a panel, scroll only the conversation (never the page around it)
    if (compact) {
      const log = logRef.current
      if (log) log.scrollTop = log.scrollHeight
    } else endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, compact])

  const update = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const speak = useCallback(
    (a: Answer) => {
      if (!readAloud || !speechSupported()) return
      stopSpeech.current?.()
      const v = deviceVoices().find((x) => x.name === voicePrefs[0]) ?? null
      stopSpeech.current = speakLine(partsText(a), { voice: v, rate: 1, onEnd: () => (stopSpeech.current = null) })
    },
    [readAloud, voicePrefs],
  )

  const builtIn = (q: string, at = stamp()): ChatMessage => {
    const parsed = parseQuestion(q, sheet.names, ctx)
    const answer = answerLocally(parsed, { facts: sheet.facts, name: m.name, pending: sheet.pending, unavailable: sheet.unavailable })
    return { id: newId(), role: 'assistant', at, text: '', engine: 'built-in', answer, cited: citedFacts(answer, sheet.facts), status: 'done' }
  }

  async function ask(question: string, useEngine = engine) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    stopSpeech.current?.()
    const parsed = parseQuestion(q, sheet.names, ctx)
    setCtx({ players: parsed.players.length ? parsed.players : ctx.players, intent: parsed.intent })
    const user: ChatMessage = { id: newId(), role: 'user', at: stamp(), text: q }

    if (useEngine === 'built-in' || !configured || !aiConsent) {
      const msg = builtIn(q)
      setMessages((ms) => [...ms, user, msg])
      if (msg.answer) speak(msg.answer)
      return
    }
    const id = newId()
    if (!canSpend('chat')) {
      setMessages((ms) => [
        ...ms,
        user,
        { id, role: 'assistant', at: stamp(), text: '', engine: 'ai', status: 'error', error: "You've used today's AI questions on this device. Built-in answers still work." },
      ])
      return
    }
    const history = messages
      .filter((x) => x.status === 'done' || x.role === 'user')
      .slice(-8)
      .map((x) => ({ role: x.role, text: x.role === 'user' ? x.text : x.engine === 'ai' ? x.text : partsText(x.answer) }))
      .filter((t) => t.text.trim())
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    setMessages((ms) => [...ms, user, { id, role: 'assistant', at: stamp(), text: '', engine: 'ai', status: 'streaming' }])
    const facts = sheet.facts
    try {
      record('chat')
      const r = await withRetry(
        () => {
          let acc = ''
          update(id, { text: '' })
          return streamGm(
            { question: q, history, facts, league: { name: league.name, week: sheet.week } },
            { token: aiToken, signal: ac.signal, onText: (t) => update(id, { text: (acc += t) }) },
          )
        },
        { signal: ac.signal },
      )
      const answer = aiAnswer(parsed, r.text, facts)
      update(id, { text: r.text, answer, cited: citedFacts(answer, facts), status: 'done' })
      speak(answer)
    } catch (e) {
      if (ac.signal.aborted) update(id, { status: 'cancelled' })
      else update(id, { status: 'error', error: e instanceof AiError ? e.message : 'Something went wrong getting an AI answer.' })
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const retry = (msgId: string, viaBuiltIn = false) => {
    const k = messages.findIndex((x) => x.id === msgId)
    const q = messages.slice(0, k).reverse().find((x) => x.role === 'user')
    if (!q) return
    setMessages((ms) => ms.filter((x) => x.id !== msgId && x.id !== q.id))
    void ask(q.text, viaBuiltIn ? 'built-in' : 'ai')
  }

  const listen = () => {
    if (!Recognition) return
    const r = new Recognition()
    r.lang = 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript ?? ''
      if (t) void ask(t)
    }
    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)
    setListening(true)
    r.start()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(input)
  }
  const chips = seeds?.length ? seeds : suggestions(sheet.facts, m.name)

  return (
    <div className={`flex min-h-0 flex-col ${compact ? 'h-full' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {configured ? (
          <div role="group" aria-label="Answer engine" className="border-line bg-panel inline-flex rounded-xl border p-0.5 text-xs font-bold">
            {(['built-in', 'ai'] as const).map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={engine === e}
                onClick={() => (e === 'ai' && !aiConsent ? setAskConsent(true) : setEngine(e))}
                className={`min-h-8 rounded-lg px-3 ${engine === e ? 'bg-ink text-bg' : 'text-ink-2'}`}
              >
                {e === 'ai' ? 'AI (Claude)' : 'Built-in'}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-ink-3 text-xs">Built-in answers from your league data · no AI service is set up on this site</span>
        )}
        {configured && engine === 'ai' && aiConsent && (
          <span className="text-ink-3 text-xs">{remainingToday('chat')} AI questions left today</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {speechSupported() && (
            <button
              type="button"
              aria-pressed={readAloud}
              onClick={() => {
                if (readAloud) stopSpeech.current?.()
                setAi({ readAloud: !readAloud })
              }}
              className={`grid size-9 place-items-center rounded-lg border ${readAloud ? 'border-accent text-accent' : 'border-line text-ink-3'}`}
              aria-label="Read answers aloud"
              title="Read answers aloud (device voice)"
            >
              <Volume2 size={16} aria-hidden />
            </button>
          )}
          {messages.length > 0 &&
            (confirmClear ? (
              <span className="flex items-center gap-1 text-xs font-bold">
                Clear chat?
                <button type="button" className="text-bad min-h-8 px-2" onClick={() => { setMessages([]); setCtx(EMPTY_CONTEXT); void clearChat(league.league_id); setConfirmClear(false) }}>
                  Clear
                </button>
                <button type="button" className="text-ink-2 min-h-8 px-2" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className="border-line text-ink-3 grid size-9 place-items-center rounded-lg border" aria-label="Clear conversation">
                <Trash2 size={16} aria-hidden />
              </button>
            ))}
        </span>
      </div>

      {askConsent && (
        <AiConsent
          onAllow={() => {
            setAi({ aiConsent: true })
            setEngine('ai')
            setAskConsent(false)
          }}
          onCancel={() => setAskConsent(false)}
        />
      )}

      <div ref={logRef} role="log" aria-label="Conversation" className={`grid min-h-0 content-start gap-3 ${compact ? 'flex-1 overflow-y-auto pr-1' : ''}`}>
        {messages.length === 0 && (
          <div className="text-ink-2 text-sm">
            <p className="mb-2">
              Ask about your lineup, start/sit calls, injuries, weather, waivers, trades, keepers, your opponent or the playoff race. Answers cite your league data and say how sure they are.
            </p>
          </div>
        )}
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <p key={msg.id} className="bg-accent/15 border-accent/30 ml-auto max-w-[85%] rounded-2xl rounded-br-md border px-3.5 py-2 text-sm font-semibold">
              {msg.text}
            </p>
          ) : (
            <AnswerCard key={msg.id} msg={msg} compact={compact} onRetry={() => retry(msg.id)} onBuiltIn={() => retry(msg.id, true)} />
          ),
        )}
        <div ref={endRef} />
      </div>

      <div role="group" className="mt-3 flex flex-wrap gap-2" aria-label="Suggested questions">
        {chips.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => void ask(s)} className="border-line bg-panel text-ink-2 hover:text-ink rounded-full border px-3 py-1.5 text-xs font-semibold">
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="border-line bg-card mt-3 flex items-end gap-2 rounded-2xl border p-2">
        <label htmlFor={`gm-q-${compact ? 'c' : 'p'}`} className="sr-only">
          Ask the Fantasy GM
        </label>
        <textarea
          id={`gm-q-${compact ? 'c' : 'p'}`}
          rows={1}
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(input)
            }
          }}
          placeholder="Ask the Fantasy GM…"
          className="text-ink placeholder:text-ink-3 max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
        />
        {Recognition && (
          <button
            type="button"
            onClick={listen}
            disabled={busy || listening}
            aria-label={listening ? 'Listening…' : 'Ask by voice'}
            title="Ask by voice. Your browser's speech service converts it to text (Chrome and Edge send the audio to Google or Microsoft)."
            className={`grid size-10 shrink-0 place-items-center rounded-xl border ${listening ? 'border-bad text-bad' : 'border-line text-ink-2'}`}
          >
            {listening ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
          </button>
        )}
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop answer" className="border-line text-ink grid size-10 shrink-0 place-items-center rounded-xl border">
            <Square size={16} aria-hidden />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} aria-label="Send question" className="bg-accent text-accent-ink grid size-10 shrink-0 place-items-center rounded-xl disabled:opacity-40">
            <ArrowUp size={18} aria-hidden />
          </button>
        )}
      </form>
      <p className="text-ink-3 mt-2 text-[11px] leading-snug">
        Read-only: the GM can't change your roster. {sheet.asOf ? `League data as of ${relTime(sheet.asOf)}. ` : ''}
        {sheet.pending.length > 0 ? `Still loading: ${sheet.pending.join(', ')}. ` : ''}
        Conversation saved in this browser only.
      </p>
    </div>
  )
}
