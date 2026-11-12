import { Link } from 'react-router-dom'

import type { Fact } from '../../lib/ai/facts'
import { relTime } from '../../lib/format'

/** Who stands behind a fact: Sleeper, a news publisher, or a GameplanBlitz model. */
function factLabel(f: Fact): { text: string; cls: string } {
  if (f.kind === 'model') return { text: 'Model', cls: 'text-amber border-amber/40 bg-amber/10' }
  if (f.topic === 'news') return { text: 'Publisher', cls: 'text-blue border-blue/40 bg-blue/10' }
  return { text: 'Sleeper fact', cls: 'text-good border-good/40 bg-good/10' }
}

/** One cited fact: label, sentence, source, timestamp and the tool behind it. */
export function FactRow({ fact, n }: { fact: Fact; n?: number }) {
  const l = factLabel(fact)
  return (
    <li className="border-line/60 bg-bg/40 rounded-xl border px-3 py-2 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {n !== undefined && <span className="text-accent font-extrabold">[{n}]</span>}
        <span className={`rounded-full border px-1.5 py-px text-[10px] font-extrabold tracking-wide uppercase ${l.cls}`}>{l.text}</span>
        <span className="text-ink-3">
          {fact.source}
          {fact.asOf ? ` · ${relTime(fact.asOf)}` : ''}
        </span>
      </div>
      <p className="text-ink-2">{fact.text}</p>
      <Link to={fact.to} className="text-accent mt-1 inline-block font-bold hover:underline">
        Open the tool
      </Link>
    </li>
  )
}
