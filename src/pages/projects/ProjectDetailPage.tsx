import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  Bug,
  CalendarRange,
  Crosshair,
  FileText,
  FolderKanban,
  Radar,
  ScanLine,
  ShieldCheck,
  User,
} from 'lucide-react'

import { Card, CardHeader } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { DescriptionRow, PageHeader, ViewAllLink } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { ProgressBar } from '@/components/common/ProgressBar'
import { RiskScore } from '@/components/common/RiskScore'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { AssessmentTypeLabel, EnvironmentBadge, ScanStatusBadge } from '@/components/common/StatusBadge'
import { Skeleton } from '@/components/common/Skeleton'
import { Button } from '@/components/common/Button'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import { projectDetailService } from '@/services/dashboard'
import { queryKeys } from '@/services/queryKeys'
import { ApiError } from '@/services/transport'
import { formatDate, formatDuration, formatNumber, formatRelativeTime } from '@/utils/format'
import { listFilterHref } from '@/utils/listQuery'
import type { Scan } from '@/types'

/**
 * Project detail.
 *
 * Reads a single aggregate so the tiles, the severity donut and the target table
 * all describe the same snapshot. The scan list is capped to the most recent run
 * per target — a full scan history belongs on the scans register, which arrives
 * with Stage 3.
 */
