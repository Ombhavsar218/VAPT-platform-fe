import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Ban,
  Bug,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cpu,
  GitCompare,
  Globe,
  RotateCw,
  Server,
  Terminal,
  TriangleAlert,
  User,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card, CardHeader } from '@/components/common/Card'
import { ErrorState } from '@/components/common/ErrorState'
import { ProgressBar } from '@/components/common/ProgressBar'
import { DescriptionRow, PageHeader } from '@/components/common/PageHeader'
import { Tabs } from '@/components/common/Tabs'
import { FindingStatusBadge, ScanStatusBadge } from '@/components/common/StatusBadge'
import { CounterGrid } from '@/components/scans/CounterGrid'
import { ModuleRunList } from '@/components/scans/ModuleRunList'
import { ScanLogStream } from '@/components/scans/ScanLogStream'
import { StageTimeline } from '@/components/scans/StageTimeline'
import { activeStageName, toneForScan } from '@/components/scans/ScanProgressCell'
import { useAuth } from '@/hooks/useAuth'
import { pollWhile } from '@/hooks/livePolling'
import { useToast } from '@/hooks/useToast'
import { queryKeys } from '@/services/queryKeys'
import { SCAN_STATUS_LABELS, scanService, type ScanDetailData } from '@/services/scans'
import { isScanTerminal, SIMULATION_SPEED } from '@/services/scanSimulation'
import { isScanInFlight } from '@/utils/severity'
import { cn } from '@/utils/cn'
import { formatDateTime, formatElapsed, formatNumber, formatRelativeTime } from '@/utils/format'

/**
 * A single run.
 *
 * While the run is in flight this is the only page in the app that updates
 * itself, so it polls; the moment the run reaches a terminal state the polling
 * stops and the page becomes an ordinary record. Everything below the live
 * header is written to be read afterwards — a finished scan is evidence, not a
 * progress bar.
 */
