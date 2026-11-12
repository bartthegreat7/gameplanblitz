import { AlertTriangle, ArrowLeft, Check, FileText, Loader2, Plus, Podcast, Sparkles, Square, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { AiConsent } from '../components/ai/AiConsent'
import { FactRow } from '../components/ai/FactRow'
import { CARD, PAD } from '../components/dashboard/styles'
import { LeagueGate } from '../components/LeagueGate'
import { AudioStep } from '../components/studio/AudioStep'
import { EpisodePlayer } from '../components/studio/EpisodePlayer'
import { Library } from '../components/studio/Library'
import { ShareDialog } from '../components/studio/ShareDialog'
import { useFactSheet } from '../hooks/useFactSheet'
import type { Ready } from '../hooks/useLeagueData'
import { AiError, aiConfigured, requestScript, withRetry } from '../lib/ai/client'
import { episodeTitle } from '../lib/ai/episode'
import type { Fact } from '../lib/ai/facts'
import {
  buildOutline,
  checkScript,
  EPISODE_TYPES,
  flaggedCount,
  HOSTS,
  TARGET_LINES,
  writeScript,
  type EpisodeType,
  type Format,
  type Length,
  type Line,
  type Outline,
  type Tone,
} from '../lib/ai/podcast'
import { canSpend, record, remainingToday } from '../lib/ai/quota'
import { deleteEpisode, listEpisodes, newId, saveEpisode, type Episode } from '../lib/ai/storage'
import { useAppStore } from '../store/app'

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="text-ink-3 mb-1.5 text-xs font-extrabold tracking-wide uppercase">{label}</div>
      <div role="group" aria-label={label} className="border-line bg-panel inline-flex flex-wrap rounded-xl border p-0.5 text-sm font-bold">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={`min-h-9 rounded-lg px-3 ${value === o.value ? 'bg-ink text-bg' : 'text-ink-2'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const STEPS = ['Setup', 'Outline', 'Script', 'Audio'] as const

function Stepper({ at }: { at: number }) {
  return (
    <ol aria-label="Steps" className="mb-5 flex flex-wrap gap-2 text-xs font-bold">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${i === at ? 'border-accent text-accent' : i < at ? 'border-good/50 text-good' : 'border-line text-ink-3'}`}>
          {i < at ? <Check size={12} aria-hidden /> : <span>{i + 1}</span>} {s}
        </li>
      ))}
    </ol>
  )
}

const KIND_CLS: Record<Line['kind'], string> = {
  fact: 'text-good border-good/40',
  opinion: 'text-amber border-amber/40',
  banter: 'text-ink-3 border-line',
  disclosure: 'text-purple border-purple/40',
}

