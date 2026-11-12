import { Link } from 'react-router-dom'

import { EmptyState } from '../components/ui/states'

export default function NotFound() {
  return (
    <EmptyState>
      That page doesn't exist.{' '}
      <Link to="/" className="text-mint font-bold">
        Back to the dashboard
      </Link>
    </EmptyState>
  )
}
