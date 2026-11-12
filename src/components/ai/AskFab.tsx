import { MessageSquareText } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useAppStore } from '../../store/app'
import { Drawer } from '../ui/Overlay'
import { ListSkeleton } from '../ui/states'

const FabChat = lazy(() => import('./FabChat'))

/** Pages where a question to the GM is a natural next step (not the dashboard, the GM itself or settings). */
const FAB_ROUTES = [
  '/lineup',
  '/team',
  '/weather',
  '/players',
  '/waivers',
  '/trades',
  '/keepers',
  '/startsit',
  '/scouting',
  '/playoffs',
  '/injuries',
  '/breakouts',
  '/market',
  '/gameday',
  '/edge',
  '/gm',
  '/standings',
  '/alerts',
]

/** Floating "Ask Fantasy GM" control; opens the conversation in a side panel with page-aware suggestions. */
export function AskFab() {
  const { pathname } = useLocation()
  const signedIn = useAppStore((s) => !!s.username)
  const [open, setOpen] = useState(false)
  if (!signedIn || !FAB_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="from-accent to-purple text-accent-ink fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r px-4 font-extrabold shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)] md:right-6 md:bottom-6"
      >
        <MessageSquareText size={20} aria-hidden />
        <span>Ask Fantasy GM</span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Ask Fantasy GM">
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <FabChat path={pathname} />
        </Suspense>
      </Drawer>
    </>
  )
}
