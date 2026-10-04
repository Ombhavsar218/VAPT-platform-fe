import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react'

import { Card, CardHeader } from '@/components/common/Card'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import type { ComparedFinding, ScanComparisonData } from '@/services/comparison'
import { SEVERITIES } from '@/types'
import { SEVERITY_RANK, SEVERITY_META } from '@/utils/severity'
import { formatDate, formatNumber } from '@/utils/format'
import { Link } from 'react-router-dom'

/**
 * Scan comparison (`/scans/compare`).
 *
 * The question a rescan is run for is whether anything got better, so the page
 * leads with movement rather than totals: the four buckets (resolved,
 * introduced, still open, reopened) and the risk delta between the two runs.
 * Absolute counts are one click away in the per-severity table, because a
 * client arguing about a count wants the count, not the trend.
 */
export function ScanCompareView({ data }: { data: ScanComparisonData }) {
  const movement = [
    { key: 'resolved', label: 'Resolved', value: data.comparison.fixed, tone: 'text-success' },
    { key: 'introduced', label: 'Introduced', value: data.comparison.newIssues, tone: 'text-sev-high' },
    { key: 'persisting', label: 'Still open', value: data.comparison.stillOpen, tone: 'text-sev-medium' },
    { key: 'reopened', label: 'Reopened', value: data.comparison.reopened, tone: 'text-sev-critical' },
  ] as const

  const riskDelta = data.current.riskScore - data.previous.riskScore

  const severityChart = useMemo(
    () =>
      SEVERITIES.map((severity) => {
        const row = data.deltas.find((delta) => delta.severity === severity)
        return {
          name: SEVERITY_META[severity].label,
          previous: row?.previous ?? 0,
          current: row?.current ?? 0,
        }
      }),
    [data.deltas],
  )

  const timelineChart = useMemo(
    () =>
      data.comparison.timeline.map((point) => ({
        label: point.label,
        date: formatDate(point.date),
        critical: point.critical,
        high: point.high,
        medium: point.medium,
        low: point.low,
      })),
    [data.comparison.timeline],
  )

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <RunPair data={data} />
          <div className="flex items-center gap-2">
            <RiskDelta delta={riskDelta} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {movement.map((entry) => (
          <Card key={entry.key}>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              {entry.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${entry.tone}`}>
              {formatNumber(entry.value)}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Findings by severity"
            description="Both runs side by side. A shorter current bar is progress."
          />
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityChart}>
                <CartesianGrid stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-base)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="previous" name={data.previous.id} fill="var(--fg-subtle)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="current" name={data.current.id} fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Severity across the target's history"
            description={`Every completed run up to ${data.current.id}.`}
          />
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineChart}>
                <CartesianGrid stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-base)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(['critical', 'high', 'medium'] as const).map((severity) => (
                  <Line
                    key={severity}
                    type="monotone"
                    dataKey={severity}
                    name={SEVERITY_META[severity].label}
                    stroke={`var(--sev-${severity})`}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <MovementList
        title="Resolved since the earlier run"
        description="Reported by the earlier run and no longer reported by the newer one."
        findings={data.resolved}
        emptyTitle="Nothing was resolved"
        emptyDescription="Both runs reported the same set of findings."
      />

      <MovementList
        title="Introduced by the newer run"
        description="Reported by the newer run at a location the earlier one did not."
        findings={data.introduced}
        emptyTitle="Nothing new"
        emptyDescription="The newer run found no issues the earlier one missed."
      />

      <MovementList
        title="Reopened"
        description="Previously closed and reported again - either a regression or an earlier false positive."
        findings={data.reopened}
        emptyTitle="Nothing reopened"
        emptyDescription="No finding that was closed has come back."
        accent="critical"
      />

      <MovementList
        title="Still open"
        description="Carried over from the earlier run and unresolved."
        findings={data.persisting}
        emptyTitle="Nothing carried over"
        emptyDescription="The newer run reported no findings from the earlier one."
        accent="medium"
      />
    </div>
  )
}

function RunPair({ data }: { data: ScanComparisonData }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <RunBadge label="Earlier" run={data.previous} />
      <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
      <RunBadge label="Newer" run={data.current} emphasis />
    </div>
  )
}

function RunBadge({
  label,
  run,
  emphasis = false,
}: {
  label: string
  run: ScanComparisonData['previous']
  emphasis?: boolean
}) {
  return (
    <div
      className={
        'min-w-0 rounded-lg border px-3 py-2 ' +
        (emphasis ? 'border-accent/40 bg-accent/8' : 'border-border-base bg-surface-2')
      }
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-fg">
        {run.id}
        <span className="ml-1.5 font-normal text-fg-muted">{formatDate(run.completedAt)}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-fg-subtle">
        {formatNumber(run.findingCount)} findings · risk {run.riskScore}
      </p>
    </div>
  )
}

function RiskDelta({ delta }: { delta: number }) {
  const Icon = delta < 0 ? TrendingDown : delta > 0 ? TrendingUp : Minus
  const tone =
    delta < 0 ? 'text-success' : delta > 0 ? 'text-danger' : 'text-fg-muted'

  return (
    <div className="rounded-lg border border-border-base bg-surface-2 px-3 py-2">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
        Risk movement
      </p>
      <p className={`mt-0.5 flex items-center gap-1.5 text-[15px] font-semibold tabular-nums ${tone}`}>
        <Icon className="size-4" aria-hidden="true" />
        {delta > 0 ? `+${delta}` : delta}
        <span className="text-[12px] font-normal text-fg-subtle">
          {delta < 0 ? 'better' : delta > 0 ? 'worse' : 'unchanged'}
        </span>
      </p>
    </div>
  )
}

function MovementList({
  title,
  description,
  findings,
  emptyTitle,
  emptyDescription,
  accent = 'neutral',
}: {
  title: string
  description: string
  findings: ComparedFinding[]
  emptyTitle: string
  emptyDescription: string
  accent?: 'neutral' | 'medium' | 'critical'
}) {
  const ordered = [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.endpoint.localeCompare(b.endpoint),
  )

  const rail =
    accent === 'critical'
      ? 'bg-sev-critical'
      : accent === 'medium'
        ? 'bg-sev-medium'
        : 'bg-border-base'

  return (
    <Card flush>
      <div className="border-b border-border-base px-5 py-4">
        <CardHeader title={`${title} (${formatNumber(findings.length)})`} description={description} />
      </div>

      {ordered.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-subtle">
          <span className="block font-medium text-fg-muted">{emptyTitle}</span>
          {emptyDescription}
        </p>
      ) : (
        <ul className="divide-y divide-border-base">
          {ordered.map((finding) => (
            <li key={finding.findingId} className="flex items-start gap-3 px-5 py-3">
              <span className={`mt-1 h-8 w-0.5 shrink-0 rounded-full ${rail}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={finding.severity} size="xs" />
                  <Link
                    to={`/findings/${finding.findingId}`}
                    className="truncate text-[13px] font-medium text-fg hover:text-accent hover:underline"
                  >
                    {finding.title}
                  </Link>
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">
                  {finding.httpMethod} {finding.endpoint}
                  {finding.parameter ? ` · ${finding.parameter}` : ''}
                </p>
              </div>

              {finding.previousSeverity && finding.previousSeverity !== finding.severity ? (
                <span className="shrink-0 text-[11px] text-warning">
                  was {SEVERITY_META[finding.previousSeverity].label.toLowerCase()}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}