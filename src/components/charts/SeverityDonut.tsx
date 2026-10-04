import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { TOOLTIP_CONTENT_STYLE, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from './chartTheme'
import { SEVERITY_META } from '@/utils/severity'
import { formatNumber, formatPercent } from '@/utils/format'
import type { SeveritySlice } from '@/services/dashboard'

export interface SeverityDonutProps {
  data: SeveritySlice[]
  height?: number
  /** Optional copy under the legend, e.g. the scope of the numbers. */
  footnote?: string
}

/**
 * Open findings by severity.
 *
 * A donut rather than a pie: the hole carries the total, which is the number an
 * analyst actually wants, and the segments stay comparable at a glance. Every
 * segment is labelled in the legend with its own count, so colour is never the
 * only signal.
 */
export function SeverityDonut({ data, height = 200, footnote }: SeverityDonutProps) {
  const present = data.filter((slice) => slice.count > 0)
  const total = present.reduce((sum, slice) => sum + slice.count, 0)

  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={present}
              dataKey="count"
              nameKey="severity"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {present.map((slice) => (
                <Cell key={slice.severity} fill={`var(--sev-${severityVar(slice.severity)})`} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(value) => `${formatNumber(Number(value))} findings`}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold leading-none tabular-nums text-fg">
            {formatNumber(total)}
          </span>
          <span className="mt-1 text-[11px] uppercase tracking-wide text-fg-subtle">open</span>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {data.map((slice) => {
          const meta = SEVERITY_META[slice.severity]
          return (
            <li key={slice.severity} className="flex items-center gap-2.5 text-[13px]">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${meta.fill}`}
              />
              <span className="min-w-0 flex-1 truncate text-fg-muted">{meta.label}</span>
              <span className="font-medium tabular-nums text-fg">{formatNumber(slice.count)}</span>
              <span className="w-11 text-right tabular-nums text-fg-subtle">
                {formatPercent(slice.share, 1)}
              </span>
            </li>
          )
        })}
      </ul>

      {footnote ? <p className="mt-3 text-xs text-fg-subtle">{footnote}</p> : null}
    </div>
  )
}

function severityVar(severity: SeveritySlice['severity']): string {
  return severity === 'informational' ? 'info' : severity
}
