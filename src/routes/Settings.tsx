import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Modal } from '../components/ui/Overlay'
import { Segmented } from '../components/ui/Segmented'
import { useRefreshPlayers } from '../hooks/useLeagueData'
import { NEWS_API, newsSource } from '../lib/news'
import { useAppStore, type Theme } from '../store/app'

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-card rounded-3xl border p-5">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {hint && <p className="text-ink-3 mt-0.5 mb-3 text-sm">{hint}</p>}
      {children}
    </section>
  )
}

export default function Settings() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = (t: Theme) => {
    if (t !== theme) useAppStore.getState().toggleTheme()
  }
  const username = useAppStore((s) => s.username)
  const signOut = useAppStore((s) => s.signOut)
  const refreshAll = useRefreshPlayers()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const newsHost = (() => {
    try {
      return new URL(NEWS_API).host
    } catch {
      return NEWS_API
    }
  })()

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>

      <Row title="Theme">
        <Segmented
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </Row>

      <Row title="Refresh data" hint="Reload your league, projections and trade values. The NFL player list is cached for 24 hours; this also re-downloads it.">
        <button
          type="button"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            try {
              await refreshAll()
            } finally {
              setRefreshing(false)
            }
          }}
          className="border-line bg-panel rounded-xl border px-4 py-2.5 font-bold disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh everything'}
        </button>
      </Row>

      <Row title="Account" hint={username ? `Connected as ${username}. Read-only: GameplanBlitz never writes to your league.` : 'Not connected.'}>
        {username ? (
          <button type="button" onClick={() => setConfirm(true)} className="border-bad/40 text-bad rounded-xl border px-4 py-2.5 font-bold">
            Sign out
          </button>
        ) : (
          <button type="button" onClick={() => navigate('/connect')} className="bg-accent text-accent-ink rounded-xl px-4 py-2.5 font-extrabold">
            Connect Sleeper
          </button>
        )}
      </Row>

      <Row title="News feed" hint="Publisher feeds are collected server-side; the browser never contacts publishers directly.">
        <p className="text-sm">
          {newsSource === 'worker' ? (
            <>
              Connected to <b>{newsHost}</b>
            </>
          ) : (
            <>
              Built in: feeds are collected every 2 hours when the site deploys. See the publisher list on the News &amp; Articles page.
            </>
          )}
        </p>
      </Row>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Sign out?">
        <p className="text-ink-2">This forgets your Sleeper username and selected league in this browser. Your theme and saved articles are kept.</p>
        <div className="mt-4 flex gap-2.5">
          <button type="button" onClick={() => setConfirm(false)} className="border-line bg-panel flex-1 rounded-xl border py-2.5 font-bold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              signOut()
              setConfirm(false)
              navigate('/connect')
            }}
            className="bg-bad text-bad-ink flex-1 rounded-xl py-2.5 font-extrabold"
          >
            Sign out
          </button>
        </div>
      </Modal>
    </div>
  )
}
