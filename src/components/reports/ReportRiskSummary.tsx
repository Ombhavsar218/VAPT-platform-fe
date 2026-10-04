import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { RiskScore } from '@/components/common/RiskScore'
import { StatCard } from '@/components/common/StatCard'
import type { ReportSummary } from '@/services/reports'
import { BadgeCheck, Clock3, Layers3, Target } from 'lucide-react'
import { formatDate, formatNumber } from '@/utils/format'

/**
 * Executive summary of a report.
 *
 * The first page of any assessment a client reads is a risk number and a short
 * list of what to do about it, so that is what this block leads with. The
 * severity donut reuses the app-wide chart rather than a bespoke one, so a
 * report and the dashboard can never disagree about the same set of findings.
 */
export function ReportRiskSummary({ summary }: { summary: ReportSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Risk score"
          value={<RiskScore value={summary.riskScore} size="md" showValue />}
          icon={<Target className="size-4" />}
          accentClassName={
            summary.riskScore >= 70
              ? 'bg-danger'
              : summary.riskScore >= 45
                ? 'bg-warning'
                : 'bg-success'
          }
          caption="Weighted by severity, saturating at 100."
        />
        <StatCard
          label="Reported findings"
          value={formatNumber(summary.totalFindings)}
          icon={<Layers3 className="size-4" />}
          accentClassName="bg-fg-subtle"
          caption="Confirmed, open and awaiting retest."
        />
        <StatCard
          label="Critical or high"
          value={formatNumber(summary.criticalOrHigh)}
          icon={<BadgeCheck className="size-4" />}
          accentClassName={summary.criticalOrHigh > 0 ? 'bg-sev-critical' : 'bg-success'}
          caption="What a client will read the summary for."
        />
        <StatCard
          label="Awaiting retest"
          value={formatNumber(summary.outstandingRetestCount)}
          icon={<Clock3 className="size-4" />}
          accentClassName={summary.outstandingRetestCount > 0 ? 'bg-sev-medium' : 'bg-success'}
          caption="Remediation claimed but not yet re-tested."
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SeverityDonut
            data={summary.severity}
            footnote="Counts are of findings quoted in this report, not the whole workspace."
          />
        </div>

        <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-3 rounded-card border border-border-base bg-surface p-5 lg:grid-cols-1">
          <Row label="Confirmed by an analyst" value={formatNumber(summary.confirmedCount)} />
          <Row label="Still open" value={formatNumber(summary.openCount)} />
          <Row label="Distinct vulnerability types" value={formatNumber(summary.distinctVulnerabilityTypes)} />
          <Row label="OWASP categories hit" value={formatNumber(summary.owaspCategoriesHit)} />
          <Row label="First detected" value={formatDate(summary.firstDetected)} />
          <Row label="Last detected" value={formatDate(summary.lastDetected)} />
          <Row label="Endpoints tested" value={formatNumber(summary.endpointsTested)} />
          <Row label="Requests sent" value={formatNumber(summary.requestsTested)} />
          <Row label="Tests completed" value={formatNumber(summary.testsCompleted)} />
        </dl>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="text-[13px] font-medium tabular-nums text-fg">{value}</dd>
    </div>
  )
}