function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-label={title} className={`${CARD} ${PAD}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-xl font-extrabold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function StudioPage({ data }: { data: Ready }) {
  const sheet = useFactSheet(data)
  const { aiConsent, aiToken, setAi } = useAppStore()
  const configured = aiConfigured()
  const leagueId = data.league.league_id

  const [type, setType] = useState<EpisodeType>('preview')
  const [format, setFormat] = useState<Format>('debate')
  const [tone, setTone] = useState<Tone>('straight')
  const [length, setLength] = useState<Length>('standard')
  const [writer, setWriter] = useState<'built-in' | 'ai'>('built-in')
  const [askConsent, setAskConsent] = useState(false)

  const [outline, setOutline] = useState<Outline | null>(null)
  const [facts, setFacts] = useState<Fact[]>([])
  const [lines, setLines] = useState<Line[] | null>(null)
  const [scriptBy, setScriptBy] = useState<'built-in' | 'ai'>('built-in')
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [current, setCurrent] = useState<Episode | null>(null)
  const [share, setShare] = useState(false)

  const refresh = useCallback(() => listEpisodes(leagueId).then(setEpisodes), [leagueId])
  useEffect(() => {
    void refresh()
    return () => abort.current?.abort()
  }, [refresh])

  const hosts = format === 'debate' ? HOSTS : [HOSTS[0]]
  const at = current ? 3 : lines ? 2 : outline ? 1 : 0

  const reset = () => {
    abort.current?.abort()
    setOutline(null)
    setLines(null)
    setCurrent(null)
    setError(null)
  }

  const makeOutline = () => {
    setError(null)
    setFacts(sheet.facts)
    setOutline(buildOutline(type, sheet.facts, length))
  }

  const write = async () => {
    if (!outline) return
    setError(null)
    const chapters = outline.chapters.filter((c) => c.include)
    const opts = { leagueName: data.league.name, week: data.week, hosts, format }
    if (writer === 'built-in') {
      setLines(writeScript(chapters, facts, { ...opts, type, tone, seed: Date.now() % 100_000 }))
      setScriptBy('built-in')
      return
    }
    if (!canSpend('scripts')) {
      setError("You've used today's AI scripts on this device. The built-in writer still works.")
      return
    }
    const used = new Set(chapters.flatMap((c) => c.facts))
    const ac = new AbortController()
    abort.current = ac
    setWriting(true)
    try {
      record('scripts')
      const raw = await withRetry(
        () =>
          requestScript(
            {
              type,
              format,
              tone,
              hosts: hosts.map((h) => h.name),
              chapters: chapters.map(({ id, title, facts: f }) => ({ id, title, facts: f })),
              facts: facts.filter((f) => used.has(f.id)),
              league: { name: data.league.name, week: data.week },
              targetLines: TARGET_LINES[length],
            },
            { token: aiToken, signal: ac.signal },
          ),
        { signal: ac.signal },
      )
      setLines(checkScript(raw, facts, opts))
      setScriptBy('ai')
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof AiError ? e.message : 'The AI script failed. Try again or use the built-in writer.')
    } finally {
      setWriting(false)
      abort.current = null
    }
  }

  const approve = async () => {
    if (!lines || !outline) return
    const ids = new Set(lines.flatMap((l) => l.cite))
    const ep: Episode = {
      id: newId(),
      leagueId,
      leagueName: data.league.name,
      week: data.week,
      createdAt: Date.now(),
      type,
      format,
      tone,
      title: episodeTitle(type, data.week),
      hosts,
      outline: outline.chapters.filter((c) => c.include),
      lines,
      writer: scriptBy,
      facts: facts.filter((f) => ids.has(f.id)),
      factsAsOf: sheet.asOf ?? Date.now(),
      audio: null,
      saved: false,
    }
    await saveEpisode(ep)
    setCurrent(ep)
    await refresh()
  }

  const persist = async (ep: Episode) => {
    await saveEpisode(ep)
    setCurrent((c) => (c?.id === ep.id ? ep : c))
    await refresh()
  }
  const remove = async (ep: Episode) => {
    await deleteEpisode(ep.id)
    if (current?.id === ep.id) reset()
    await refresh()
  }

  const byId = new Map(facts.map((f) => [f.id, f]))
  const flagged = lines ? flaggedCount(lines) : 0

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
          <Podcast aria-hidden className="text-accent size-7" /> Podcast Studio
        </h1>
        <p className="text-ink-2 mt-1">The War Room: a private show about your team and {data.league.name}, built from your league data.</p>
        <p className="border-purple/40 bg-purple/10 text-ink-2 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm">
          <Sparkles size={16} aria-hidden className="text-purple mt-0.5 shrink-0" />
          <span>
            <b className="text-ink">AI-generated show.</b> Hosts {HOSTS[0].name} and {HOSTS[1].name} are fictional, their voices are synthetic, and they don't imitate any real broadcaster. Scripts label facts and opinions, and you approve every script before audio is made.
          </span>
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid content-start gap-4">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={reset} className="border-line bg-card inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold">
                  <Plus size={16} aria-hidden /> New episode
                </button>
              </div>
              {!current.audio && (
                <Panel title="Create audio">
                  <Stepper at={3} />
                  <AudioStep ep={current} onSaved={(e) => void persist(e)} />
                </Panel>
              )}
              <EpisodePlayer
                key={current.id}
                ep={current}
                onToggleSaved={() => void persist({ ...current, saved: !current.saved })}
                onShare={() => setShare(true)}
                onDelete={() => void remove(current)}
              />
            </>
          ) : !outline ? (
            <Panel title="New episode">
              <Stepper at={at} />
              <div role="group" aria-label="Episode type" className="mb-4 grid gap-2 sm:grid-cols-2">
                {EPISODE_TYPES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)} className={`rounded-2xl border p-3.5 text-left ${type === t.id ? 'border-accent bg-accent/10' : 'border-line bg-panel'}`}>
                    <span className="block font-extrabold">{t.label}</span>
                    <span className="text-ink-2 block text-sm">{t.blurb}</span>
                  </button>
                ))}
              </div>
              <div className="mb-5 flex flex-wrap gap-4">
                <Choice label="Hosts" value={format} onChange={setFormat} options={[{ value: 'solo', label: 'One host' }, { value: 'debate', label: 'Two-host debate' }]} />
                <Choice label="Tone" value={tone} onChange={setTone} options={[{ value: 'straight', label: 'Straight analysis' }, { value: 'humor', label: 'Humorous' }]} />
                <Choice label="Length" value={length} onChange={setLength} options={[{ value: 'short', label: 'Short' }, { value: 'standard', label: 'Standard' }]} />
                <div>
                  <div className="text-ink-3 mb-1.5 text-xs font-extrabold tracking-wide uppercase">Script writer</div>
                  <div role="group" aria-label="Script writer" className="border-line bg-panel inline-flex rounded-xl border p-0.5 text-sm font-bold">
                    <button type="button" aria-pressed={writer === 'built-in'} onClick={() => setWriter('built-in')} className={`min-h-9 rounded-lg px-3 ${writer === 'built-in' ? 'bg-ink text-bg' : 'text-ink-2'}`}>
                      Built-in
                    </button>
                    <button
                      type="button"
                      aria-pressed={writer === 'ai'}
                      disabled={!configured}
                      title={configured ? undefined : 'Needs the GameplanBlitz AI Worker'}
                      onClick={() => (aiConsent ? setWriter('ai') : setAskConsent(true))}
                      className={`min-h-9 rounded-lg px-3 disabled:opacity-40 ${writer === 'ai' ? 'bg-ink text-bg' : 'text-ink-2'}`}
                    >
                      AI (Claude)
                    </button>
                  </div>
                </div>
              </div>
              {askConsent && (
                <AiConsent
                  what="scripts"
                  onAllow={() => {
                    setAi({ aiConsent: true })
                    setWriter('ai')
                    setAskConsent(false)
                  }}
                  onCancel={() => setAskConsent(false)}
                />
              )}
              <p className="text-ink-3 mb-4 text-xs">
                {writer === 'ai'
                  ? `The AI writes conversational lines from the approved outline; anything it can't back with a fact is flagged. ${remainingToday('scripts')} AI scripts left today on this device.`
                  : 'The built-in writer reads the facts as written, adds clearly labeled opinions with no new numbers, and uses no AI.'}
                {sheet.pending.length > 0 && ` Still loading: ${sheet.pending.join(', ')}; the outline skips what isn't ready.`}
              </p>
              <button type="button" onClick={makeOutline} className="bg-accent text-accent-ink inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-extrabold">
                <FileText size={18} aria-hidden /> Build outline
              </button>
            </Panel>
          ) : !lines ? (
            <Panel
              title="Review the outline"
              aside={
                <button type="button" onClick={() => setOutline(null)} className="text-ink-2 inline-flex min-h-9 items-center gap-1 text-sm font-bold">
                  <ArrowLeft size={16} aria-hidden /> Back
                </button>
              }
            >
              <Stepper at={at} />
              <p className="text-ink-2 mb-4 text-sm">Each chapter lists the evidence it will use. Untick a chapter to leave it out.</p>
              {outline.chapters.length === 0 ? (
                <p className="text-ink-2 text-sm">The tools have nothing for this episode type yet. Try another type, or come back when the data is in.</p>
              ) : (
                <ol className="grid gap-3">
                  {outline.chapters.map((c, k) => (
                    <li key={c.id} className="border-line/60 bg-bg/40 rounded-2xl border p-3.5">
                      <label className="flex items-center gap-2.5 font-extrabold">
                        <input
                          type="checkbox"
                          checked={c.include}
                          onChange={() => setOutline({ ...outline, chapters: outline.chapters.map((x) => (x.id === c.id ? { ...x, include: !x.include } : x)) })}
                          className="accent-accent size-4"
                        />
                        {k + 1}. {c.title}
                      </label>
                      {c.include && (
                        <ul className="mt-2 grid gap-1.5">
                          {c.facts.map((id) => byId.get(id)).filter(Boolean).map((f) => (
                            <FactRow key={f!.id} fact={f!} />
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {outline.skipped.length > 0 && <p className="text-ink-3 mt-3 text-xs">Skipped (no data yet): {outline.skipped.join(', ')}.</p>}
              {error && <p className="text-bad mt-3 text-sm font-semibold">{error}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={writing || !outline.chapters.some((c) => c.include)}
                  onClick={() => void write()}
                  className="bg-accent text-accent-ink inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-extrabold disabled:opacity-40"
                >
                  {writing ? <Loader2 size={18} aria-hidden className="animate-spin" /> : <FileText size={18} aria-hidden />}
                  {writing ? 'Writing the script…' : 'Write the script'}
                </button>
                {writing && (
                  <button type="button" onClick={() => abort.current?.abort()} className="border-line inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 font-bold">
                    <Square size={14} aria-hidden /> Cancel
                  </button>
                )}
              </div>
            </Panel>
          ) : (
            <Panel
              title="Review the script"
              aside={
                <button type="button" onClick={() => setLines(null)} className="text-ink-2 inline-flex min-h-9 items-center gap-1 text-sm font-bold">
                  <ArrowLeft size={16} aria-hidden /> Back to outline
                </button>
              }
            >
              <Stepper at={at} />
              <p className="text-ink-2 mb-3 text-sm">
                {scriptBy === 'ai' ? 'Written by AI (Claude) and checked against your facts.' : 'Assembled by the built-in writer (no AI).'} Facts are cited, opinions are labeled. Approve it to make audio.
              </p>
              {flagged > 0 && (
                <div className="border-amber/40 bg-amber/10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                  <AlertTriangle size={16} aria-hidden className="text-amber" />
                  <span className="flex-1">
                    {flagged} line{flagged === 1 ? '' : 's'} couldn't be verified against your data. Remove {flagged === 1 ? 'it' : 'them'} before approving.
                  </span>
                  <button type="button" onClick={() => setLines(lines.filter((l) => !l.flags?.length))} className="border-amber/50 min-h-9 rounded-lg border px-3 font-bold">
                    Remove all flagged
                  </button>
                </div>
              )}
              <ol aria-label="Script" className="grid max-h-[32rem] gap-1.5 overflow-y-auto pr-1">
                {lines.map((l, i) => (
                  <li key={i} className={`rounded-xl border px-3 py-2 text-sm ${l.flags?.length ? 'border-amber/50 bg-amber/5' : 'border-line/50'}`}>
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1">
                        <span className="mr-1.5 font-extrabold">{hosts[l.speaker]?.name ?? HOSTS[0].name}</span>
                        <span className={`mr-1.5 rounded-full border px-1.5 py-px text-[10px] font-extrabold tracking-wide uppercase ${KIND_CLS[l.kind]}`}>{l.kind}</span>
                        <span className="text-ink-2">{l.text}</span>
                        {l.cite.length > 0 && <span className="text-accent ml-1 text-xs font-bold">{l.cite.join(' ')}</span>}
                      </p>
                      {l.kind !== 'disclosure' && (
                        <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label={`Remove line ${i + 1}`} className="text-ink-3 hover:text-bad grid size-8 shrink-0 place-items-center rounded-lg">
                          <X size={14} aria-hidden />
                        </button>
                      )}
                    </div>
                    {l.flags?.map((f) => (
                      <p key={f} className="text-amber mt-1 text-xs font-semibold">
                        {f}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={flagged > 0} onClick={() => void approve()} className="bg-accent text-accent-ink inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-extrabold disabled:opacity-40">
                  <Check size={18} aria-hidden /> Approve script
                </button>
                <button type="button" disabled={writing} onClick={() => void write()} className="border-line inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-bold">
                  Rewrite
                </button>
              </div>
            </Panel>
          )}
        </div>
        <aside className="grid content-start gap-4">
          <Library
            episodes={episodes}
            current={current?.id ?? null}
            onOpen={(e) => {
              setOutline(null)
              setLines(null)
              setCurrent(e)
            }}
            onToggleSaved={(e) => void persist({ ...e, saved: !e.saved })}
            onDelete={(e) => void remove(e)}
          />
        </aside>
      </div>
      {current && <ShareDialog ep={current} open={share} onClose={() => setShare(false)} />}
    </div>
  )
}

export default function Studio() {
  return <LeagueGate>{(data) => <StudioPage data={data} />}</LeagueGate>
}
