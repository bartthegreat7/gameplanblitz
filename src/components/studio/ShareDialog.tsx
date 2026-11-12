import { Copy, Download, FileAudio, Share2 } from 'lucide-react'
import { useState } from 'react'

import { downloadBlob, fileName, transcriptText } from '../../lib/ai/episode'
import { getClip, type Episode } from '../../lib/ai/storage'
import { Modal } from '../ui/Overlay'

/**
 * Episodes are private: stored only in this browser. Sharing makes a copy outside GameplanBlitz,
 * so it needs an explicit acknowledgement first. There are no public links (nothing is hosted).
 */
export function ShareDialog({ ep, open, onClose }: { ep: Episode; open: boolean; onClose: () => void }) {
  const [ok, setOk] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const text = transcriptText(ep)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const audioBlob = async () => {
    const parts: Blob[] = []
    for (let i = 0; i < ep.lines.length; i++) {
      const b = await getClip(ep.id, i)
      if (!b) throw new Error('missing clip')
      parts.push(b)
    }
    return new Blob(parts, { type: 'audio/mpeg' })
  }

  const act = async (what: 'copy' | 'text' | 'audio' | 'share') => {
    setStatus(null)
    try {
      if (what === 'copy') {
        await navigator.clipboard.writeText(text)
        setStatus('Transcript copied.')
      } else if (what === 'text') {
        downloadBlob(new Blob([text], { type: 'text/plain' }), fileName(ep, 'txt'))
        setStatus('Transcript saved.')
      } else if (what === 'audio') {
        downloadBlob(await audioBlob(), fileName(ep, 'mp3'))
        setStatus('Audio saved.')
      } else {
        await navigator.share({ title: `${ep.title} - The War Room`, text })
        setStatus('Shared.')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setStatus("That didn't work in this browser.")
    }
  }

  const close = () => {
    setOk(false)
    setStatus(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Share or export">
      <div className="grid gap-3 text-sm">
        <p className="text-ink-2">
          This episode is private: it's stored only in this browser. It names your league, teams, players and results. Sharing or exporting makes a copy outside GameplanBlitz that you control. GameplanBlitz doesn't host episodes, so there are no public links.
        </p>
        <label className="border-line bg-panel flex items-start gap-2.5 rounded-xl border p-3 font-semibold">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="accent-accent mt-0.5 size-4" />
          I understand this shares league-specific content, and that the hosts and voices are AI-generated (the export says so).
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={!ok} onClick={() => void act('copy')} className="border-line inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border font-bold disabled:opacity-40">
            <Copy size={16} aria-hidden /> Copy transcript
          </button>
          <button type="button" disabled={!ok} onClick={() => void act('text')} className="border-line inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border font-bold disabled:opacity-40">
            <Download size={16} aria-hidden /> Save transcript
          </button>
          {ep.audio?.engine === 'cloud' && (
            <button type="button" disabled={!ok} onClick={() => void act('audio')} className="border-line inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border font-bold disabled:opacity-40">
              <FileAudio size={16} aria-hidden /> Save audio (MP3)
            </button>
          )}
          {canShare && (
            <button type="button" disabled={!ok} onClick={() => void act('share')} className="border-line inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border font-bold disabled:opacity-40">
              <Share2 size={16} aria-hidden /> Share…
            </button>
          )}
        </div>
        {ep.audio?.engine === 'device' && (
          <p className="text-ink-3 text-xs">Device-voice episodes are spoken live by your browser, so there is no audio file to export. Create AI audio for an MP3.</p>
        )}
        {status && (
          <p role="status" className="text-good font-semibold">
            {status}
          </p>
        )}
      </div>
    </Modal>
  )
}
