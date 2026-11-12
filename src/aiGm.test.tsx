import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { resetAiStorage } from './lib/ai/storage'
import { mockFetch, renderApp, resetStore } from './test/mockSleeper'

/* AI Fantasy GM with the built-in engine (no AI service configured). Mock league: rb1 Rusher
   Runnerson (8) and wr1 start; rb2 Backup Benchwood (3, Questionable) is on the bench; the rival
   projects 6. */
const SLOW = { timeout: 20_000 }

beforeEach(() => {
  resetStore({ username: 'me' })
  resetAiStorage()
  localStorage.removeItem('gb-ai-usage')
  mockFetch()
})
afterEach(() => vi.unstubAllGlobals())

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
    expect(within(nav).queryByRole('link', { name: /Podcast Studio/ })).not.toBeInTheDocument()
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
