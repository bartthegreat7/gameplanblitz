import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { rateConfidence } from '../../lib/evidence'
import { ConfidenceBadge, EvidenceList, FreshnessBadge } from './badges'
import { DataTable, type Column } from './DataTable'
import { RangeBar } from './RangeBar'

interface Row {
  name: string
  pts: number
}
const rows: Row[] = [
  { name: 'Cole', pts: 12 },
  { name: 'Abe', pts: 30 },
  { name: 'Bo', pts: 7 },
]
const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
  { key: 'pts', header: 'Pts', cell: (r) => r.pts, sortValue: (r) => r.pts, align: 'right' },
]
const order = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)

describe('DataTable', () => {
  const setup = () =>
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.name} caption="Players" searchText={(r) => r.name} />)

  it('has table semantics: caption and column headers', () => {
    setup()
    expect(screen.getByRole('table', { name: 'Players' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  })

  it('sorts descending on first click, then ascending, and reports aria-sort', async () => {
    const user = userEvent.setup()
    setup()
    const pts = screen.getByRole('columnheader', { name: /Pts/ })
    expect(pts).toHaveAttribute('aria-sort', 'none')
    await user.click(within(pts).getByRole('button'))
    expect(order()).toEqual(['Abe', 'Cole', 'Bo'])
    expect(pts).toHaveAttribute('aria-sort', 'descending')
    await user.click(within(pts).getByRole('button'))
    expect(order()).toEqual(['Bo', 'Cole', 'Abe'])
    expect(pts).toHaveAttribute('aria-sort', 'ascending')
  })

  it('filters by the search box and shows an empty state', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText('Search Players'), 'co')
    expect(order()).toEqual(['Cole'])
    await user.clear(screen.getByLabelText('Search Players'))
    await user.type(screen.getByLabelText('Search Players'), 'zzz')
    expect(screen.getByText('No matches.')).toBeInTheDocument()
  })

  it('honors an initial sort', () => {
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.name} caption="P" initialSort={{ key: 'pts', dir: 'desc' }} />)
    expect(order()).toEqual(['Abe', 'Cole', 'Bo'])
  })
})

describe('RangeBar', () => {
  it('describes the range for assistive tech', () => {
    render(<RangeBar proj={12} floor={6.04} ceiling={18.2} domainMax={25} />)
    expect(screen.getByRole('img', { name: 'Projected 12.0, range 6.0 to 18.2' })).toBeInTheDocument()
  })
  it('never invents a range when it is unknown', () => {
    render(<RangeBar proj={12} floor={null} ceiling={null} domainMax={25} />)
    expect(screen.getByRole('img', { name: 'Projected 12.0, range unavailable' })).toBeInTheDocument()
  })
})

describe('FreshnessBadge', () => {
  afterEach(() => vi.useRealTimers())

  it('renders nothing without a timestamp', () => {
    const { container } = render(<FreshnessBadge updatedAt={null} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows relative age and turns stale after the threshold', () => {
    vi.useFakeTimers()
    const t0 = Date.now()
    render(<FreshnessBadge updatedAt={t0} label="Updated" staleAfterMin={15} />)
    expect(screen.getByText(/Updated just now/)).toBeInTheDocument()
    expect(screen.queryByText(/may be stale/)).not.toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(16 * 60_000))
    expect(screen.getByText(/Updated 16m ago/)).toBeInTheDocument()
    expect(screen.getByText(/may be stale/)).toBeInTheDocument()
  })
})

describe('ConfidenceBadge and EvidenceList', () => {
  it('shows the level with an accessible prefix and the rubric notes as a tooltip', () => {
    const c = rateConfidence({ marginZ: 1, sampleOk: true, injuryFlag: false })
    render(<ConfidenceBadge confidence={c} />)
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Confidence:')).toBeInTheDocument()
    expect(screen.getByText('High').closest('span')).toHaveAttribute('title', expect.stringContaining('Large projection gap'))
  })

  it('labels model output differently from sourced facts', () => {
    render(
      <EvidenceList
        items={[
          { label: 'Projection', value: '12.0 pts', source: 'Sleeper projections' },
          { label: 'Range', value: '6–18', source: 'Model: projection ± 1.28 sd' },
        ]}
      />,
    )
    expect(screen.getByText(/Sourced/)).toBeInTheDocument()
    expect(screen.getByText(/Model estimate/)).toBeInTheDocument()
  })
})
