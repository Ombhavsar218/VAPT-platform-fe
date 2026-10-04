import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Activity,
  Bug,
  ClipboardCheck,
  Crosshair,
  FileText,
  FolderKanban,
  Gauge,
  Radar,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'

import { FindingTrendChart } from '@/components/charts/FindingTrendChart'
import { RiskBarChart } from '@/components/charts/RiskBarChart'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { Card, CardHeader } from '@/components/common/Card'
import { ErrorState } from '@/components/common/ErrorState'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader, ViewAllLink } from '@/components/common/PageHeader'
import { ProgressBar } from '@/components/common/ProgressBar'
import { ScanStatusBadge } from '@/components/common/StatusBadge'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import { Skeleton, SkeletonStatGrid } from '@/components/common/Skeleton'
import { StatCard } from '@/components/common/StatCard'
import { dashboardService } from '@/services/dashboard'
import { queryKeys } from '@/services/queryKeys'
import { formatDate, formatDateTime, formatElapsed, formatNumber, formatRelativeTime, truncate } from '@/utils/format'
import { listFilterHref } from '@/utils/listQuery'

/**
 * Workspace overview.
 *
 * Reads one aggregate endpoint rather than assembling the tiles from several
 * lists, so the numbers on screen are always internally consistent — a project
 * can never show a target count that disagrees with the targets register.
 */
