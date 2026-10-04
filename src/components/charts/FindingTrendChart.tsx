import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AXIS_STICK, GRID_STROKE, LEGEND_WRAPPER_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from './chartTheme'
import { formatNumber } from '@/utils/format'
import type { TrendPoint } from '@/services/dashboard'

export interface FindingTrendChartProps {
  data: TrendPoint[]
  height?: number
  /** Which series to plot; the dashboard shows both, a detail page may show one. */
  series?: 'opened' | 'closed' | 'open' | 'all'
}

const SERIES = {
  opened: { key: 'opened', label: 'Newly opened', color: 'var(--sev-medium)' },
  closed: { key: 'closed', label: 'Closed', color: 'var(--status-success)' },
  open: { key: 'total', label: 'Open backlog', color: 'var(--accent)' },
} as const

/**
 * Finding volume over the trailing window.
 *
 * "Opened" and "closed" are event counts and read as areas; the open backlog is
 * a running total and reads better as a line, so it is drawn without a fill to
 * avoid implying the same quantity.
 */
export function FindingTrendChart({ data, height = 240, series = 'all' }: FindingTrendChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const requested = series === 'all' ? (['opened', 'closed', 'open'] as const) : ([series] as const)
  const active = requested.filter((key) => !hidden.has(key))

  const toggle = (label: string) => {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="trend-opened" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--sev-medium)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--sev-medium)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="trend-closed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--status-success)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--status-success)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={GRID_STROKE.stroke} strokeDasharray={GRID_STROKE.strokeDasharray} vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_STICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis tick={AXIS_STICK} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              iconType="plainline"
              wrapperStyle={LEGEND_WRAPPER_STYLE}
              onClick={(entry) => toggle(String(entry.dataKey))}
            />

            {active.includes('opened') ? (
              <Area
                type="monotone"
                dataKey="opened"
                name="Newly opened"
                stroke={SERIES.opened.color}
                strokeWidth={1.5}
                fill="url(#trend-opened)"
                isAnimationActive={false}
                dot={false}
              />
            ) : null}
            {active.includes('closed') ? (
              <Area
                type="monotone"
                dataKey="closed"
                name="Closed"
                stroke={SERIES.closed.color}
                strokeWidth={1.5}
                fill="url(#trend-closed)"
                isAnimationActive={false}
                dot={false}
              />
            ) : null}
            {active.includes('open') ? (
              <Area
                type="monotone"
                dataKey="total"
                name="Open backlog"
                stroke={SERIES.open.color}
                strokeWidth={2}
                fill="none"
                strokeDasharray="4 3"
                isAnimationActive={false}
                dot={false}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
