import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'

import { Card, CardHeader } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/common/PageHeader'
import { Spinner } from '@/components/common/Spinner'
import { StatCard } from '@/components/common/StatCard'
import { ModuleStatusBadge, OutcomeBadge } from '@/components/common/StatusBadge'
import { pollWhile } from '@/hooks/livePolling'
import { adminService, type AdminOverview, type AuditRow } from '@/services/admin'
import { queryKeys } from '@/services/queryKeys'
import { auditActionLabel } from '@/services/admin'
import { formatNumber, formatRelativeTime } from '@/utils/format'
import { listFilterHref } from '@/utils/listQuery'

/**
 * Workspace health (`/admin`).
 *
 * Leads with what is wrong rather than what is running. A dashboard that opens
 * with five green tiles buries the one number an operator needs, so the attention
 * list sits above the counters and the counters themselves link to the screen
 * that explains them.
 */
export function AdminOverviewPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.overview(),
    queryFn: () => adminService.overview(),
    // Queue depth and in-flight runs are the only figures that move on their
    // own, so poll only while something is actually live and stay quiet when
    // the workspace is idle.
    refetchInterval: (query) =>
      pollWhile(
        ((query.state.data as AdminOverview | undefined)?.scans.running ?? 0) +
          ((query.state.data as AdminOverview | undefined)?.jobs.queued ?? 0) >
          0 || undefined,
      ),
  })

  if (isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-[13px] text-fg-muted">
        <Spinner />
        Loading workspace health…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="Could not load workspace health"
          message={error instanceof Error ? error.message : 'Unknown error.'}
          onRetry={() => void refetch()}
        />
      </Card>
    )
  }

  const activityColumns: Column<AuditRow>[] = [
    {
      key: 'action',
      header: 'Action',
      primaryOnMobile: true,
      cell: (row) => (
        <span className="text-[13px] text-fg">{auditActionLabel(row.action)}</span>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      hideBelowLg: true,
      cell: (row) => (
        <span className="font-mono text-[12px] text-fg-muted">
          {row.entity} {row.entityId}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      hideBelowLg: true,
      cell: (row) => <span className="text-[13px] text-fg-muted">{row.actorName}</span>,
    },
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (row) => <OutcomeBadge outcome={row.outcome} />,
    },
    {
      key: 'timestamp',
      header: 'When',
      align: 'right',
      cell: (row) => (
        <span className="text-[13px] whitespace-nowrap text-fg-muted">
          {formatRelativeTime(row.timestamp)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Administration"
        description="Workspace health, access and the record of what has already happened."
      />

      {data.attention.length > 0 ? (
        <Card flush>
          <div className="border-b border-border-base px-5 py-4">
            <CardHeader
              title={`Needs attention (${data.attention.length})`}
              description="Ordered by what is most likely to affect an assessment."
            />
          </div>
          <ul className="divide-y divide-border-base">
            {data.attention.map((item) => {
              const Icon =
                item.severity === 'critical'
                  ? ShieldAlert
                  : item.severity === 'warning'
                    ? AlertTriangle
                    : Info
              const tone =
                item.severity === 'critical'
                  ? 'text-danger'
                  : item.severity === 'warning'
                    ? 'text-warning'
                    : 'text-fg-subtle'
              return (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-fg">{item.label}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
                      {item.detail}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      <section aria-labelledby="admin-members">
        <h2 id="admin-members" className="sr-only">
          Members
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Active members"
            value={formatNumber(data.users.active)}
            caption={`${data.users.total} in total`}
            to="/admin/users"
          />
          <StatCard
            label="Without MFA"
            value={formatNumber(data.users.mfaGaps)}
            caption="Active accounts, not enrolled"
            to={listFilterHref('/admin/users', { mfa: 'disabled' })}
          />
          <StatCard
            label="Failed jobs"
            value={formatNumber(data.jobs.failed)}
            caption="On the queue"
            to={listFilterHref('/admin/jobs', { status: 'failed' })}
          />
          <StatCard
            label="Modules drifted"
            value={formatNumber(data.modules.drifted)}
            caption="Not converged across the fleet"
            to="/admin/modules"
          />
        </div>
      </section>

      <section aria-labelledby="admin-queue">
        <h2 id="admin-queue" className="sr-only">
          Queue
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Scans running"
            value={formatNumber(data.scans.running)}
            caption={`${data.scans.queued} queued`}
            to={listFilterHref('/scans', { status: 'running' })}
          />
          <StatCard
            label="Jobs queued"
            value={formatNumber(data.jobs.queued)}
            caption={`${data.jobs.running} on a worker`}
            to={listFilterHref('/admin/jobs', { status: 'queued' })}
          />
          <StatCard
            label="Jobs succeeded"
            value={formatNumber(data.jobs.succeeded)}
            caption={`${data.jobs.cancelled} cancelled`}
            to={listFilterHref('/admin/jobs', { status: 'succeeded' })}
          />
          <StatCard
            label="Modules enabled"
            value={formatNumber(data.modules.byStatus.enabled)}
            caption={`${data.modules.byStatus.experimental} experimental`}
            to={listFilterHref('/modules', { status: 'enabled' })}
          />
        </div>
      </section>

      <Card flush>
        <div className="border-b border-border-base px-5 py-4">
          <CardHeader
            title="Recent activity"
            description="The last few entries from the audit trail."
            actions={
              <Link
                to="/admin/audit-logs"
                className="text-[13px] font-medium text-accent hover:underline"
              >
                View all
              </Link>
            }
          />
        </div>
        <DataTable
          columns={activityColumns}
          rows={data.activity}
          rowKey={(row) => row.id}
          emptyTitle="No activity recorded"
        />
      </Card>

      <Card flush>
        <div className="border-b border-border-base px-5 py-4">
          <CardHeader title="Module status" description="Editorial state of the detection catalogue." />
        </div>
        <ul className="divide-y divide-border-base">
          {(Object.keys(data.modules.byStatus) as (keyof typeof data.modules.byStatus)[]).map(
            (status) => (
              <li key={status} className="flex items-center justify-between gap-4 px-5 py-3">
                <ModuleStatusBadge status={status} />
                <span className="text-[13px] tabular-nums text-fg-muted">
                  {formatNumber(data.modules.byStatus[status])}
                </span>
              </li>
            ),
          )}
        </ul>
      </Card>
    </div>
  )
}
