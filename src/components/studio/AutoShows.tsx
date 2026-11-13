import { CalendarClock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AiError, aiConfigured, podcastSubscribe, podcastUnsubscribe } from '../../lib/ai/client'
import { SHOWS } from '../../lib/ai/series'
import { useAppStore, type PodcastPrefs } from '../../store/app'
import { CARD, PAD } from '../dashboard/styles'

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="border-line bg-panel inline-flex rounded-lg border p-0.5 text-xs font-bold">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={`min-h-8 rounded-md px-2.5 ${value === v ? 'bg-select text-select-ink' : 'text-ink-2'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** Automatic weekly shows: explicit opt-in, the shows, and their style. */
export function AutoShows({ leagueId }: { leagueId: string }) {
  const prefs = useAppStore((s) => s.podcast)
  const set = useAppStore((s) => s.setPodcast)
  const username = useAppStore((s) => s.username)
  const token = useAppStore((s) => s.aiToken)
  const [server, setServer] = useState<string | null>(null)
  const was = useRef(prefs.auto)
  const key = [prefs.auto, prefs.shows.join(), prefs.length, prefs.format, prefs.tone, leagueId, username, token].join('|')
  // keep the Worker's subscription in step with these settings (only when a Worker is configured)
  useEffect(() => {
    if (!aiConfigured() || !username) return
    const turnedOff = was.current && !prefs.auto
    was.current = prefs.auto
    if (!prefs.auto && !turnedOff) return
    const t = setTimeout(() => {
      const job = prefs.auto
        ? podcastSubscribe(
            { username, leagueId, shows: prefs.shows, length: prefs.length, format: prefs.format, tone: prefs.tone, tzOffsetMinutes: -new Date().getTimezoneOffset() },
            token,
          ).then(() => 'Scheduled on the AI server: episodes are prepared even when this site is closed.')
        : podcastUnsubscribe(username, leagueId, token).then(() => 'Removed from the AI server, with its stored episodes.')
      job.then(setServer).catch((e: unknown) => setServer(e instanceof AiError ? `AI server: ${e.message}` : 'Could not reach the AI server.'))
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const toggleShow = (t: PodcastPrefs['shows'][number]) =>
    set({ shows: prefs.shows.includes(t) ? prefs.shows.filter((x) => x !== t) : [...prefs.shows, t] })
  return (
    <section aria-label="Automatic weekly shows" className={`${CARD} ${PAD} grid gap-3`}>
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <CalendarClock size={18} aria-hidden className="text-accent" /> Automatic weekly shows
      </h2>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={prefs.auto} onChange={(e) => set({ auto: e.target.checked })} className="accent-accent mt-0.5 size-4" />
        <span>
          <b>Prepare my shows automatically</b>
          <span className="text-ink-3 block text-xs">
            Off until you turn it on. Episodes are written from your league data with the built-in writer and saved only in this
            browser. Today they are prepared when you open GamePlanBitz;{' '}
            {aiConfigured()
              ? 'the AI server can also prepare them on schedule once its scheduled job is deployed.'
              : 'preparing them while the site is closed needs the AI server (not set up on this site).'}
          </span>
        </span>
      </label>
      <fieldset disabled={!prefs.auto} className="grid gap-3 disabled:opacity-50">
        <legend className="sr-only">Show settings</legend>
        <ul className="grid gap-1.5 text-sm">
          {SHOWS.map((s) => (
            <li key={s.type}>
              <label className="flex items-center gap-2.5">
                <input type="checkbox" checked={prefs.shows.includes(s.type as never)} onChange={() => toggleShow(s.type as PodcastPrefs['shows'][number])} className="accent-accent size-4" />
                <span className="min-w-0 flex-1">
                  <b>{s.series}</b>
                  <span className="text-ink-3"> · {s.when}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Choice label="Length" value={prefs.length} options={[['short', 'Short'], ['standard', 'Standard']]} onChange={(v) => set({ length: v })} />
          <Choice label="Hosts" value={prefs.format} options={[['solo', 'One host'], ['debate', 'Two hosts']]} onChange={(v) => set({ format: v })} />
          <Choice label="Style" value={prefs.tone} options={[['straight', 'Analytical'], ['humor', 'Fun + trash talk']]} onChange={(v) => set({ tone: v })} />
        </div>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={prefs.banner} onChange={(e) => set({ banner: e.target.checked })} className="accent-accent size-4" />
          Show &ldquo;Your Weekly Fantasy Briefing Is Ready&rdquo; on the dashboard
        </label>
      </fieldset>
      {server && (
        <p role="status" className="text-ink-2 text-xs font-semibold">
          {server}
        </p>
      )}
      <p className="text-ink-3 text-xs">
        Shows follow the NFL schedule&apos;s dates: the Weekly Review two days before the week&apos;s first game, The Game Plan on its
        first game day, the Kickoff Briefing the morning of the first weekend games. Sleeper publishes no kickoff times or official
        inactives, so the briefing never claims them. Private by default; delete episodes any time.
      </p>
    </section>
  )
}
