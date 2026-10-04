import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { AXIS_STICK, TOOLTIP_CONTENT_STYLE, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from './chartTheme'
import { formatNumber } from '@/utils/format'

export interface RiskBarDatum {
  id: string
  /** Short label; long names are truncated by the chart, the row shows the full name. */
  label: string
  value: number
  /** Optional secondary series, e.g. open finding count. */
  secondary?: number
}

export interface RiskBarChartProps {
  data: RiskBarDatum[]
  height?: number
  /** Name of the bar series, used in the tooltip. */
  seriesLabel?: string
  secondaryLabel?: string
}

function toneFor(value: number): string {
  if (value >= 70) return 'var(--sev-critical)'
  if (value >= 45) return 'var(--sev-high)'
  if (value >= 25) return 'var(--sev-medium)'
  return 'var(--sev-low)'
}

/**
 * Ranked horizontal bars.
 *
 * Bars are coloured by magnitude so a reader can triage without reading every
 * label, but each row also carries its numeric value as text.
 */
export function RiskBarChart({
  data,
  height = 220,
  seriesLabel = 'Risk score',
  secondaryLabel,
}: RiskBarChartProps) {
  const rowHeight = 30
  const chartHeight = Math.max(height, data.length * rowHeight + 24)

  return (
    <div style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 32, bottom: 0, left: 8 }}
          barCategoryGap={8}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={AXIS_STICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_STICK}
            tickLine={false}
            axisLine={false}
            width={132}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)', opacity: 0.5 }}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value, name) => [
              formatNumber(Number(value)),
              name === 'value' ? seriesLabel : (secondaryLabel ?? String(name)),
            ]}
          />
          <Bar dataKey="value" name="value" radius={[0, 3, 3, 0]} isAnimationActive={false} maxBarSize={16}>
            {data.map((entry) => (
              <Cell key={entry.id} fill={toneFor(entry.value)} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              style={{ fill: 'var(--fg-muted)', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
