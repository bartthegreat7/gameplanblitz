import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { resetAiStorage } from './lib/ai/storage'
import { mockFetch, renderApp, resetStore, type Routes } from './test/mockSleeper'

/* The AI features with a (mocked) GameplanBlitz AI Worker configured. */
vi.hoisted(() => vi.stubEnv('VITE_AI_API', 'https://ai.test'))

const SLOW = { timeout: 20_000 }
const sse = (frames: [string, unknown][]) => () =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder()
        for (const [e, d] of frames) c.enqueue(enc.encode(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`))
        c.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )

let calls: { url: string; body: Record<string, unknown> | null; token: string | null }[] = []
function withWorker(routes: Routes) {
  const fn = mockFetch(routes)
  const inner = fn.getMockImplementation()!
  calls = []
  fn.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://ai.test'))
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
        token: (init?.headers as Record<string, string> | undefined)?.['x-gb-token'] ?? null,
      })
    return inner(input)
  })
}

beforeEach(() => {
  resetStore({ username: 'me', aiToken: 'tok' })
  resetAiStorage()
  localStorage.removeItem('gb-ai-usage')
})
afterEach(() => vi.unstubAllGlobals())

describe('AI Fantasy GM with the AI service', () => {
  it('asks for consent, streams a cited answer and flags numbers it cannot verify', async () => {
    withWorker({
      '/api/gm': sse([
        ['text', { t: 'You face Rival this week [F1].\n\n' }],
        ['text', { t: 'My take: Rival scored 99 points [F1].' }],
        ['done', { stop: 'end_turn' }],
      ]),
    })
    renderApp('#/ask')
    const user = userEvent.setup()
    const engine = await screen.findByRole('group', { name: 'Answer engine' }, SLOW)
    await user.click(within(engine).getByRole('button', { name: 'AI (Claude)' }))
    const consent = screen.getByRole('region', { name: 'Allow the AI service' })
    expect(consent).toHaveTextContent("Anthropic's Claude API")
    await user.click(within(consent).getByRole('button', { name: 'Allow' }))
    expect(within(engine).getByRole('button', { name: 'AI (Claude)' })).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByRole('textbox', { name: 'Ask the Fantasy GM' }), 'Who am I playing?{Enter}')
    const a = await screen.findByRole('article', { name: 'Fantasy GM answer' }, SLOW)
    await within(a).findByText('You face Rival this week.', {}, SLOW)
    expect(a).toHaveTextContent('AI answer · Claude')
    expect(a).toHaveTextContent("Unverified: Couldn't verify 99 against the cited facts.")
    expect(within(a).getByText(/^Sources \(1\)$/)).toBeInTheDocument()

    const req = calls.find((c) => c.url.endsWith('/api/gm'))!
    expect(req.token).toBe('tok')
    expect(req.body).toMatchObject({ question: 'Who am I playing?', league: { name: 'Test League', week: 5 } })
    const facts = req.body!.facts as Record<string, unknown>[]
    expect(facts[0]).toEqual({ id: 'F1', topic: 'matchup', kind: 'fact', text: 'Week 5 opponent: Rival (1-3, 2nd place).', source: 'Sleeper matchups', asOf: expect.any(Number) })
    expect(Object.keys(facts[0])).not.toContain('players')
  }, 60_000)

  it('recovers from a failed AI answer with a built-in one', async () => {
    resetStore({ username: 'me', aiConsent: true })
    withWorker({ '/api/gm': () => new Response(JSON.stringify({ error: 'quota', message: 'Daily limit reached for this feature.' }), { status: 429 }) })
    renderApp('#/ask')
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'Ask the Fantasy GM' }, SLOW), 'Should I start Benchwood?{Enter}')
    const a = await screen.findByRole('article', { name: 'Fantasy GM answer' }, SLOW)
    await within(a).findByText('Daily limit reached for this feature.', {}, SLOW)
    expect(calls.filter((c) => c.url.endsWith('/api/gm'))).toHaveLength(1) // quotas are not retried
    await user.click(within(a).getByRole('button', { name: 'Answer without AI' }))
    const b = await screen.findByRole('article', { name: 'Fantasy GM answer' }, SLOW)
    expect(b).toHaveTextContent('Built-in answer · no AI')
    expect(b).toHaveTextContent(/No, Backup Benchwood isn't in your best projected lineup\./)
  }, 60_000)
})
