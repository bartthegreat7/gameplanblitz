import { ArrowRight, FlaskConical } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CARD } from '../components/dashboard/styles'
import { LAB_TOOLS } from '../components/layout/nav'

/** Strategy Lab: the analysis tools in one place. */
export default function Lab() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <FlaskConical size={22} aria-hidden className="text-accent" /> Strategy Lab
        </h1>
        <p className="text-ink-3 text-sm">
          Deeper analysis for your league. Every tool is read-only and labels what is a Sleeper fact and
          what is a model estimate.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LAB_TOOLS.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              className={`${CARD} group hover:border-accent/50 flex h-full items-start gap-3 p-5 transition-colors`}
            >
              <span className="bg-accent/12 text-accent grid size-11 shrink-0 place-items-center rounded-xl">
                <t.icon size={22} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold group-hover:underline">{t.label}</span>
                <span className="text-ink-2 block text-sm">{t.blurb}</span>
              </span>
              <ArrowRight size={18} aria-hidden className="text-accent mt-1 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
