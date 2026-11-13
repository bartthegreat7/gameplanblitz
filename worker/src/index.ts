import Anthropic from '@anthropic-ai/sdk'

import {
  BadRequest,
  charge,
  cleanScript,
  corsHeaders,
  allowedOrigin,
  factsBlock,
  GM_SYSTEM,
  MAX,
  readLimits,
  SCRIPT_SCHEMA,
  SCRIPT_SYSTEM,
  scriptPrompt,
  sse,
  tokenOk,
  usageFor,
  validateChat,
  validateScript,
  validateTts,
  type Kind,
  type KV,
} from './logic'
import {
  episodeStoreKey,
  indexKey,
  listEpisodesFor,
  runScheduled,
  subKey,
  unsubscribe,
  validateSubscription,
  type JobKV,
  type Subscription,
} from './podcastJob'

/* GameplanBlitz AI Worker. Holds the Anthropic API key (a Worker secret) and runs:
     POST /api/gm             AI Fantasy GM answer, streamed as server-sent events
     POST /api/studio/script  podcast script (JSON) from an approved outline
     POST /api/studio/tts     one line of speech (audio/mpeg), Deepgram Aura on Workers AI
     GET  /api/usage          today's usage and limits for the caller
     POST /api/podcast/subscribe    opt in to scheduled Fantasy War Room episodes
     POST /api/podcast/unsubscribe  opt out (deletes the subscription and its episodes)
     GET  /api/podcast/episodes     the subscriber's private episodes
     POST /api/podcast/delete       delete one episode
   and, on its Cron Trigger, the scheduled podcast job (podcastJob.ts).
   Only facts the app sends are used; the Worker stores no league data. */

interface AiBinding {
  run(model: string, input: Record<string, unknown>, opts?: { returnRawResponse?: boolean }): Promise<unknown>
}

export interface Env {
  ANTHROPIC_API_KEY: string
  /** optional: callers must send this in x-gb-token */
  ACCESS_TOKEN?: string
  /** comma-separated origins allowed to call the Worker */
  ALLOWED_ORIGINS: string
  /** defaults to claude-opus-5-5 */
  AI_MODEL?: string
  AI: AiBinding
  USAGE: KV
  /** scheduled podcasts: subscriptions, job records and private episodes */
  EPISODES: JobKV
  [k: string]: unknown
}

const DEFAULT_MODEL = 'claude-opus-5-5'
const TTS_MODEL = '@cf/deepgram/aura-1'
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

const SLEEPER = 'https://api.sleeper.app/v1'

/** The Sleeper user id for a username, if that user is a member of the league. */
async function memberId(username: string, leagueId: string): Promise<string | null> {
  const u = await fetch(`${SLEEPER}/user/${encodeURIComponent(username)}`)
  const user = u.ok ? ((await u.json()) as { user_id?: string } | null) : null
  if (!user?.user_id) return null
  const r = await fetch(`${SLEEPER}/league/${encodeURIComponent(leagueId)}/users`)
  const members = r.ok ? ((await r.json()) as { user_id: string }[]) : []
  return members.some((m) => m.user_id === user.user_id) ? user.user_id : null
}

