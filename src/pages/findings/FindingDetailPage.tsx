import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ExternalLink,
  Fingerprint,
  Layers,
  MapPin,
  Radar,
  ScanLine,
  ShieldAlert,
} from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card, CardHeader } from '@/components/common/Card'
import { ConfidenceBadge } from '@/components/common/ConfidenceBadge'
import { ErrorState } from '@/components/common/ErrorState'
import { Select } from '@/components/common/Form'
import { PageHeader } from '@/components/common/PageHeader'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import { Skeleton } from '@/components/common/Skeleton'
import { EnvironmentBadge, FindingStatusBadge, ScanStatusBadge } from '@/components/common/StatusBadge'
import { Tabs, type TabItem } from '@/components/common/Tabs'
import { EvidencePanel } from '@/components/findings/EvidencePanel'
import { FindingStatusFlow } from '@/components/findings/FindingStatusFlow'
import { VerificationDecisionForm } from '@/components/findings/VerificationDecisionForm'
import { useAuth } from '@/hooks/useAuth'
import { findingService, type FindingDetailData } from '@/services/findings'
import { userService } from '@/services/projects'
import { queryKeys } from '@/services/queryKeys'
import { verificationService } from '@/services/verification'
import { FINDING_STATUSES } from '@/types'
import { FINDING_STATUS_META } from '@/utils/severity'
import { formatDateTime, formatRelativeTime } from '@/utils/format'

/**
 * Finding detail.
 *
 * The tabs split along a real seam: what the scanner *saw* (evidence, reasoning)
 * versus what a human *decided* (verification, activity). A reviewer checking a
 * false positive needs the first; a lead auditing a decision needs the second.
 */

/**
 * Statuses a reviewer can set directly. Confirmed, false positive and needs
 * retest are reachable only through a verification decision — see
 * `findingService.setStatus`.
 */
const REVIEW_STATUSES = FINDING_STATUSES.filter(
  (status) => status !== 'confirmed' && status !== 'false_positive' && status !== 'needs_retest',
)
type ReviewStatus = (typeof REVIEW_STATUSES)[number]

