import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { RadarAxis } from '../../lib/analytics/command'

const SHORT: Record<RadarAxis['key'], string> = {
  snap: 'Snaps',
  targets: 'Targets',
  touches: 'Touches',
  rz: 'Red zone',
  xfp: 'Exp. pts',
  growth: 'Growth',
}

/** The radar drawing (Recharts, loaded on demand). Values are position percentiles 0-100. */
export default function RadarChartView({ axes, name }: { axes: RadarAxis[]; name: string }) {
  const data = axes.map((a) => ({ axis: SHORT[a.key], pct: Math.round(a.pct) }))
  return (
    <ResponsiveContainer width="100%" height={210}>
      <RadarChart data={data} outerRadius="72%" margin={{ top: 6, right: 24, bottom: 6, left: 24 }}>
        <PolarGrid stroke="var(--line)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--ink-2)', fontSize: 11, fontWeight: 600 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip
          formatter={(v) => [`${v}th percentile`, name]}
          contentStyle={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' }}
          labelStyle={{ color: 'var(--ink)', fontWeight: 700 }}
        />
        <Radar dataKey="pct" stroke="var(--accent)" fill="var(--accent-deep)" fillOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
