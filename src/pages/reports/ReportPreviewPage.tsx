import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card, CardHeader } from '@/components/common/Card'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/common/PageHeader'
import { Spinner } from '@/components/common/Spinner'
import { Tabs } from '@/components/common/Tabs'
import { ReportCover } from '@/components/reports/ReportCover'
import { ReportRiskSummary } from '@/components/reports/ReportRiskSummary'
import { ReportSectionCard } from '@/components/reports/ReportSectionCard'
import { GenerateReportModal } from '@/components/reports/GenerateReportModal'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { queryKeys } from '@/services/queryKeys'
import { reportService, type ReportDetailData } from '@/services/reports'
import { SEVERITIES } from '@/types'
import { SEVERITY_META } from '@/utils/severity'
import { formatDateTime, formatNumber } from '@/utils/format'

/**
 * Report preview (`/reports/:reportId`).
 *
 * This is the deliverable as the client will see it, assembled from the live
 * dataset rather than from a stored rendering. The tabs mirror the structure of a
 * real assessment - summary, findings, methodology, activity - because the whole
 * point of a preview is to check the document before it leaves the building.
 */
export function ReportPreviewPage() {
  const { reportId = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('findings')
  const [regenerating, setRegenerating] = useState(false)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.reports.detail(reportId),
    queryFn: () => reportService.detail(reportId),
    enabled: reportId !== '',
  })

  const download = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Sign in to download a report.')
      return reportService.download(reportId, user.id)
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.root })
      toast.success(
        'Download recorded',
        `${result.format.toUpperCase()} · version ${result.version} handed to the client.`,
      )
    },
    onError: (mutationError) => {
      toast.error(
        'Could not download the report',
        mutationError instanceof Error ? mutationError.message : 'Unknown error.',
      )
    },
  })

  if (isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-[13px] text-fg-muted">
        <Spinner />
        Composing the report…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Report" />
        <Card>
          <ErrorState
            title="Could not load this report"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to reports
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.report.name}
        description={`Preview of the ${data.report.format.toUpperCase()} deliverable for ${data.client}.`}
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<RefreshCcw className="size-4" />}
              onClick={() => setRegenerating(true)}
            >
              Regenerate
            </Button>
            <Button
              variant="primary"
              leadingIcon={<Download className="size-4" />}
              loading={download.isPending}
              disabled={!data.downloadable}
              onClick={() => download.mutate()}
            >
              Download
            </Button>
          </>
        }
      />

      <ReportCover detail={data} />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'summary', label: 'Summary' },
          { id: 'findings', label: 'Findings', count: data.summary.totalFindings },
          { id: 'methodology', label: 'Methodology' },
          { id: 'activity', label: 'Activity', count: data.activity.length },
        ]}
      />

      {tab === 'summary' ? <SummaryTab detail={data} /> : null}

      {tab === 'findings' ? <FindingsTab detail={data} /> : null}

      {tab === 'methodology' ? <MethodologyTab detail={data} /> : null}

      {tab === 'activity' ? <ActivityTab detail={data} /> : null}

      <GenerateReportModal
        open={regenerating}
        onClose={() => setRegenerating(false)}
        options={
          data.scan
            ? [
                {
                  id: data.scan.id,
                  label: `${data.scan.id} · ${data.targets[0]?.name ?? 'Unknown target'}`,
                  projectId: data.report.projectId,
                  targetId: data.report.targetId ?? data.scan.targetId,
                  targetName: data.targets[0]?.name ?? 'Unknown target',
                  completedAt: data.scan.completedAt,
                  findingCount: data.summary.totalFindings,
                },
              ]
            : []
        }
        onGenerated={() => void refetch()}
        initialScanId={data.scan?.id}
        initialFormat={data.report.format}
        initialName={data.report.name}
      />
    </div>
  )
}

function SummaryTab({ detail }: { detail: ReportDetailData }) {
  return (
    <div className="space-y-3">
      <ReportRiskSummary summary={detail.summary} />
      <Card>
        <CardHeader
          title="What this report covers"
          description="The inclusion rule matters: unverified scanner signals are excluded, so every number here is one an analyst has stood behind."
        />
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
          {formatNumber(detail.summary.totalFindings)} findings are quoted across{' '}
          {detail.targets.length} target{detail.targets.length === 1 ? '' : 's'}, covering{' '}
          {formatNumber(detail.summary.distinctVulnerabilityTypes)} distinct vulnerability types
          across {formatNumber(detail.summary.owaspCategoriesHit)} OWASP 2025 categories.{' '}
          {detail.summary.outstandingRetestCount > 0
            ? `${formatNumber(detail.summary.outstandingRetestCount)} of them are awaiting a retest, so their remediation is claimed but unproven.`
            : 'None are awaiting a retest, so every remediation claim in this report has been re-tested.'}
        </p>
      </Card>
    </div>
  )
}

