import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { useLeagueData, type Ready } from '../hooks/useLeagueData'
import { useSession } from '../hooks/useSession'
import { useAppStore } from '../store/app'
import { EmptyState, ErrorState, Skeleton } from './ui/states'

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading your league" className="lg:columns-2 lg:gap-5">
      {['h-44', 'h-36', 'h-52', 'h-40'].map((h, i) => (
        <div key={i} className="border-line bg-card mb-5 break-inside-avoid rounded-3xl border p-5">
          <div className="mb-4 flex items-center gap-3.5">
            <Skeleton className="size-12 !rounded-2xl" />
            <Skeleton className="h-6 w-40" />
          </div>
          <Skeleton className={h} />
        </div>
      ))}
    </div>
  )
}

/**
 * Resolves sign-in, session and league loading into the right state (redirect, skeleton, error,
 * empty), then renders `children` with fully loaded league data.
 */
export function LeagueGate({ children }: { children: (data: Ready) => ReactNode }) {
  const session = useSession()
  const data = useLeagueData()
  const signOut = useAppStore((s) => s.signOut)

  if (!session.username) return <Navigate to="/connect" replace />

  if (session.unknownUser)
    return (
      <div className="mx-auto max-w-md">
        <ErrorState title={`Couldn't find “${session.username}” on Sleeper`} message="Check the spelling and try again." />
        <Link to="/connect" onClick={signOut} className="bg-mint text-mint-ink mt-4 block rounded-xl py-3 text-center font-extrabold">
          Try another username
        </Link>
      </div>
    )
  if (session.error)
    return (
      <div className="mx-auto max-w-md">
        <ErrorState title="Couldn't reach Sleeper" message={session.error.message} onRetry={() => window.location.reload()} />
      </div>
    )
  if (session.isLoading) return <PageSkeleton />
  if (session.noLeagues)
    return (
      <EmptyState>
        “{session.username}” has no NFL leagues on Sleeper for {session.season}. <Link to="/connect" onClick={signOut} className="text-mint font-bold">Try another username</Link>
      </EmptyState>
    )

  if (data.status === 'error')
    return (
      <div className="mx-auto max-w-md">
        <ErrorState title="Couldn't load this league" message={`${data.error.message}. The Sleeper API may be briefly down.`} onRetry={data.refetch} />
      </div>
    )
  if (data.status === 'loading') return <PageSkeleton />
  return <>{children(data)}</>
}