export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const [includeCompleted, setIncludeCompleted] = useState(false)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => projectDetailService.load(projectId),
    enabled: Boolean(projectId),
  })

  const scans = useMemo(() => {
    if (!data) return []
    const latestPerTarget = new Map<string, Scan>()
    for (const scan of data.scans) {
      const existing = latestPerTarget.get(scan.targetId)
      if (!existing || scan.startedAt > existing.startedAt) latestPerTarget.set(scan.targetId, scan)
    }
    const rows = [...latestPerTarget.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    return includeCompleted ? rows : rows.filter((scan) => scan.status !== 'cancelled')
  }, [data, includeCompleted])

  const scanColumns = useMemo<Column<Scan>[]>(
    () => [
      {
        key: 'id',
        header: 'Scan',
        primaryOnMobile: true,
        cell: (scan) => (
          <div className="min-w-0">
            <Link
              to={`/scans/${scan.id}`}
              className="font-mono text-[13px] text-fg transition-colors hover:text-accent"
            >
              {scan.id}
            </Link>
            <p className="text-xs text-fg-subtle">
              {scan.profileId} profile · {formatDate(scan.startedAt)}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (scan) => scan.status,
        cell: (scan) => <ScanStatusBadge status={scan.status} size="xs" />,
      },
      {
        key: 'progress',
        header: 'Progress',
        sortValue: (scan) => scan.progress,
        cell: (scan) =>
          scan.status === 'completed' || scan.status === 'failed' || scan.status === 'cancelled' ? (
            <span className="text-[13px] tabular-nums text-fg-muted">100%</span>
          ) : (
            <ProgressBar className="max-w-32" size="sm" value={scan.progress} />
          ),
      },
      {
        key: 'endpoints',
        header: 'Endpoints',
        align: 'right',
        hideBelowLg: true,
        sortValue: (scan) => scan.counters.endpointsDiscovered,
        cell: (scan) => (
          <span className="tabular-nums text-fg-muted">
            {formatNumber(scan.counters.endpointsDiscovered)}
          </span>
        ),
      },
      {
        key: 'findingCount',
        header: 'Findings',
        align: 'right',
        sortValue: (scan) => scan.findingCount,
        cell: (scan) => <span className="tabular-nums text-fg-muted">{scan.findingCount}</span>,
      },
      {
        key: 'duration',
        header: 'Duration',
        align: 'right',
        hideBelowLg: true,
        sortValue: (scan) => scan.durationSeconds,
        cell: (scan) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatDuration(scan.durationSeconds)}
          </span>
        ),
      },
    ],
    [],
  )

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title="Project" description="Loading engagement details…" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_unused, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="space-y-6">
        <PageHeader title="Project" />
        <Card>
          <ErrorState
            title={notFound ? 'This project does not exist' : 'Could not load the project'}
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={notFound ? undefined : () => void refetch()}
            retryLabel="Reload"
          />
          {notFound ? (
            <div className="flex justify-center pb-6">
              <Link to="/projects">
                <Button variant="secondary">Back to projects</Button>
              </Link>
            </div>
          ) : null}
        </Card>
      </div>
    )
  }

  const { project, targets, severity, riskScore, openFindingCount, totalFindingCount, reportCount } = data
  const runningScans = data.scans.filter(
    (scan) => scan.status === 'running' || scan.status === 'analyzing' || scan.status === 'queued' || scan.status === 'initializing',
  ).length
  const overdue = project.endDate < new Date().toISOString().slice(0, 10) && project.status !== 'completed'

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={project.description}
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            <span className="text-fg-muted">{project.client}</span>
            <AssessmentTypeLabel type={project.assessmentType} />
            <span className="flex items-center gap-1.5 text-fg-muted">
              <CalendarRange className="size-3.5 text-fg-subtle" aria-hidden="true" />
              {formatDate(project.startDate)} → {formatDate(project.endDate)}
              {overdue ? <span className="text-warning">· window elapsed</span> : null}
            </span>
          </div>
        }
        actions={
          <>
            <Link to={listFilterHref('/findings', { project: project.id, open: 'true' })}>
              <Button variant="secondary" leadingIcon={<Bug className="size-4" />}>
                Open findings
              </Button>
            </Link>
            <Link to={`/scans/new?project=${project.id}`}>
              <Button variant="primary" leadingIcon={<Radar className="size-4" />}>
                New scan
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-fg-muted">Risk score</p>
          <div className="mt-3">
            <RiskScore value={riskScore} size="md" label="Weighted open findings" />
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-fg-muted">Open findings</p>
          <p className="mt-3 text-[28px] font-semibold leading-none tabular-nums text-fg">
            {formatNumber(openFindingCount)}
          </p>
          <p className="mt-2 text-xs text-fg-subtle">
            {formatNumber(totalFindingCount)} recorded in total
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-fg-muted">Targets in scope</p>
          <p className="mt-3 text-[28px] font-semibold leading-none tabular-nums text-fg">
            {formatNumber(targets.length)}
          </p>
          <p className="mt-2 text-xs text-fg-subtle">
            {formatNumber(runningScans)} scan{runningScans === 1 ? '' : 's'} in progress
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-fg-muted">Reports</p>
          <p className="mt-3 text-[28px] font-semibold leading-none tabular-nums text-fg">
            {formatNumber(reportCount)}
          </p>
          <p className="mt-2 text-xs text-fg-subtle">Deliverables generated for this engagement</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Open findings by severity"
            description="Only open, potential, needs-retest and reopened issues."
          />
          <div className="mt-4">
            <SeverityDonut data={severity} height={180} />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Engagement details" />
          <dl className="mt-3 divide-y divide-[var(--border)]">
            <DescriptionRow label="Client">{project.client}</DescriptionRow>
            <DescriptionRow label="Owner">
              <span className="flex items-center gap-1.5">
                <User className="size-3.5 text-fg-subtle" aria-hidden="true" />
                {project.owner}
              </span>
            </DescriptionRow>
            <DescriptionRow label="Status">
              <span className="capitalize">{project.status}</span>
            </DescriptionRow>
            <DescriptionRow label="Created">{formatDate(project.createdAt)}</DescriptionRow>
            <DescriptionRow label="Last updated">{formatRelativeTime(project.updatedAt)}</DescriptionRow>
          </dl>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">Targets in scope</h2>
            <p className="text-[13px] text-fg-muted">
              Authorised assets assigned to this engagement.
            </p>
          </div>
          <Link to={listFilterHref('/targets', { project: project.id })}>
            <Button variant="secondary" size="sm" leadingIcon={<Crosshair className="size-3.5" />}>
              Open target register
            </Button>
          </Link>
        </div>

        {targets.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderKanban className="size-5" />}
              title="No targets assigned yet"
              description="Add the authorised assets for this engagement to start scanning them."
              action={
                <Link to="/targets">
                  <Button variant="primary">Add a target</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {targets.map((target) => (
              <li key={target.id}>
                <Link
                  to={`/targets/${target.id}`}
                  className="block rounded-card border border-border-base bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-fg">{target.name}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-fg-subtle">{target.baseUrl}</p>
                    </div>
                    <EnvironmentBadge environment={target.environment} />
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-fg-muted">
                    <span className="flex items-center gap-1.5">
                      <Bug className="size-3.5 text-fg-subtle" aria-hidden="true" />
                      {target.openFindings} open
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ScanLine className="size-3.5 text-fg-subtle" aria-hidden="true" />
                      {target.lastScanAt ? formatRelativeTime(target.lastScanAt) : 'never scanned'}
                    </span>
                    {target.openFindings > 0 ? <SeverityBadge severity="high" compact className="ml-auto" /> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">Latest scan per target</h2>
            <p className="text-[13px] text-fg-muted">
              {includeCompleted ? 'Including cancelled runs.' : 'Cancelled runs are hidden.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={includeCompleted ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setIncludeCompleted((value) => !value)}
              aria-pressed={includeCompleted}
            >
              {includeCompleted ? 'Hide cancelled' : 'Show cancelled'}
            </Button>
            <ViewAllLink to={listFilterHref('/scans', { project: project.id })}>All scans</ViewAllLink>
          </div>
        </div>

        {scans.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Radar className="size-5" />}
              title="No scans for this project yet"
              description="Configure a scan to start collecting findings against the authorised scope."
              action={
                <Link to="/scans/new">
                  <Button variant="primary">Configure a scan</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <DataTable
            columns={scanColumns}
            rows={scans}
            rowKey={(scan) => scan.id}
            loading={false}
            caption="The most recent scan for each target in this project."
          />
        )}
      </section>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border-base bg-surface px-5 py-3.5 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Findings are shown as recorded by the scanner; none are promoted to confirmed
          without analyst verification.
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <FileText className="size-3.5 text-fg-subtle" aria-hidden="true" />
          {reportCount} report{reportCount === 1 ? '' : 's'} generated
        </span>
      </div>
    </div>
  )
}
