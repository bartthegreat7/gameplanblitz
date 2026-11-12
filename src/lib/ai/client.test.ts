import type { Fact } from './facts'

/* The AI client against a mocked Worker: streaming, cancellation, errors and retries. */

const fact: Fact = { id: 'F1', topic: 'projection', kind: 'model', text: 'X projects 8.4 pts.', source: 's', asOf: 1, players: ['x'], to: '/players/x', data: { value: 8.4 } }

async function load() {
  vi.resetModules()
  vi.stubEnv('VITE_AI_API', 'https://ai.test/')
  return import('./client')
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const sseBody = (frames: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      // split a frame across chunks to exercise buffering
      const all = frames.join('')
      c.enqueue(enc.encode(all.slice(0, 7)))
      c.enqueue(enc.encode(all.slice(7)))
      c.close()
    },
  })

describe('AI client', () => {
  it('streams an answer and sends only the allowed fact fields with the token', async () => {
    const { streamGm } = await load()
    const fetchMock = vi.fn(async () =>
      new Response(sseBody(['event: text\ndata: {"t":"Start "}\n\n', 'event: text\ndata: {"t":"him [F1]."}\n\n', 'event: done\ndata: {"stop":"end_turn"}\n\n'])),
    )
    vi.stubGlobal('fetch', fetchMock)
    const seen: string[] = []
    const r = await streamGm(
      { question: 'Start?', history: [], facts: [fact], league: { name: 'L', week: 5 } },
      { token: 'tok', onText: (t) => seen.push(t) },
    )
    expect(r).toEqual({ text: 'Start him [F1].', stop: 'end_turn' })
    expect(seen).toEqual(['Start ', 'him [F1].'])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ai.test/api/gm')
    expect((init.headers as Record<string, string>)['x-gb-token']).toBe('tok')
    const body = JSON.parse(String(init.body))
    expect(body.facts).toEqual([{ id: 'F1', topic: 'projection', kind: 'model', text: 'X projects 8.4 pts.', source: 's', asOf: 1 }])
  })

  it('turns stream errors and refusals into AiErrors', async () => {
    const { streamGm, AiError } = await load()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sseBody(['event: error\ndata: {"code":"upstream","message":"nope"}\n\n']))))
    await expect(streamGm({ question: 'q', history: [], facts: [], league: { name: 'L', week: 1 } }, { token: '', onText: () => {} })).rejects.toBeInstanceOf(AiError)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sseBody(['event: done\ndata: {"stop":"refusal"}\n\n']))))
    await expect(streamGm({ question: 'q', history: [], facts: [], league: { name: 'L', week: 1 } }, { token: '', onText: () => {} })).rejects.toMatchObject({ code: 'refused' })
  })

  it('reports quota errors with retry-after and does not retry them', async () => {
    const { getUsage, withRetry } = await load()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'quota', message: 'Daily limit reached for this feature.' }), { status: 429, headers: { 'retry-after': '3600' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(withRetry(() => getUsage(''), { sleep: async () => {} })).rejects.toMatchObject({
      code: 'quota',
      status: 429,
      retryAfter: 3600,
      message: 'Daily limit reached for this feature.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries server errors and network failures, then succeeds', async () => {
    const { getUsage, withRetry } = await load()
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++
        if (n === 1) throw new TypeError('offline')
        if (n === 2) return new Response('{}', { status: 503 })
        return new Response(JSON.stringify({ chat: { used: 1, limit: 40 }, resetsInSeconds: 5 }), { status: 200 })
      }),
    )
    const sleeps: number[] = []
    const usage = await withRetry(() => getUsage(''), { sleep: async (ms) => void sleeps.push(ms) })
    expect(usage.chat).toEqual({ used: 1, limit: 40 })
    expect(sleeps).toEqual([800, 1600])
  })

  it('passes cancellation through without retrying', async () => {
    const { getUsage, withRetry } = await load()
    const ac = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        ac.abort()
        init.signal?.throwIfAborted()
        return new Response('')
      }),
    )
    await expect(withRetry(() => getUsage('', ac.signal), { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('is off when no Worker URL is configured', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_AI_API', '')
    const { aiConfigured, getUsage } = await import('./client')
    expect(aiConfigured()).toBe(false)
    await expect(getUsage('')).rejects.toMatchObject({ code: 'not_configured' })
  })
})
