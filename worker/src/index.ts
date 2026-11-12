import Anthropic from '@anthropic-ai/sdk'

import {
  BadRequest,
  charge,
  corsHeaders,
  allowedOrigin,
  factsBlock,
  GM_SYSTEM,
  MAX,
  readLimits,
  sse,
  tokenOk,
  usageFor,
  validateChat,
  type KV,
} from './logic'

/* GameplanBlitz AI Worker. Holds the Anthropic API key (a Worker secret) and runs:
     POST /api/gm     AI Fantasy GM answer, streamed as server-sent events
     GET  /api/usage  today's usage and limits for the caller
   Only facts the app sends are used; the Worker stores no league data. */

export interface Env {
  ANTHROPIC_API_KEY: string
  /** optional: callers must send this in x-gb-token */
  ACCESS_TOKEN?: string
  /** comma-separated origins allowed to call the Worker */
  ALLOWED_ORIGINS: string
  /** defaults to claude-opus-5-5 */
  AI_MODEL?: string
  USAGE: KV
  [k: string]: unknown
}

const DEFAULT_MODEL = 'claude-opus-5-5'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

const json = (body: unknown, status: number, headers: Record<string, string>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers, ...extra },
  })

async function readBody(req: Request): Promise<unknown> {
  const text = await req.text()
  if (text.length > MAX.bodyBytes) throw new BadRequest('request is too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new BadRequest('body is not JSON')
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const origin = allowedOrigin(req.headers.get('origin'), env.ALLOWED_ORIGINS ?? '')
    if (!origin) return new Response('origin not allowed', { status: 403 })
    const cors = corsHeaders(origin)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (!tokenOk(req.headers.get('x-gb-token'), env.ACCESS_TOKEN))
      return json({ error: 'unauthorized', message: 'Missing or wrong access token.' }, 401, cors)

    const who = req.headers.get('cf-connecting-ip') ?? 'unknown'
    const limits = readLimits(env)
    const spend = async () => {
      const c = await charge(env.USAGE, who, limits, Date.now())
      if (c.ok) return null
      const message =
        c.reason === 'rate'
          ? 'Too many requests this minute.'
          : c.reason === 'quota'
            ? 'Daily limit reached for this feature.'
            : 'The service has reached its daily budget.'
      return json({ error: c.reason, message, retryAfter: c.retryAfter }, 429, cors, {
        'retry-after': String(c.retryAfter),
      })
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/usage')
        return json(await usageFor(env.USAGE, who, limits, Date.now()), 200, cors)

      if (req.method !== 'POST') return json({ error: 'not_found' }, 404, cors)

      if (url.pathname === '/api/gm') {
        const body = validateChat(await readBody(req))
        const denied = await spend()
        if (denied) return denied
        return streamAnswer(env, body, req.signal, cors)
      }

      return json({ error: 'not_found' }, 404, cors)
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: 'bad_request', message: e.message }, 400, cors)
      if (e instanceof Anthropic.RateLimitError)
        return json({ error: 'upstream_busy', message: 'The AI service is busy. Try again shortly.' }, 503, cors, {
          'retry-after': '20',
        })
      if (e instanceof Anthropic.APIUserAbortError) return new Response(null, { status: 499, headers: cors })
      if (e instanceof Anthropic.APIError)
        return json({ error: 'upstream', message: `The AI service returned an error (${e.status ?? 'network'}).` }, 502, cors)
      return json({ error: 'server', message: 'Something went wrong in the AI Worker.' }, 500, cors)
    }
  },
}

/** Streams the Fantasy GM's answer as server-sent events: text deltas, then done (or error). */
function streamAnswer(env: Env, body: ReturnType<typeof validateChat>, signal: AbortSignal, cors: Record<string, string>) {
  const abort = new AbortController()
  signal.addEventListener('abort', () => abort.abort())
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const send = (event: string, data: unknown) =>
    writer.write(enc.encode(sse(event, data))).catch(() => abort.abort()) // client went away

  const run = async () => {
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
      // facts first (cached across follow-ups), then the conversation, then the new question
      const [first, ...rest] = [...body.history, { role: 'user' as const, text: body.question }]
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: factsBlock(body.facts, body.league), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: first.role === 'user' ? first.text : 'Hello.' },
          ],
        },
        ...(first.role === 'assistant' ? [{ role: 'assistant' as const, content: first.text }] : []),
        ...rest.map((t) => ({ role: t.role, content: t.text })),
      ]
      const stream = client.beta.messages.stream(
        {
          model: env.AI_MODEL || DEFAULT_MODEL,
          max_tokens: 4_000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system: GM_SYSTEM,
          messages,
        },
        { signal: abort.signal },
      )
      for await (const ev of stream)
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') await send('text', { t: ev.delta.text })
      const msg = await stream.finalMessage()
      await send('done', { stop: msg.stop_reason, model: msg.model })
    } catch (e) {
      if (!abort.signal.aborted)
        await send('error', {
          code: e instanceof Anthropic.RateLimitError ? 'upstream_busy' : 'upstream',
          message: 'The AI service could not finish this answer.',
        })
    } finally {
      await writer.close().catch(() => {})
    }
  }
  void run()
  return new Response(readable, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', ...cors },
  })
}
