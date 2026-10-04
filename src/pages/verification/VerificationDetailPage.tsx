import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlarmClock,
  ArrowLeft,
  BadgeCheck,
  Check,
  ListChecks,
  Radar,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card, CardHeader } from '@/components/common/Card'
import { ConfidenceBadge } from '@/components/common/ConfidenceBadge'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/common/PageHeader'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import { Skeleton } from '@/components/common/Skeleton'
import { FindingStatusBadge } from '@/components/common/StatusBadge'
import { EvidencePanel } from '@/components/findings/EvidencePanel'
import { VerificationDecisionForm } from '@/components/findings/VerificationDecisionForm'
import { useAuth } from '@/hooks/useAuth'
import { queryKeys } from '@/services/queryKeys'
import { verificationService } from '@/services/verification'
import type { VerificationDecision } from '@/types'
import { cn } from '@/utils/cn'
import { formatDate, formatDateTime, formatRelativeTime } from '@/utils/format'

/**
 * A single verification task.
 *
 * The page is ordered to match the order a reviewer actually works in: what the
 * scanner thought, what it suggests trying, the raw evidence, then the decision.
 * Putting the form last means nobody records a verdict before reading the
 * response that justifies it.
 */

export function VerificationDetailPage() {
  const { taskId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const actorId = user?.id ?? 'usr-001'
  const [error, setError] = useState<string | null>(null)

  const { data, isPending, isError, error: loadError, refetch } = useQuery({
    queryKey: queryKeys.verification.detail(taskId),
    queryFn: () => verificationService.detail(taskId),
    enabled: taskId !== '',
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.verification.root })
    void queryClient.invalidateQueries({ queryKey: queryKeys.findings.root })
  }

  const decide = useMutation({
    mutationFn: (input: { decision: VerificationDecision; notes: string }) =>
      verificationService.decide(taskId, { ...input, actor: actorId }),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'Unknown error.'),
  })

  const reopen = useMutation({
    mutationFn: () => verificationService.reopen(taskId, actorId),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'Unknown error.'),
  })

  if (isError) {
    return (
      <ErrorState
        title="Could not load this task"
        message={loadError instanceof Error ? loadError.message : 'Unknown error.'}
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

  const { task, row, finding } = data

  return (
    <div className="space-y-5">
      <PageHeader
        title={finding.title}
        description={row.endpoint}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={row.severity} />
            <FindingStatusBadge status={row.status} />
            <ConfidenceBadge confidence={row.confidence} />
            <span className="font-mono text-xs text-fg-subtle">
              {task.id} · {row.cweId} · {row.owaspId}
            </span>
            {row.overdue ? (
              <span className="inline-flex items-center gap-1 text-xs text-danger">
                <AlarmClock className="size-3.5" aria-hidden="true" />
                Overdue since {formatDate(row.dueDate)}
              </span>
            ) : task.dueDate ? (
              <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                <AlarmClock className="size-3.5" aria-hidden="true" />
                Due {formatDate(task.dueDate)}
              </span>
            ) : null}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {data.canReopen ? (
              <Button
                variant="secondary"
                size="sm"
                loading={reopen.isPending}
                leadingIcon={<RotateCcw className="size-4" />}
                onClick={() => reopen.mutate()}
              >
                Reopen
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => navigate('/verification')}>
              <ArrowLeft className="size-4" />
              Queue
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-[11px] tracking-[0.12em] text-fg-subtle uppercase">Priority</p>
          <p
            className={cn(
              'mt-1 text-[13px] capitalize',
              task.priority === 'high'
                ? 'text-sev-critical'
                : task.priority === 'medium'
                  ? 'text-sev-medium'
                  : 'text-fg-muted',
            )}
          >
            {task.priority}
          </p>
        </Card>
        <Card>
          <p className="text-[11px] tracking-[0.12em] text-fg-subtle uppercase">Assigned</p>
          <p className="mt-1 truncate text-[13px] text-fg">
            {row.assignedToName ?? 'Unassigned'}
          </p>
        </Card>
        <Card>
          <p className="text-[11px] tracking-[0.12em] text-fg-subtle uppercase">Raised</p>
          <p className="mt-1 text-[13px] text-fg">{formatRelativeTime(task.createdAt)}</p>
        </Card>
        <Card>
          <p className="text-[11px] tracking-[0.12em] text-fg-subtle uppercase">Decision</p>
          <p className="mt-1 text-[13px] text-fg">
            {task.decision ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-success" aria-hidden="true" />
                {task.decision.replace('_', ' ')}
              </span>
            ) : (
              <span className="text-warning">Pending</span>
            )}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="What the scanner inferred"
          description="The finding this task was raised from, with the reasoning attached."
        />
        <p className="text-[13px] leading-relaxed text-fg-muted">{task.scannerRationale}</p>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{task.observedBehaviour}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
          <Link
            to={`/findings/${finding.id}`}
            className="inline-flex items-center gap-1.5 text-accent underline-offset-2 hover:underline"
          >
            <ShieldAlert className="size-3.5" aria-hidden="true" />
            Open finding {finding.id}
          </Link>
          <span className="inline-flex items-center gap-1.5">
            <Radar className="size-3.5" aria-hidden="true" />
            {row.targetName} · {row.projectName}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Suggested steps"
          description="Proposed by the scanner module that raised this. Treat it as a starting point."
        />
        <ol className="space-y-2">
          {task.suggestedSteps.map((step, index) => (
            <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-fg-muted">
              <ListChecks className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <span>
                <span className="mr-1.5 font-mono text-xs text-fg-subtle">{index + 1}.</span>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title="Evidence" description="The exact exchange the scanner based this on." />
        <EvidencePanel evidence={data.evidence} />
      </Card>

      {data.canDecide ? (
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
          <CardHeader
            title="Recorded decision"
            description={`Settled ${task.decidedAt ? formatRelativeTime(task.decidedAt) : 'earlier'} by ${task.assignedTo ? row.assignedToName ?? 'an analyst' : 'an analyst'}.`}
          />
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-success" aria-hidden="true" />
            <FindingStatusBadge status={row.status} />
            <span className="text-xs text-fg-subtle">
              {task.decision === 'confirmed'
                ? 'The finding now counts towards the risk score.'
                : task.decision === 'false_positive'
                  ? 'The finding is excluded from risk but kept for the record.'
                  : 'The finding is queued for a targeted re-scan.'}
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
            {task.notes || 'No notes were recorded with this decision.'}
          </p>
          <p className="mt-3 text-xs text-fg-subtle">
            Changed your mind?{' '}
            <button
              type="button"
              className="text-accent underline-offset-2 hover:underline"
              onClick={() => reopen.mutate()}
              disabled={reopen.isPending}
            >
              Reopen this task
            </button>{' '}
            to send it back to the queue.
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </Card>
      )}

      {data.activity.length > 0 ? (
        <Card>
          <CardHeader title="History" description="Every decision recorded against this task and its finding." />
          <ol className="space-y-2">
            {data.activity.map((entry) => (
              <li key={entry.id} className="text-xs text-fg-subtle">
                <span className="font-mono text-fg-muted">{entry.action}</span> by {entry.actor} ·{' '}
                {formatDateTime(entry.timestamp)}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  )
}