async function podcastRoute(req: Request, url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  // episodes are private: without an access token anyone who knew a username could read them
  if (!env.ACCESS_TOKEN)
    return json({ error: 'not_configured', message: 'Scheduled podcasts need an ACCESS_TOKEN on the Worker.' }, 403, cors)
  if (req.method === 'GET' && url.pathname === '/api/podcast/episodes') {
    const id = await memberId(url.searchParams.get('username') ?? '', url.searchParams.get('leagueId') ?? '')
    if (!id) return json({ error: 'not_found', message: 'That Sleeper user is not in this league.' }, 404, cors)
    return json({ episodes: await listEpisodesFor(env.EPISODES, url.searchParams.get('leagueId')!, id) }, 200, cors)
  }
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404, cors)
  const body = (await readBody(req)) as Record<string, unknown>
  if (url.pathname === '/api/podcast/subscribe') {
    const s = validateSubscription(body)
    const id = await memberId(s.username, s.leagueId)
    if (!id) return json({ error: 'not_found', message: 'That Sleeper user is not in this league.' }, 404, cors)
    const sub: Subscription = { ...s, userId: id, createdAt: Date.now() }
    await env.EPISODES.put(subKey(s.leagueId, id), JSON.stringify(sub))
    return json({ ok: true, shows: sub.shows }, 200, cors)
  }
  const username = String(body.username ?? '')
  const leagueId = String(body.leagueId ?? '')
  const id = await memberId(username, leagueId)
  if (!id) return json({ error: 'not_found', message: 'That Sleeper user is not in this league.' }, 404, cors)
  if (url.pathname === '/api/podcast/unsubscribe') {
    await unsubscribe(env.EPISODES, leagueId, id)
    return json({ ok: true }, 200, cors)
  }
  if (url.pathname === '/api/podcast/delete') {
    const epId = String(body.id ?? '')
    await env.EPISODES.delete(episodeStoreKey(leagueId, id, epId))
    const index = JSON.parse((await env.EPISODES.get(indexKey(leagueId, id))) ?? '[]') as string[]
    await env.EPISODES.put(indexKey(leagueId, id), JSON.stringify(index.filter((x) => x !== epId)))
    return json({ ok: true }, 200, cors)
  }
  return json({ error: 'not_found' }, 404, cors)
}

interface WaitUntil {
  waitUntil(p: Promise<unknown>): void
}

export default {
  /** Cron Trigger (wrangler.toml): prepares due Fantasy War Room episodes, no browser involved. */
  async scheduled(_event: unknown, env: Env, ctx: WaitUntil): Promise<void> {
    ctx.waitUntil(
      runScheduled(env.EPISODES, Date.now()).then((results) => console.log(JSON.stringify({ job: 'podcast', results }))),
    )
  },

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
    const spend = async (kind: Kind, amount: number) => {
      const c = await charge(env.USAGE, who, kind, amount, limits, Date.now())
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
      if (url.pathname.startsWith('/api/podcast/')) return await podcastRoute(req, url, env, cors)

      if (req.method === 'GET' && url.pathname === '/api/usage')
        return json(await usageFor(env.USAGE, who, limits, Date.now()), 200, cors)

      if (req.method !== 'POST') return json({ error: 'not_found' }, 404, cors)

      if (url.pathname === '/api/gm') {
        const body = validateChat(await readBody(req))
        const denied = await spend('chat', 1)
        if (denied) return denied
        return streamAnswer(env, body, req.signal, cors)
      }

      if (url.pathname === '/api/studio/script') {
        const body = validateScript(await readBody(req))
        const denied = await spend('scripts', 1)
        if (denied) return denied
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
        const stream = client.beta.messages.stream(
          {
            model: env.AI_MODEL || DEFAULT_MODEL,
            max_tokens: 16_000,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCRIPT_SCHEMA } },
            system: SCRIPT_SYSTEM,
            messages: [{ role: 'user', content: scriptPrompt(body) }],
          },
          { signal: req.signal },
        )
        const msg = await stream.finalMessage()
        if (msg.stop_reason === 'refusal')
          return json({ error: 'refused', message: 'The model declined to write this script.' }, 422, cors)
        if (msg.stop_reason === 'max_tokens')
          return json({ error: 'too_long', message: 'The script ran too long. Try a shorter episode.' }, 422, cors)
        const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
        const lines = cleanScript(JSON.parse(text), body)
        return json({ lines, model: msg.model }, 200, cors)
      }

      if (url.pathname === '/api/studio/tts') {
        const body = validateTts(await readBody(req))
        const denied = await spend('ttsChars', body.text.length)
        if (denied) return denied
        const res = (await env.AI.run(
          TTS_MODEL,
          { text: body.text, speaker: body.voice, encoding: 'mp3' },
          { returnRawResponse: true },
        )) as Response
        if (!res.ok) return json({ error: 'tts_failed', message: 'Speech generation failed.' }, 502, cors)
        return new Response(res.body, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', ...cors },
        })
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
