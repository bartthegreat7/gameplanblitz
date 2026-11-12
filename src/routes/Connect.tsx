import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { getUser } from '../lib/sleeper'
import { useAppStore } from '../store/app'

export default function Connect() {
  const navigate = useNavigate()
  const setUsername = useAppStore((s) => s.setUsername)
  const current = useAppStore((s) => s.username)
  const [value, setValue] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const name = value.trim().replace(/^@/, '')
    if (!name) return setError('Enter your username first.')
    setBusy(true)
    setError(null)
    try {
      const user = await getUser(name)
      if (!user?.user_id) throw new Error('not-found')
      setUsername(name)
      navigate('/')
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'not-found'
          ? `Couldn't find “${name}” on Sleeper. Check the spelling and try again.`
          : "Couldn't reach Sleeper. Check your connection and try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto mt-8 max-w-md text-center">
      <h1 className="mb-1.5 text-2xl font-extrabold">Connect your Sleeper team</h1>
      <p className="text-ink-2 mb-5">
        Type your Sleeper username. GameplanBlitz pulls your leagues, lineups and projections live — nothing is posted back.
      </p>
      <form onSubmit={submit} className="flex flex-wrap gap-2.5">
        <label htmlFor="username" className="sr-only">
          Sleeper username
        </label>
        <input
          id="username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          placeholder="Sleeper username"
          aria-invalid={!!error}
          aria-describedby={error ? 'username-error' : undefined}
          className="border-line bg-card min-w-44 flex-1 rounded-2xl border px-4 py-4 text-lg"
        />
        <button type="submit" disabled={busy} className="bg-accent text-accent-ink rounded-2xl px-6 py-4 font-extrabold disabled:opacity-60">
          {busy ? 'Checking…' : 'Blitz it'}
        </button>
      </form>
      <p id="username-error" role="alert" className="text-bad mt-3 min-h-5 text-sm">
        {error}
      </p>
      <p className="text-ink-3 mt-3 text-sm">Same username you log into the Sleeper app with.</p>
    </section>
  )
}
