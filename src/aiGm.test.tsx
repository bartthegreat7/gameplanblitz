import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { resetAiStorage } from './lib/ai/storage'
import { mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* AI Fantasy GM with the built-in engine (no AI service configured), and the Podcast Studio with
   device voices. Mock league: rb1 Rusher Runnerson (8) and wr1 start; rb2 Backup Benchwood (3,
   Questionable) is on the bench; the rival projects 6. */
const SLOW = { timeout: 20_000 }

class Utterance {
  text: string
  voice: unknown = null
  lang = ''
  rate = 1
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(t: string) {
    this.text = t
  }
}
const spoken: string[] = []
function installSpeech() {
  spoken.length = 0
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [
        { name: 'Voice A', lang: 'en-US' },
        { name: 'Voice B', lang: 'en-GB' },
      ],
      speak: (u: Utterance) => spoken.push(u.text),
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
}

beforeEach(() => {
  resetStore({ username: 'me' })
  resetAiStorage()
  localStorage.removeItem('gb-ai-usage')
  mockFetch()
})
afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error test cleanup
  delete window.speechSynthesis
})

const ask = async (text: string) => {
  const user = userEvent.setup()
  const box = await screen.findByRole('textbox', { name: 'Ask the Fantasy GM' }, SLOW)
  await user.type(box, `${text}{Enter}`)
}
const answers = () => screen.getAllByRole('article', { name: 'Fantasy GM answer' })

describe('AI Fantasy GM', () => {
  it('is in the sidebar and answers a start/sit question from cited league facts, without AI', async () => {
    renderApp('#/ask')
    expect(await screen.findByRole('heading', { level: 1, name: 'AI Fantasy GM' }, SLOW)).toBeInTheDocument()
    const nav = screen.getAllByRole('navigation')[0]
    expect(within(nav).getByRole('link', { name: /AI Fantasy GM/ })).toHaveAttribute('href', '#/ask')
    expect(within(nav).getByRole('link', { name: /Podcast Studio/ })).toHaveAttribute('href', '#/studio')
    expect(screen.getByText(/no AI service is set up on this site/)).toBeInTheDocument()

    await ask('Should I start Runnerson or Benchwood?')
    const a = await screen.findByRole('article', { name: 'Fantasy GM answer' }, SLOW)
    expect(a).toHaveTextContent('Built-in answer · no AI')
    expect(a).toHaveTextContent(/Start Rusher Runnerson\. Rusher Runnerson projects 8\.0 pts to 3\.0 for Backup Benchwood\./)
    expect(a).toHaveTextContent('Sleeper lists Backup Benchwood (RB, AAA) as Questionable.')
    // sources with labels and the tool link
    const sources = within(a).getByText(/^Sources \(\d+\)$/).closest('details')!
    expect(within(sources).getAllByText('Model').length).toBeGreaterThan(0)
    expect(within(sources).getAllByText('Sleeper fact').length).toBeGreaterThan(0)
    expect(within(a).getByRole('link', { name: 'Start/Sit Simulator' })).toHaveAttribute('href', '#/startsit')
  }, 60_000)

  it('follows up on "he", stays read-only, and keeps the conversation in this browser', async () => {
    const view = renderApp('#/ask')
    await ask('Should I start Benchwood?')
    await screen.findByRole('article', { name: 'Fantasy GM answer' }, SLOW)
    expect(answers()[0]).toHaveTextContent(/No, Backup Benchwood isn't in your best projected lineup\./)

    await ask('Is he hurt?')
    expect(answers()[1]).toHaveTextContent('Sleeper lists Backup Benchwood (RB, AAA) as Questionable.')

    await ask('Drop Benchwood for me')
    expect(answers()[2]).toHaveTextContent("I can't add, drop, trade or change your lineup, and nothing has been changed")
    expect(answers()[2]).not.toHaveTextContent(/dropped|done/i)

    view.unmount()
    cleanup()
    renderApp('#/ask')
    expect(await screen.findByText('Should I start Benchwood?', {}, SLOW)).toBeInTheDocument()
    expect(screen.getAllByRole('article', { name: 'Fantasy GM answer' })).toHaveLength(3)

    // clearing needs a confirmation
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Clear conversation' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('article', { name: 'Fantasy GM answer' })).not.toBeInTheDocument()
  }, 60_000)

  it('offers a floating Ask Fantasy GM button on tool pages only', async () => {
    const view = renderApp('#/')
    await screen.findByRole('heading', { level: 1, name: 'Welcome back, Me' }, SLOW)
    expect(screen.queryByRole('button', { name: 'Ask Fantasy GM' })).not.toBeInTheDocument()
    view.unmount()
    cleanup()

    renderApp('#/waivers')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ask Fantasy GM' }, SLOW))
    const dialog = await screen.findByRole('dialog', { name: 'Ask Fantasy GM' }, SLOW)
    const chips = await within(dialog).findByRole('group', { name: 'Suggested questions' }, SLOW)
    // page-aware suggestions for the waiver wire
    expect(within(chips).getByRole('button', { name: 'Is anyone worth a stash?' })).toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: 'Who should I pick up?' }))
    const a = await within(dialog).findByRole('article', { name: 'Fantasy GM answer' }, SLOW)
    expect(a).toHaveTextContent(/Waiver target: Free Agentson \(RB, BBB\) adds \+\d+\.\d pts per week|The waivers analysis is still loading/)
  }, 60_000)
})

