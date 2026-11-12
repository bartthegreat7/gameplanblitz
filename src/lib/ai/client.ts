import type { Fact } from './facts'

/* Client for the GameplanBlitz AI Worker (VITE_AI_API). The Worker holds the API key; this file
   only ever sends the fact sheet, the question and the conversation. Streams, cancels and retries. */

export const AI_API: string = String(import.meta.env.VITE_AI_API ?? '').replace(/\/$/, '')
export const aiConfigured = () => AI_API !== ''

export class AiError extends Error {
  code: string
  status: number
  retryAfter: number | null
  constructor(message: string, code: string, status: number, retryAfter: number | null = null) {
    super(message)
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }
}

/** Only the fields the Worker accepts. */
export const factPayload = (facts: Fact[]) =>
  facts.map(({ id, topic, kind, text, source, asOf }) => ({ id, topic, kind, text, source, asOf }))

async function call(path: string, body: unknown, token: string, signal?: AbortSignal, method = 'POST'): Promise<Response> {
  if (!aiConfigured()) throw new AiError('The AI service is not configured for this site.', 'not_configured', 0)
  let res: Response
  try {
    res = await fetch(`${AI_API}${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-gb-token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new AiError('Could not reach the AI service.', 'network', 0)
  }
  if (res.ok) return res
  let info: { error?: string; message?: string; retryAfter?: number } = {}
  try {
    info = await res.json()
  } catch {
    /* not JSON */
  }
  const ra = Number(res.headers.get('retry-after') ?? info.retryAfter)
  throw new AiError(
    info.message ?? `The AI service returned ${res.status}.`,
    info.error ?? 'http',
    res.status,
    Number.isFinite(ra) && ra > 0 ? ra : null,
  )
}

/** Retries network errors, 5xx and short rate limits; never daily-quota or bad-request errors. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const retries = opts.retries ?? 2
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const retryable =
        e instanceof AiError &&
        (e.code === 'network' || e.status >= 500 || e.code === 'rate' || e.code === 'upstream_busy')
      if (!retryable || attempt >= retries || opts.signal?.aborted) throw e
      const wait = e.retryAfter ? Math.min(8_000, e.retryAfter * 1000) : 800 * 2 ** attempt
      await sleep(wait)
    }
  }
}

export interface GmRequest {
  question: string
  history: { role: 'user' | 'assistant'; text: string }[]
  facts: Fact[]
  league: { name: string; week: number }
}

/** Streams an AI Fantasy GM answer; resolves with the full text. */
export async function streamGm(
  req: GmRequest,
  opts: { token: string; signal?: AbortSignal; onText: (delta: string) => void },
): Promise<{ text: string; stop: string | null }> {
  const res = await call('/api/gm', { ...req, facts: factPayload(req.facts) }, opts.token, opts.signal)
  const reader = res.body?.getReader()
  if (!reader) throw new AiError('The AI service sent no answer.', 'empty', 502)
  const dec = new TextDecoder()
  let buf = ''
  let text = ''
  let stop: string | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let cut: number
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, cut)
      buf = buf.slice(cut + 2)
      const event = /^event: (.*)$/m.exec(frame)?.[1]
      const data = /^data: (.*)$/m.exec(frame)?.[1]
      if (!event || !data) continue
      const payload = JSON.parse(data)
      if (event === 'text') {
        text += payload.t
        opts.onText(payload.t)
      } else if (event === 'done') stop = payload.stop ?? null
      else if (event === 'error') throw new AiError(payload.message ?? 'The answer failed.', payload.code ?? 'upstream', 502)
    }
  }
  if (stop === 'refusal') throw new AiError('The AI declined to answer this question.', 'refused', 422)
  return { text, stop }
}

export interface Usage {
  chat: { used: number; limit: number }
  resetsInSeconds: number
}

export async function getUsage(token: string, signal?: AbortSignal): Promise<Usage> {
  const res = await call('/api/usage', null, token, signal, 'GET')
  return res.json()
}
