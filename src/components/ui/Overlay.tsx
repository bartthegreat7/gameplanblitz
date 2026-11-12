import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Open overlays, newest last: only the topmost handles Escape and the focus trap (e.g. a player view over a tool panel). */
const openStack: symbol[] = []

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** modal = centered dialog; drawer = right panel on desktop, bottom sheet on phones; nav = left panel; palette = wide, near the top */
  variant: 'modal' | 'drawer' | 'panel' | 'nav' | 'palette'
}

/** Accessible dialog base: portal, focus trap, Esc to close, scroll lock, focus restore. */
function Overlay({ open, onClose, title, children, variant }: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const me = Symbol('overlay')
    openStack.push(me)
    const prev = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const el = panel.current
    ;(el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== me) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      } else if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
        if (items.length === 0) return e.preventDefault()
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openStack.splice(openStack.indexOf(me), 1)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open])

  if (!open) return null
  const pos = {
    modal: 'items-center justify-center p-4',
    drawer: 'items-end justify-center md:items-stretch md:justify-end',
    panel: 'items-end justify-center md:items-stretch md:justify-end',
    nav: 'items-stretch justify-start',
    palette: 'items-start justify-center px-4 pt-[8vh]',
  }[variant]
  const size = {
    modal: 'max-w-md rounded-3xl',
    drawer:
      'max-h-[85dvh] rounded-t-3xl md:max-h-none md:max-w-md md:rounded-t-none md:rounded-l-3xl',
    panel:
      'max-h-[88dvh] rounded-t-3xl md:max-h-none md:max-w-xl md:rounded-t-none md:rounded-l-3xl',
    nav: 'max-w-[320px] rounded-r-3xl',
    palette: 'max-h-[80dvh] max-w-xl rounded-2xl',
  }[variant]

  return createPortal(
    <div className={`fixed inset-0 z-50 flex ${pos}`}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`border-line bg-card text-ink relative flex w-full flex-col overflow-hidden border shadow-2xl outline-none ${size}`}
      >
        <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 id={titleId} className="text-lg font-extrabold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="border-line bg-panel text-ink-2 grid size-9 place-items-center rounded-full border"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export const Modal = (p: Omit<OverlayProps, 'variant'>) => <Overlay {...p} variant="modal" />
export const Drawer = (p: Omit<OverlayProps, 'variant'>) => <Overlay {...p} variant="drawer" />
export const NavDrawer = (p: Omit<OverlayProps, 'variant'>) => <Overlay {...p} variant="nav" />
export const Palette = (p: Omit<OverlayProps, 'variant'>) => <Overlay {...p} variant="palette" />
/** wide side panel (bottom sheet on phones) for a full tool */
export const Panel = (p: Omit<OverlayProps, 'variant'>) => <Overlay {...p} variant="panel" />