function Overview({ data }: { data: FindingDetailData }) {
  const { finding, scan, vulnerabilityType, row } = data

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="What the scanner reported" />
        <div className="space-y-3 text-[13px] leading-relaxed text-fg-muted">
          <p>{finding.description}</p>
          <div>
            <h4 className="text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">
              Why it was flagged
            </h4>
            <p className="mt-1">{finding.detectionReason}</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">
              Impact
            </h4>
            <p className="mt-1">{finding.impact}</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">
              Remediation
            </h4>
            <p className="mt-1">{finding.remediation}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Occurrence" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Detail label="Endpoint" icon={<MapPin className="size-3.5" />}>
            <span className="font-mono break-all">{row.httpMethod} {row.endpoint}</span>
          </Detail>
          <Detail label="Parameter">
            <span className="font-mono">{row.parameter ?? '—'}</span>
          </Detail>
          <Detail label="Occurrences">
            {row.occurrenceCount} across {data.occurrences.length} recorded{' '}
            {data.occurrences.length === 1 ? 'entry' : 'entries'}
          </Detail>
          <Detail label="Severity">
            <SeverityBadge severity={row.severity} />
          </Detail>
          <Detail label="Confidence">
            <ConfidenceBadge confidence={row.confidence} />
          </Detail>
          <Detail label="Weakness">
            {row.cweId} · {row.owaspId}
            {vulnerabilityType ? ` (${vulnerabilityType.name})` : ''}
          </Detail>
          <Detail label="First detected">{formatDateTime(row.firstDetected)}</Detail>
          <Detail label="Last detected">{formatRelativeTime(row.lastDetected)}</Detail>
          <Detail label="Scan">
            {scan ? (
              <Link to={`/scans/${scan.id}`} className="text-accent-text underline-offset-2 hover:underline">
                {scan.id}
              </Link>
            ) : (
              '—'
            )}
          </Detail>
        </dl>
      </Card>

      <Card>
        <CardHeader title="References" />
        {finding.references.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">No external references recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {finding.references.map((reference) => (
              <li key={reference.id} className="flex items-center gap-2 text-[13px]">
                <ExternalLink className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="text-fg-muted">{reference.label}</span>
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate font-mono text-xs text-accent-text underline-offset-2 hover:underline"
                >
                  {reference.url}
                </a>
                <span className="ml-auto shrink-0 text-[11px] tracking-[0.12em] text-fg-subtle uppercase">
                  {reference.source}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Detail({
  label,
  icon,
  children,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-fg-subtle uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] text-fg">{children}</dd>
    </div>
  )
}

function Occurrences({ data }: { data: FindingDetailData }) {
  if (data.occurrences.length <= 1) {
    return (
      <Card>
        <p className="text-[13px] text-fg-subtle">
          This weakness has only been recorded once on this target.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title={`Same weakness on ${data.target?.name ?? 'this target'}`}
        description="Each row is a separate finding the scanner raised at a different location."
      />
      <ul className="divide-y divide-border-base">
        {data.occurrences.map((occurrence) => (
          <li key={occurrence.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <Link
              to={`/findings/${occurrence.id}`}
              className="min-w-0 flex-1 truncate font-mono text-xs text-accent-text underline-offset-2 hover:underline"
            >
              {occurrence.httpMethod} {occurrence.endpoint}
            </Link>
            {occurrence.parameter ? (
              <span className="font-mono text-[11px] text-fg-subtle">{occurrence.parameter}</span>
            ) : null}
            <span className="text-[11px] text-fg-subtle">{occurrence.occurrenceCount}×</span>
            <FindingStatusBadge status={occurrence.status} size="xs" />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Verification({ data, actorId }: { data: FindingDetailData; actorId: string }) {
  const { task, finding, row } = data
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const decide = useMutation({
    mutationFn: (input: { decision: 'confirmed' | 'false_positive' | 'needs_retest'; notes: string }) =>
      verificationService.decide(task?.id ?? '', {
        ...input,
        actor: actorId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.findings.root })
      void queryClient.invalidateQueries({ queryKey: queryKeys.verification.root })
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'Unknown error.'),
  })

  if (!task) {
    return (
      <Card>
        <CardHeader title="Manual verification" />
        <p className="text-[13px] text-fg-muted">
          {finding.requiresManualVerification
            ? 'This finding is flagged for manual verification but has no task in the queue.'
            : 'The scanner considers this deterministic enough not to need a human.'}
        </p>
        <Link to="/verification" className="mt-3 inline-block text-[13px] text-accent-text underline-offset-2 hover:underline">
          Open the verification queue
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Scanner rationale"
          description={`Task ${task.id} · raised ${formatRelativeTime(task.createdAt)}`}
        />
        <p className="text-[13px] leading-relaxed text-fg-muted">{task.scannerRationale}</p>
        {task.dueDate ? (
          <p className="mt-2 text-xs text-fg-subtle">Due {formatDateTime(task.dueDate)}</p>
        ) : null}
      </Card>

      {task.decision === null ? (
        <Card>
          <CardHeader
            title="Record your decision"
            description="This is the only path to confirmed, false positive or needs retest."
          />
          <VerificationDecisionForm
            onSubmit={(input) => {
              setError(null)
              decide.mutate(input)
            }}
            pending={decide.isPending}
            error={error}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Decision" description={`Recorded ${formatRelativeTime(task.decidedAt)}`} />
          <FindingStatusBadge status={row.status} />
          <p className="mt-3 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
            {task.notes || 'No notes were recorded with this decision.'}
          </p>
          <Link
            to={`/verification/${task.id}`}
            className="mt-3 inline-block text-[13px] text-accent-text underline-offset-2 hover:underline"
          >
            Open the task to reopen or add context
          </Link>
        </Card>
      )}
    </div>
  )
}

function Activity({ data }: { data: FindingDetailData }) {
  return (
    <Card>
      <CardHeader title="Activity" description="Audit trail for this finding." />
      {data.activity.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">Nothing recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {data.activity.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13px] text-fg">
                  <span className="font-mono text-xs">{entry.action}</span>{' '}
                  <span className="text-fg-muted">by {entry.actor}</span>
                </p>
                <p className="text-xs text-fg-subtle">
                  {formatDateTime(entry.timestamp)} · {entry.outcome}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

export function FindingDetailPage() {
  const { findingId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const actorId = user?.id ?? 'usr-001'
  const [tab, setTab] = useState('overview')

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.findings.detail(findingId),
    queryFn: () => findingService.detail(findingId),
    enabled: findingId !== '',
  })

  const usersQuery = useQuery({
    queryKey: queryKeys.reference.users(),
    queryFn: () => userService.list(),
    staleTime: 5 * 60_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.findings.root })
    void queryClient.invalidateQueries({ queryKey: queryKeys.verification.root })
  }

  const setStatus = useMutation({
    mutationFn: (status: ReviewStatus) => findingService.setStatus(findingId, status, actorId),
    onSuccess: () => {
      invalidate()
    },
  })

  const assign = useMutation({
    mutationFn: (assignee: string | null) => findingService.assign(findingId, assignee, actorId),
    onSuccess: () => {
      invalidate()
    },
  })

  const tabs = useMemo<TabItem[]>(() => {
    if (!data) return []
    return [
      { id: 'overview', label: 'Overview' },
      { id: 'evidence', label: 'Evidence' },
      { id: 'occurrences', label: 'Occurrences', count: data.occurrences.length },
      {
        id: 'verification',
        label: 'Verification',
        count: data.task ? 1 : 0,
      },
      { id: 'activity', label: 'Activity', count: data.activity.length },
    ]
  }, [data])

  if (isError) {
    return (
      <ErrorState
        title="Could not load this finding"
        message={error instanceof Error ? error.message : 'Unknown error.'}
        onRetry={() => void refetch()}
      />
    )
  }

  if (isPending || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const { row, target, project, scan, finding } = data

  return (
    <div className="space-y-5">
      <PageHeader
        title={row.title}
        description={finding.description}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={row.severity} />
            <FindingStatusBadge status={row.status} />
            <ConfidenceBadge confidence={row.confidence} />
            <span className="font-mono text-xs text-fg-subtle">
              {row.cweId} · {row.owaspId}
            </span>
            {target ? <EnvironmentBadge environment={target.environment} /> : null}
            <span className="text-xs text-fg-subtle">
              Detected {formatRelativeTime(row.firstDetected)} · last seen{' '}
              {formatRelativeTime(row.lastDetected)}
            </span>
          </div>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/findings')}>
            <ArrowLeft className="size-4" />
            All findings
          </Button>
        }
      />

      <FindingStatusFlow status={row.status} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Detail label="Target" icon={<Radar className="size-3.5" />}>
              {target ? (
                <Link to={`/targets/${target.id}`} className="text-accent-text underline-offset-2 hover:underline">
                  {target.name}
                </Link>
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Project" icon={<Layers className="size-3.5" />}>
              {project ? project.name : '—'}
            </Detail>
            <Detail label="Scan" icon={<ScanLine className="size-3.5" />}>
              {scan ? (
                <Link to={`/scans/${scan.id}`} className="text-accent-text underline-offset-2 hover:underline">
                  {scan.id}
                </Link>
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Profile" icon={<Fingerprint className="size-3.5" />}>
              {scan?.profileName ?? '—'}
            </Detail>
            <Detail label="Scan status">
              {scan ? <ScanStatusBadge status={scan.status} /> : '—'}
            </Detail>
            <Detail label="Owner">
              {row.assigneeName ?? 'Unassigned'}
            </Detail>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Triage" />
          <div className="space-y-3">
            <div>
              <label
                htmlFor="finding-status"
                className="block text-[11px] tracking-[0.12em] text-fg-subtle uppercase"
              >
                Status
              </label>
              <Select
                id="finding-status"
                className="mt-1"
                value={row.status}
                disabled={!data.canChangeStatus || setStatus.isPending}
                onChange={(event) => setStatus.mutate(event.target.value as ReviewStatus)}
                options={REVIEW_STATUSES.map((status) => ({
                  value: status,
                  label: FINDING_STATUS_META[status].label,
                }))}
              />
              {data.blockedBy ? (
                <p className="mt-1.5 text-[11px] text-warning">
                  Locked until task {data.blockedBy.id} is decided.
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-fg-subtle">
                  Confirmed, false positive and needs retest come from a verification decision.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="finding-assignee"
                className="block text-[11px] tracking-[0.12em] text-fg-subtle uppercase"
              >
                Assignee
              </label>
              <Select
                id="finding-assignee"
                className="mt-1"
                value={row.assignee ?? ''}
                disabled={assign.isPending}
                onChange={(event) =>
                  assign.mutate(event.target.value === '' ? null : event.target.value)
                }
                options={[
                  { value: '', label: 'Unassigned' },
                  ...(usersQuery.data ?? []).map((member) => ({
                    value: member.id,
                    label: member.name,
                  })),
                ]}
              />
            </div>

            {setStatus.isError ? (
              <p role="alert" className="text-xs text-danger">
                {setStatus.error instanceof Error ? setStatus.error.message : 'Could not change status.'}
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' ? <Overview data={data} /> : null}
      {tab === 'evidence' ? <EvidencePanel evidence={data.finding.evidence} /> : null}
      {tab === 'occurrences' ? <Occurrences data={data} /> : null}
      {tab === 'verification' ? <Verification data={data} actorId={actorId} /> : null}
      {tab === 'activity' ? <Activity data={data} /> : null}
    </div>
  )
}