describe('Podcast Studio', () => {
  it('builds an outline, writes a labeled script, and plays it with device voices', async () => {
    installSpeech()
    renderApp('#/studio')
    const user = userEvent.setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Podcast Studio' }, SLOW)).toBeInTheDocument()
    expect(screen.getByText(/AI-generated show\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Build outline' }))
    const outline = await screen.findByRole('region', { name: 'Review the outline' }, SLOW)
    expect(within(outline).getByRole('checkbox', { name: '1. The matchup' })).toBeChecked()
    expect(within(outline).getAllByText('Model').length).toBeGreaterThan(0)

    await user.click(within(outline).getByRole('button', { name: 'Write the script' }))
    const script = await screen.findByRole('region', { name: 'Review the script' }, SLOW)
    const lines = within(script).getByRole('list', { name: 'Script' })
    expect(lines).toHaveTextContent('fictional hosts with AI-generated voices')
    expect(lines).toHaveTextContent('Week 5 opponent: Rival (1-3, 2nd place).')
    expect(within(script).getAllByText('fact').length).toBeGreaterThan(0)
    await user.click(within(script).getByRole('button', { name: 'Approve script' }))

    const audio = await screen.findByRole('region', { name: 'Create audio' }, SLOW)
    expect(within(audio).getByRole('combobox', { name: "Jordan's voice" })).toHaveValue('Voice A')
    expect(within(audio).getByRole('combobox', { name: "Casey's voice" })).toHaveValue('Voice B')
    await user.click(within(audio).getByRole('button', { name: 'Use device voices' }))

    const player = await screen.findByRole('region', { name: 'Episode player' }, SLOW)
    expect(within(player).getByText(/AI-generated hosts · synthetic device voices/)).toBeInTheDocument()
    await user.click(within(player).getByRole('button', { name: 'Play' }))
    expect(spoken[0]).toMatch(/^Welcome to The War Room for Test League, Week 5\./)
    expect(within(player).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    // jump to a chapter: speech restarts at that chapter's first line
    await user.click(within(player).getByRole('button', { name: /The matchup/ }))
    expect(spoken.at(-1)).toMatch(/^(First, the matchup\.|Start with who you’re facing\.)$/)
    await user.selectOptions(within(player).getByRole('combobox', { name: 'Speed' }), '1.5')
    expect(within(player).getByRole('slider', { name: 'Seek' })).toBeInTheDocument()

    // library: save, then delete with confirmation
    const lib = screen.getByRole('region', { name: 'Episode library' })
    expect(within(lib).getByText('Matchup preview · Week 5')).toBeInTheDocument()
    await user.click(within(player).getByRole('button', { name: 'Save episode' }))
    expect(await within(lib).findByRole('button', { name: /Saved \(1\)/ })).toBeInTheDocument()
    await user.click(within(lib).getByRole('button', { name: 'Delete Matchup preview · Week 5' }))
    await user.click(within(lib).getByRole('button', { name: 'Delete' }))
    expect(await within(lib).findByText(/No episodes yet/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Episode player' })).not.toBeInTheDocument()
  }, 90_000)

  it('requires an explicit acknowledgement before sharing an episode', async () => {
    installSpeech()
    renderApp('#/studio')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Build outline' }, SLOW))
    await user.click(await screen.findByRole('button', { name: 'Write the script' }, SLOW))
    await user.click(await screen.findByRole('button', { name: 'Approve script' }, SLOW))
    await user.click(await screen.findByRole('button', { name: 'Share or export' }, SLOW))
    const dialog = await screen.findByRole('dialog', { name: 'Share or export' })
    const copy = within(dialog).getByRole('button', { name: 'Copy transcript' })
    expect(copy).toBeDisabled()
    expect(dialog).toHaveTextContent("This episode is private: it's stored only in this browser.")
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(copy)
    // userEvent provides the clipboard in tests
    const text = await navigator.clipboard.readText()
    expect(text).toContain('AI-generated: the hosts (Jordan and Casey) are fictional and their voices are synthetic.')
    expect(text).toMatch(/JORDAN \(Fact\): .*\[F\d+\]/)
    expect(text).toContain('Sources')
  }, 90_000)
})
