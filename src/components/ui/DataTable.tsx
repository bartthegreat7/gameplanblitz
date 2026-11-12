import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'

import { EmptyState } from './states'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** makes the column sortable */
  sortValue?: (row: T) => number | string
  align?: 'left' | 'right'
  /** hide on narrow screens */
  hideBelow?: 'sm' | 'md'
}

interface Props<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  /** text matched by the search box; omit to hide search */
  searchText?: (row: T) => string
  caption: string
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  empty?: ReactNode
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell' }

/** Searchable, sortable table with real table semantics (caption, scoped headers, aria-sort). */
export function DataTable<T>({ rows, columns, rowKey, searchText, caption, initialSort, empty }: Props<T>) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort ?? null)
  const searchId = useId()

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = needle && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(needle)) : rows
    const col = sort && columns.find((c) => c.key === sort.key)
    if (col?.sortValue && sort) {
      const dir = sort.dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => {
        const x = col.sortValue!(a)
        const y = col.sortValue!(b)
        return (x < y ? -1 : x > y ? 1 : 0) * dir
      })
    }
    return out
  }, [rows, columns, q, sort, searchText])

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))

  return (
    <div>
      {searchText && (
        <div className="border-line bg-card mb-3 flex items-center gap-2 rounded-2xl border px-3.5">
          <Search size={18} className="text-ink-3" aria-hidden />
          <label htmlFor={searchId} className="sr-only">
            Search {caption}
          </label>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent py-2.5 outline-none"
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-ink-3 border-line border-b text-xs">
              {columns.map((c) => {
                const active = sort?.key === c.key
                const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}
                    className={`px-2 py-2 font-bold ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hideBelow ? HIDE[c.hideBelow] : ''}`}
                  >
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 font-bold">
                        {c.header} <Icon size={12} aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={rowKey(r)} className="border-line/50 border-b">
                {columns.map((c) => (
                  <td key={c.key} className={`px-2 py-2.5 ${c.align === 'right' ? 'text-right' : ''} ${c.hideBelow ? HIDE[c.hideBelow] : ''}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.length === 0 && (empty ?? <EmptyState>No matches.</EmptyState>)}
    </div>
  )
}