function FindingsTab({ detail }: { detail: ReportDetailData }) {
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  const groups = useMemo(
    () =>
      severityFilter === 'all'
        ? detail.groups
        : detail.groups.filter((group) => group.severity === severityFilter),
    [detail.groups, severityFilter],
  )

  if (detail.groups.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Nothing to report"
          description="No finding in this scope has passed verification, so the deliverable has no findings section."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSeverityFilter('all')}
          aria-pressed={severityFilter === 'all'}
          className={
            'rounded-badge border px-2 py-1 text-[12px] font-medium transition-colors ' +
            (severityFilter === 'all'
              ? 'border-accent bg-accent/12 text-accent'
              : 'border-border-base bg-surface text-fg-muted hover:border-border-strong')
          }
        >
          All severities
        </button>
        {detail.groups.map((group) => (
          <button
            key={group.severity}
            type="button"
            onClick={() => setSeverityFilter(group.severity)}
            aria-pressed={severityFilter === group.severity}
            className={
              'rounded-badge border px-2 py-1 text-[12px] font-medium transition-colors ' +
              (severityFilter === group.severity
                ? `${SEVERITY_META[group.severity].border} ${SEVERITY_META[group.severity].surface}`
                : 'border-border-base bg-surface text-fg-muted hover:border-border-strong')
            }
          >
            {SEVERITY_META[group.severity].label} ({formatNumber(group.count)})
          </button>
        ))}
      </div>

      {groups.map((group) => (
        <section key={group.severity} className="space-y-2">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
            {SEVERITY_META[group.severity].label} · {formatNumber(group.count)}
          </h2>
          {group.findings.map((section) => (
            <ReportSectionCard key={section.findingId} section={section} />
          ))}
        </section>
      ))}

      {SEVERITIES.filter((severity) => !detail.groups.some((group) => group.severity === severity)).map(
        (severity) => (
          <p key={severity} className="text-[12px] text-fg-subtle">
            No {SEVERITY_META[severity].label.toLowerCase()} findings in this scope.
          </p>
        ),
      )}
    </div>
  )
}

function MethodologyTab({ detail }: { detail: ReportDetailData }) {
  const { methodology } = detail

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader title="Approach" description="How the assessment was carried out." />
        <dl className="mt-4 space-y-3">
          <Row label="Scan profile" value={methodology.profileName} />
          <Row label="Intensity" value={methodology.profileIntensity} />
          <Row
            label="Modules exercised"
            value={`${methodology.moduleIds.length} (${formatNumber(methodology.testCount)} tests)`}
          />
          <Row
            label="Test window"
            value={
              methodology.scanWindow
                ? `${formatDateTime(methodology.scanWindow.startedAt)} – ${
                    methodology.scanWindow.completedAt
                      ? formatDateTime(methodology.scanWindow.completedAt)
                      : 'ongoing'
                  }`
                : 'Project-wide, no single run'
            }
          />
          <Row
            label="Authorisation"
            value={methodology.authorisationConfirmed ? 'On file' : 'Not recorded for every target'}
          />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Modules" description="Every module that contributed to this report." />
        <ul className="mt-4 space-y-1.5">
          {methodology.moduleNames.length === 0 ? (
            <li className="text-[13px] text-fg-subtle">No modules recorded.</li>
          ) : (
            methodology.moduleNames.map((name) => (
              <li key={name} className="text-[13px] text-fg-muted">
                {name}
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Scope" description="Every URL this report makes claims about." />
        <ul className="mt-4 space-y-1.5">
          {methodology.scopeLines.map((line) => (
            <li key={line} className="font-mono text-[12px] text-fg-muted">
              {line}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function ActivityTab({ detail }: { detail: ReportDetailData }) {
  if (detail.activity.length === 0) {
    return (
      <Card>
        <CardHeader
          title="No recorded activity"
          description="Nothing has been generated or downloaded against this report yet."
        />
      </Card>
    )
  }

  return (
    <Card flush>
      <ul className="divide-y divide-border-base">
        {detail.activity.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">
                {entry.action === 'report.generate'
                  ? 'Report generated'
                  : entry.action === 'report.download'
                    ? 'Report downloaded'
                    : entry.action}
              </p>
              <p className="truncate text-[11px] text-fg-subtle">
                {entry.actor} · {formatDateTime(entry.timestamp)}
              </p>
            </div>
            <span
              className={
                'shrink-0 text-[11px] font-medium ' +
                (entry.outcome === 'success' ? 'text-success' : 'text-danger')
              }
            >
              {entry.outcome}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-fg">{value}</dd>
    </div>
  )
}