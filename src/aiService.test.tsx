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

describe('Podcast Studio with the AI service', () => {
  it('flags unverifiable AI lines, then makes AI-voice audio and retries a failed line', async () => {
    resetStore({ username: 'me', aiConsent: true })
    let failOnce = true
    withWorker({
      '/api/studio/script': {
        lines: [
          { speaker: 'A', kind: 'fact', chapter: 'matchup', text: 'You draw Rival this week.', cite: ['F1'] },
          { speaker: 'B', kind: 'opinion', chapter: 'matchup', text: 'They will score 140, trust me.', cite: [] },
          { speaker: 'B', kind: 'banter', chapter: 'matchup', text: 'Big week for the Gang.', cite: [] },
        ],
      },
      '/api/studio/tts': () => {
        if (failOnce) {
          failOnce = false
          return new Response(JSON.stringify({ error: 'bad_request', message: 'text is too long' }), { status: 400 })
        }
        return new Response('ID3-mp3-bytes', { headers: { 'content-type': 'audio/mpeg' } })
      },
    })
    renderApp('#/studio')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'AI (Claude)' }, SLOW))
    await user.click(screen.getByRole('button', { name: 'Build outline' }))
    await user.click(await screen.findByRole('button', { name: 'Write the script' }, SLOW))

    const script = await screen.findByRole('region', { name: 'Review the script' }, SLOW)
    expect(script).toHaveTextContent('Written by AI (Claude) and checked against your facts.')
    expect(script).toHaveTextContent("Couldn't verify 140 against the cited facts.")
    // the app adds the disclosures itself
    expect(within(script).getAllByText('disclosure')).toHaveLength(2)
    const approve = within(script).getByRole('button', { name: 'Approve script' })
    expect(approve).toBeDisabled()
    await user.click(within(script).getByRole('button', { name: 'Remove all flagged' }))
    expect(approve).toBeEnabled()
    const req = calls.find((c) => c.url.endsWith('/api/studio/script'))!
    expect(req.body).toMatchObject({ type: 'preview', format: 'debate', hosts: ['Jordan', 'Casey'], targetLines: 34 })
    await user.click(approve)

    const audio = await screen.findByRole('region', { name: 'Create audio' }, SLOW)
    expect(within(audio).getByRole('combobox', { name: "Jordan's voice" })).toHaveValue('orion')
    await user.click(within(audio).getByRole('button', { name: 'Create AI audio' }))
    expect(await within(audio).findByText('1 line failed.', {}, SLOW)).toBeInTheDocument()
    await user.click(within(audio).getByRole('button', { name: 'Retry 1 failed line' }))

    const player = await screen.findByRole('region', { name: 'Episode player' }, SLOW)
    await within(player).findByText(/AI-generated hosts · AI voices \(Deepgram Aura\) · AI-written script/, {}, SLOW)
    const tts = calls.filter((c) => c.url.endsWith('/api/studio/tts'))
    expect(tts).toHaveLength(5) // 4 lines + 1 retry
    expect(tts.map((c) => c.body!.voice).sort()).toEqual(['asteria', 'orion', 'orion', 'orion', 'orion'])
    expect(String(tts[0].body!.text)).toMatch(/^Welcome to The War Room/)
    expect(within(screen.getByRole('region', { name: 'Episode library' })).getByText(/AI voices/)).toBeInTheDocument()
  }, 90_000)
})