export function DashboardPage() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: () => dashboardService.overview(),
  })

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Workspace-wide security overview across projects, targets, scans and findings."
        />
        <SkeletonStatGrid />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-1" />
          <Skeleton className="h-80 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState
            title="Could not load the workspace overview"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      </div>
    )
  }

  const { counts, severity, trend, activeScans, recentScans, recentFindings, projectRisk, topVulnerabilityTypes, coverageTopGaps, verificationBacklog } = data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Workspace-wide security overview across projects, targets, scans and findings."
        meta={
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            {isFetching ? (
              <>
                <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
                Refreshing…
              </>
            ) : (
              <>Updated {formatRelativeTime(data.generatedAt)}</>
            )}
          </p>
        }
        actions={
          <Link
            to={listFilterHref('/findings', { severity: 'critical,high', open: 'true' })}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-xs transition-colors hover:bg-accent-hover"
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            Triage critical &amp; high
          </Link>
        }
      />

      {/* Headline numbers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open findings"
          value={formatNumber(counts.openFindings)}
          icon={<Bug className="size-4" />}
          to={listFilterHref('/findings', { open: 'true' })}
          caption={
            counts.criticalOpen + counts.highOpen > 0 ? (
              <>
                <span className="font-medium text-sev-critical">{counts.criticalOpen} critical</span> ·{' '}
                <span className="font-medium text-sev-high">{counts.highOpen} high</span>
              </>
            ) : (
              'Nothing critical or high is open.'
            )
          }
          accentClassName="bg-sev-critical"
        />
        <StatCard
          label="Scans in progress"
          value={formatNumber(counts.runningScans)}
          icon={<Radar className="size-4" />}
          to={listFilterHref('/scans', { inflight: 'true' })}
          caption={
            counts.runningScans > 0
              ? 'Occupying worker slots right now.'
              : 'No scans are currently running.'
          }
          accentClassName="bg-accent"
        />
        <StatCard
          label="Awaiting verification"
          value={formatNumber(counts.pendingVerification)}
          icon={<ClipboardCheck className="size-4" />}
          to={listFilterHref('/verification', { decision: 'pending' })}
          caption="Automated signals that still need an analyst."
          accentClassName="bg-warning"
        />
        <StatCard
          label="Reports ready"
          value={formatNumber(counts.reportsReady)}
          icon={<FileText className="size-4" />}
          to={listFilterHref('/reports', { status: 'ready' })}
          caption={
            counts.unassignedTargets > 0
              ? `${counts.unassignedTargets} target${counts.unassignedTargets === 1 ? '' : 's'} not yet assigned to a project.`
              : 'Every target belongs to a project.'
          }
          accentClassName="bg-success"
        />
      </div>

      {/* Severity + trend */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Open findings by severity"
            description="Across every project in the workspace."
            actions={<ViewAllLink to={listFilterHref('/findings', { open: 'true' })}>Register</ViewAllLink>}
          />
          <div className="mt-4">
            <SeverityDonut
              data={severity}
              footnote="Open, potential, needs-retest and reopened findings."
            />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Finding volume, last 30 days"
            description="Newly opened and closed issues, with the open backlog on the same axis."
          />
          <div className="mt-4">
            <FindingTrendChart data={trend} />
          </div>
        </Card>
      </div>

      {/* Live scans + risk */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Active scans"
            description="Pipeline progress for everything currently occupying a worker."
            actions={<ViewAllLink to="/scans">All scans</ViewAllLink>}
          />
          <div className="mt-4">
            {activeScans.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<Radar className="size-5" />}
                title="No scans in progress"
                description="Queued work will appear here as soon as a scan starts."
                action={
                  <Link
                    to="/scans/new"
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
                  >
                    Configure a scan
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {activeScans.map((entry) => (
                  <li key={entry.scan.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/scans/${entry.scan.id}`}
                            className="truncate text-[13px] font-medium text-fg transition-colors hover:text-accent"
                          >
                            {entry.targetName}
                          </Link>
                          <ScanStatusBadge status={entry.scan.status} size="xs" />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-fg-subtle">
                          {entry.projectName} · {entry.scan.profileId} profile ·{' '}
                          {entry.scan.counters.testsCompleted.toLocaleString()} tests run
                        </p>
                      </div>
                      <p className="shrink-0 text-xs tabular-nums text-fg-subtle">
                        {formatElapsed(entry.elapsedSeconds)}
                      </p>
                    </div>
                    <ProgressBar
                      className="mt-2.5"
                      size="sm"
                      value={entry.scan.progress}
                      tone={entry.scan.status === 'analyzing' ? 'warning' : 'accent'}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Project risk"
            description="Weighted by open severity, confirmed issues count heaviest."
            actions={<ViewAllLink to="/projects">Projects</ViewAllLink>}
          />
          <div className="mt-4">
            {projectRisk.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<FolderKanban className="size-5" />}
                title="No open findings"
                description="Nothing to rank until a scan produces findings."
              />
            ) : (
              <RiskBarChart
                data={projectRisk.map((row) => ({
                  id: row.projectId,
                  label: row.name.split('—')[0]?.trim() ?? row.name,
                  value: row.riskScore,
                }))}
                seriesLabel="Risk score"
              />
            )}
          </div>
        </Card>
      </div>

      {/* Vulnerability classes + OWASP gaps */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Most frequent vulnerability classes"
            description="Open findings grouped by what the scanner detected."
            actions={<ViewAllLink to="/findings">All findings</ViewAllLink>}
          />
          <div className="mt-4">
            {topVulnerabilityTypes.length === 0 ? (
              <EmptyState size="sm" title="No open findings" />
            ) : (
              <ol className="space-y-2.5">
                {topVulnerabilityTypes.map((entry) => (
                  <li key={entry.vulnerabilityTypeId} className="flex items-center gap-3">
                    <SeverityBadge severity={entry.severity} compact />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                      {entry.name}
                    </span>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-fg">
                      {entry.count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="OWASP coverage gaps"
            description="Categories where the least of the catalogue has produced a finding."
            actions={<ViewAllLink to="/coverage">Coverage</ViewAllLink>}
          />
          <ul className="mt-4 space-y-3">
            {coverageTopGaps.map((row) => (
              <li key={row.owaspId}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] text-fg">
                    <span className="font-mono text-xs text-fg-subtle">{row.owaspId.split(':')[0]}</span>{' '}
                    {row.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
                    {row.typesWithFindings}/{row.typesAvailable} types
                  </span>
                </div>
                <ProgressBar
                  className="mt-1.5"
                  size="sm"
                  value={row.coveragePercent}
                  tone={row.coveragePercent === 0 ? 'danger' : row.coveragePercent < 60 ? 'warning' : 'accent'}
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent findings"
            description="Latest activity in the vulnerability register."
            actions={<ViewAllLink to="/findings">Register</ViewAllLink>}
          />
          <div className="mt-4">
            {recentFindings.length === 0 ? (
              <EmptyState size="sm" title="Nothing detected yet" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recentFindings.map((finding) => (
                  <li key={finding.findingId} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <SeverityBadge severity={finding.severity} compact className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/findings/${finding.findingId}`}
                        className="block truncate text-[13px] text-fg transition-colors hover:text-accent"
                      >
                        {truncate(finding.title, 72)}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-fg-subtle">
                        {finding.targetName} · {formatRelativeTime(finding.detectedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent scans"
            description="The last scans started in this workspace."
            actions={<ViewAllLink to="/scans">All scans</ViewAllLink>}
          />
          <div className="mt-4">
            {recentScans.length === 0 ? (
              <EmptyState size="sm" title="No scans yet" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recentScans.map(({ scan, targetName, projectName }) => (
                  <li key={scan.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/scans/${scan.id}`}
                        className="block truncate text-[13px] text-fg transition-colors hover:text-accent"
                      >
                        {targetName}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-fg-subtle">
                        {projectName} · {scan.profileId} · {formatDate(scan.startedAt)}
                      </p>
                    </div>
                    <ScanStatusBadge status={scan.status} size="xs" className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Footer summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-border-base bg-surface px-5 py-3.5 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <Activity className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Snapshot taken {formatDateTime(data.generatedAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <Crosshair className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Highest-risk project:{' '}
          {projectRisk.length > 0 ? (
            <Link
              to={`/projects/${projectRisk[0]?.projectId ?? ''}`}
              className="font-medium text-fg transition-colors hover:text-accent"
            >
              {projectRisk[0]?.name} ({projectRisk[0]?.riskScore})
            </Link>
          ) : (
            'none'
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <Gauge className="size-3.5 text-fg-subtle" aria-hidden="true" />
          {verificationBacklog} potential findings queued for manual verification
        </span>
      </div>
    </div>
  )
}