export function ScanDetailPage() {
  const { scanId = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [tab, setTab] = useState('overview')

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.scans.detail(scanId),
    queryFn: () => scanService.detail(scanId),
    enabled: scanId !== '',
    // Only a run in flight keeps the page moving; a finished one is left alone.
    refetchInterval: (query) => {
      const detail = query.state.data as ScanDetailData | undefined
      return pollWhile(detail ? isScanInFlight(detail.scan.status) : false)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => scanService.cancel(scanId),
    onSuccess: (scan) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scans.root })
      toast.warning(`Scan ${scan.id} cancelled`, 'Partial results were kept and the job was released.')
    },
    onError: (failure: unknown) => {
      toast.error(
        'Could not cancel this scan',
        failure instanceof Error ? failure.message : 'Something went wrong.',
      )
    },
  })

  const rerunMutation = useMutation({
    mutationFn: () => scanService.rerun(scanId, user?.id ?? 'usr-001'),
    onSuccess: (scan) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scans.root })
      toast.success(`Scan ${scan.id} queued`, 'A fresh run with the same configuration has started.')
      navigate(`/scans/${scan.id}`)
    },
    onError: (failure: unknown) => {
      toast.error(
        'Could not re-run this scan',
        failure instanceof Error ? failure.message : 'Something went wrong.',
      )
    },
  })

  if (isError) {
    return (
      <Card>
        <ErrorState
          title="Could not load this scan"
          message={error instanceof Error ? error.message : 'Unknown error.'}
          onRetry={() => void refetch()}
        />
      </Card>
    )
  }

  if (isPending || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading scan…" />
        <Card>
          <div className="h-40 animate-pulse rounded-card bg-surface-2" />
        </Card>
      </div>
    )
  }

  const { scan, row, target, project, profile, moduleRuns, findings, severity } = data
  const live = isScanInFlight(scan.status)
  const terminal = isScanTerminal(scan.status)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Scan ${scan.id}`}
        description={`Run ${scan.sequence} against ${target.name} · ${profile.name} profile`}
        actions={
          <>
            <Button
              variant="ghost"
              leadingIcon={<ArrowLeft className="size-4" />}
              onClick={() => navigate('/scans')}
            >
              Register
            </Button>
            {data.canCancel ? (
              <Button
                variant="secondary"
                leadingIcon={<Ban className="size-4" />}
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                Cancel run
              </Button>
            ) : null}
            {data.canRerun ? (
              <Button
                variant={data.canCancel ? 'ghost' : 'primary'}
                leadingIcon={<RotateCw className="size-4" />}
                loading={rerunMutation.isPending}
                onClick={() => rerunMutation.mutate()}
              >
                Re-run
              </Button>
            ) : null}
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ScanStatusBadge status={scan.status} />
            <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
              <Globe className="size-3.5" aria-hidden="true" />
              <span className="font-mono">{target.baseUrl}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
              <User className="size-3.5" aria-hidden="true" />
              {row.initiatedByName}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
              <Calendar className="size-3.5" aria-hidden="true" />
              {formatRelativeTime(scan.startedAt)}
            </span>
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
                </span>
                Live
              </span>
            ) : null}
          </div>
        }
      />

      {/* Live header: progress, elapsed and what is left. */}
      <Card>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-[15px] font-semibold text-fg">
                {live ? (activeStageName(row) ?? 'In progress') : SCAN_STATUS_LABELS[scan.status]}
              </p>
              <p className="text-[13px] tabular-nums text-fg-muted">
                {live ? (
                  <>
                    {formatElapsed(row.elapsedSeconds)} elapsed ·{' '}
                    <span className="text-fg">
                      {formatElapsed(row.estimatedRemainingSeconds)} left
                    </span>
                  </>
                ) : (
                  <>
                    Ran for {formatElapsed(row.durationSeconds)} ·{' '}
                    {SIMULATION_SPEED}× demo speed
                  </>
                )}
              </p>
            </div>
            <ProgressBar
              value={scan.progress}
              size="lg"
              tone={toneForScan(row)}
              label={`${scan.progress}% complete`}
              className="mt-3"
            />

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RunStat
                label="Endpoints"
                value={formatNumber(scan.counters.endpointsDiscovered)}
                icon={<Server className="size-3.5" />}
              />
              <RunStat
                label="Requests"
                value={formatNumber(scan.counters.requestsTested)}
                icon={<Zap className="size-3.5" />}
              />
              <RunStat
                label="Tests"
                value={formatNumber(scan.counters.testsCompleted)}
                icon={<Cpu className="size-3.5" />}
              />
              <RunStat
                label="Findings"
                value={formatNumber(row.findingCount)}
                icon={<Bug className="size-3.5" />}
                tone={row.findingCount > 0 ? 'warning' : 'neutral'}
              />
            </div>
          </div>

          <div className="border-t border-border-base pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
              <Zap className="size-3.5" aria-hidden="true" />
              Pipeline
            </p>
            <StageTimeline stages={scan.stages} />
          </div>
        </div>

        {scan.status === 'cancelled' ? (
          <p className="mt-4 flex items-start gap-2 rounded-card border border-warning/35 bg-warning/10 px-3.5 py-3 text-[13px] text-fg-muted">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            This run was cancelled, so the stages after the cancellation point never executed. The
            results below are partial.
          </p>
        ) : null}

        {scan.status === 'completed' && data.comparisonScanId ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface-2 px-3.5 py-3">
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
              <GitCompare className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              The previous completed run on this target was{' '}
              <Link
                to={`/scans/${data.comparisonScanId}`}
                className="font-mono font-medium text-accent-text underline-offset-2 hover:underline"
              >
                {data.comparisonScanId}
              </Link>
              .
            </p>
            <Link
              to={`/scans/compare?previous=${data.comparisonScanId}&current=${scan.id}`}
              className="inline-flex items-center gap-1.5 rounded-badge border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent-text hover:bg-accent/16"
            >
              Compare with this run
            </Link>
          </div>
        ) : null}
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'overview', label: 'Overview', icon: <Server className="size-3.5" /> },
          {
            id: 'log',
            label: 'Log',
            count: scan.logs.length,
            icon: <Terminal className="size-3.5" />,
          },
          { id: 'modules', label: 'Checks', count: moduleRuns.length, icon: <Cpu className="size-3.5" /> },
          {
            id: 'findings',
            label: 'Findings',
            count: findings.length,
            icon: <Bug className="size-3.5" />,
          },
        ]}
      />

      {tab === 'overview' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Run" description="What was asked for and what it did." />
            <dl className="mt-3 divide-y divide-[var(--border)]">
              <DescriptionRow label="Project">
                <Link
                  to={`/projects/${project.id}`}
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  {project.name}
                </Link>
                <span className="text-fg-subtle"> · {project.client}</span>
              </DescriptionRow>
              <DescriptionRow label="Target">
                <Link
                  to={`/targets/${target.id}`}
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  {target.name}
                </Link>
                <span className="block font-mono text-xs text-fg-subtle">{target.baseUrl}</span>
              </DescriptionRow>
              <DescriptionRow label="Profile">
                {profile.name}
                <span className="ml-2 text-[11px] capitalize text-fg-subtle">{profile.intensity}</span>
              </DescriptionRow>
              <DescriptionRow label="Checks">{scan.moduleIds.length} modules</DescriptionRow>
              <DescriptionRow label="Requested">{formatDateTime(scan.startedAt)}</DescriptionRow>
              <DescriptionRow label="Finished">
                {scan.completedAt ? formatDateTime(scan.completedAt) : '—'}
              </DescriptionRow>
              <DescriptionRow label="Duration">
                {terminal ? formatElapsed(row.durationSeconds) : 'In progress'}
              </DescriptionRow>
              <DescriptionRow label="On file">
                {data.endpointCount > 0
                  ? `${formatNumber(data.endpointCount)} endpoints · ${formatNumber(data.technologyCount)} technologies`
                  : 'No endpoints on file'}
              </DescriptionRow>
            </dl>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Work counters"
                description="Derived from elapsed run time, so they move while the run does."
              />
              <CounterGrid counters={scan.counters} className="mt-4" />
              {scan.counters.potentialFindings > 0 ? (
                <p className="mt-3 text-[13px] text-fg-muted">
                  <span className="font-medium text-fg">
                    {formatNumber(scan.counters.potentialFindings)}
                  </span>{' '}
                  candidate issue(s) were flagged during analysis.{' '}
                  {terminal
                    ? `${formatNumber(row.findingCount)} became findings.`
                    : 'Findings appear as analysis completes.'}
                </p>
              ) : null}
            </Card>

            {severity.some((slice) => slice.count > 0) ? (
              <Card>
                <CardHeader title="Severity" description="What this run produced." />
                <ul className="mt-3 space-y-2">
                  {severity
                    .filter((slice) => slice.count > 0)
                    .map((slice) => (
                      <li key={slice.severity} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-[13px] capitalize text-fg-muted">
                          {slice.severity}
                        </span>
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className={cn(
                              'block h-full rounded-full',
                              slice.severity === 'critical' && 'bg-sev-critical',
                              slice.severity === 'high' && 'bg-sev-high',
                              slice.severity === 'medium' && 'bg-sev-medium',
                              slice.severity === 'low' && 'bg-sev-low',
                              slice.severity === 'informational' && 'bg-sev-info',
                            )}
                            style={{ width: `${slice.share}%` }}
                          />
                        </span>
                        <span className="w-8 shrink-0 text-right text-[13px] font-medium tabular-nums text-fg">
                          {slice.count}
                        </span>
                      </li>
                    ))}
                </ul>
              </Card>
            ) : null}

            {/* Sibling runs, so the history of this target is reachable. */}
            <Card>
              <CardHeader title="This target's history" description="Move between runs of the same target." />
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<ChevronLeft className="size-3.5" />}
                  disabled={!data.previousScanId}
                  onClick={() => navigate(`/scans/${data.previousScanId}`)}
                >
                  Previous
                </Button>
                <span className="text-[12px] tabular-nums text-fg-subtle">
                  Run {scan.sequence} of this target
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  trailingIcon={<ChevronRight className="size-3.5" />}
                  disabled={!data.nextScanId}
                  onClick={() => navigate(`/scans/${data.nextScanId}`)}
                >
                  Next
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'log' ? (
        <Card>
          <CardHeader
            title="Scanner log"
            description={
              live
                ? 'Newest line last. Scrolling up stops the view following the tail.'
                : 'The full log for this run, newest line last.'
            }
          />
          <ScanLogStream entries={scan.logs} live={live} className="mt-4" maxHeight={520} />
        </Card>
      ) : null}

      {tab === 'modules' ? (
        <Card>
          <CardHeader
            title="Checks"
            description="The modules selected for this run, in the order they executed."
          />
          <ModuleRunList runs={moduleRuns} className="mt-4" />
        </Card>
      ) : null}

      {tab === 'findings' ? (
        <Card>
          <CardHeader
            title="Findings"
            description="Emerging as analysis completes. Nothing here is confirmed until it is verified."
          />
          {findings.length === 0 ? (
            <p className="mt-4 text-[13px] text-fg-subtle">
              {live
                ? 'Analysis has not produced any findings yet. They appear here as the run reaches the analysis stage.'
                : terminal
                  ? 'This run produced no findings. That is not the same as the target being clean — check the coverage matrix.'
                  : 'This run has not produced any findings.'}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {findings.map((finding) => (
                <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-fg">{finding.title}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-fg-subtle">
                        {finding.httpMethod} {finding.endpoint}
                        {finding.parameter ? ` · ${finding.parameter}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded border border-border-base bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-fg-muted">
                        {finding.severity}
                      </span>
                      <FindingStatusBadge status={finding.status} size="xs" />
                    </div>
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
                    <span>{finding.cweId}</span>
                    <span>{finding.owaspId}</span>
                    <span className="capitalize">{finding.confidence} confidence</span>
                    {finding.occurrenceCount > 1 ? (
                      <span>{formatNumber(finding.occurrenceCount)} occurrences</span>
                    ) : null}
                    {finding.requiresManualVerification ? (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <TriangleAlert className="size-3" aria-hidden="true" />
                        Needs manual verification
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  )
}

function RunStat({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  icon: ReactNode
  tone?: 'neutral' | 'warning' | 'accent' | 'success'
}) {
  return (
    <div className="rounded-card border border-border-base bg-surface-2 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-[15px] font-semibold tabular-nums',
          tone === 'warning' && 'text-warning',
          tone === 'accent' && 'text-accent-text',
          tone === 'success' && 'text-success',
          tone === 'neutral' && 'text-fg',
        )}
      >
        {value}
      </p>
    </div>
  )
}
