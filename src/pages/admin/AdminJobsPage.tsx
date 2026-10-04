import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Ban, RotateCcw, ServerCog } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Spinner } from '@/components/common/Spinner'
import { StatCard } from '@/components/common/StatCard'
import { JobStatusBadge } from '@/components/common/StatusBadge'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { adminService, EMPTY_JOB_AGGREGATES, type JobRow } from '@/services/admin'
import { queryKeys } from '@/services/queryKeys'
import { normalizeListParams } from '@/services/transport'
import { JOB_STATUSES, SCAN_QUEUES, WORKER_HOSTS, type WorkerHost } from '@/types'
import { JOB_STATUS_LABELS, QUEUE_LABELS } from '@/utils/severity'
import { formatDuration, formatNumber, formatRelativeTime } from '@/utils/format'
import { listFilterHref } from '@/utils/listQuery'

/** Where a retry lands when the operator has not picked a host. */
const DEFAULT_RETRY_WORKER: WorkerHost = 'scanner-01'

/**
 * Job queue (`/admin/jobs`).
 *
 * Queue depth is the headline because it is the number that explains a missed
 * deadline. The actions are deliberately narrow: a finished job cannot be
 * cancelled or reassigned, because its outcome is on the record and letting an
 * operator "cancel" a failure that already happened would hide it.
 */
export function AdminJobsPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: '-startedAt' } })
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const normalized = normalizeListParams(query.params)
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.jobList(normalized),
    queryFn: () => adminService.listJobs(query.params),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.root })
    void queryClient.invalidateQueries({ queryKey: queryKeys.scans.root })
  }

  const cancel = useMutation({
    mutationFn: (jobId: string) => adminService.cancelJob(jobId, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      invalidate()
      toast.success('Job cancelled', `${row.id} was cancelled.`)
    },
    onError: (caught) =>
      toast.error('Could not cancel', caught instanceof Error ? caught.message : 'Unknown error.'),
  })

  const retry = useMutation({
    mutationFn: (jobId: string) =>
      adminService.retryJob(jobId, DEFAULT_RETRY_WORKER, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      invalidate()
      toast.success('Job requeued', `${row.id} is queued on ${row.worker}.`)
    },
    onError: (caught) =>
      toast.error('Could not retry', caught instanceof Error ? caught.message : 'Unknown error.'),
  })

  const assign = useMutation({
    mutationFn: (input: { jobId: string; worker: WorkerHost }) =>
      adminService.assignJob(input.jobId, input.worker, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      invalidate()
      toast.success('Job reassigned', `${row.id} now runs on ${row.worker}.`)
    },
    onError: (caught) =>
      toast.error('Could not reassign', caught instanceof Error ? caught.message : 'Unknown error.'),
  })

  const aggregates = data?.aggregates ?? EMPTY_JOB_AGGREGATES
  const busy = cancel.isPending || retry.isPending || assign.isPending

  const columns = useMemo<Column<JobRow>[]>(
    () => [
      {
        key: 'id',
        header: 'Job',
        primaryOnMobile: true,
        sortValue: (row) => row.id,
        cell: (row) => (
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-medium text-fg">{row.id}</p>
            <p className="truncate text-[12px] text-fg-muted">{row.kind}</p>
          </div>
        ),
      },
      {
        key: 'queue',
        header: 'Queue',
        sortValue: (row) => row.queue,
        cell: (row) => <span className="text-[13px] text-fg-muted">{QUEUE_LABELS[row.queue]}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (row) => row.status,
        cell: (row) => <JobStatusBadge status={row.status} />,
      },
      {
        key: 'scan',
        header: 'Scan',
        hideBelowLg: true,
        cell: (row) =>
          row.scanId === null ? (
            <span className="text-[13px] text-fg-subtle">—</span>
          ) : (
            <span className="min-w-0">
              <Link
                to={`/scans/${row.scanId}`}
                className="font-mono text-[12px] text-accent hover:underline"
              >
                {row.scanId}
              </Link>
              {row.targetName ? (
                <span className="block truncate text-[12px] text-fg-muted">{row.targetName}</span>
              ) : null}
            </span>
          ),
      },
      {
        key: 'worker',
        header: 'Worker',
        sortValue: (row) => row.worker,
        cell: (row) => (
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-fg-muted">
            <ServerCog className="size-3.5 shrink-0" aria-hidden="true" />
            {row.worker}
          </span>
        ),
      },
      {
        key: 'duration',
        header: 'Duration',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.durationSeconds,
        cell: (row) => (
          <span className="text-[13px] tabular-nums whitespace-nowrap text-fg-muted">
            {row.durationSeconds === 0 && row.status === 'queued'
              ? 'waiting'
              : formatDuration(row.durationSeconds)}
          </span>
        ),
      },
      {
        key: 'startedAt',
        header: 'Started',
        align: 'right',
        sortValue: (row) => row.startedAt ?? '',
        cell: (row) => (
          <span className="text-[13px] whitespace-nowrap text-fg-muted">
            {row.startedAt ? formatRelativeTime(row.startedAt) : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        cell: (row) => {
          const live = row.status === 'queued' || row.status === 'running'
          return (
            <div className="flex items-center justify-end gap-1">
              {row.status === 'failed' || row.status === 'cancelled' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<RotateCcw className="size-3.5" />}
                  disabled={busy}
                  onClick={() => retry.mutate(row.id)}
                >
                  Retry
                </Button>
              ) : null}
              {live ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<Ban className="size-3.5" />}
                  disabled={busy}
                  onClick={() => cancel.mutate(row.id)}
                >
                  Cancel
                </Button>
              ) : null}
              {row.status === 'queued' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const next = WORKER_HOSTS.find((host) => host !== row.worker)
                    if (next) assign.mutate({ jobId: row.id, worker: next })
                  }}
                  title="Move to the next available worker"
                >
                  Reassign
                </Button>
              ) : null}
            </div>
          )
        },
      },
    ],
    [assign, busy, cancel, retry],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Jobs"
        description="Queue depth, worker assignment and the failures worth retrying."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Queued"
          value={formatNumber(aggregates.byStatus.queued)}
          caption={`${formatNumber(aggregates.byStatus.running)} running`}
          to={listFilterHref('/admin/jobs', { status: 'queued' })}
        />
        <StatCard
          label="Failed"
          value={formatNumber(aggregates.byStatus.failed)}
          caption={`${formatNumber(aggregates.failedLast24h)} in the last 24h`}
          accentClassName={aggregates.byStatus.failed > 0 ? 'bg-danger' : undefined}
          to={listFilterHref('/admin/jobs', { status: 'failed' })}
        />
        <StatCard
          label="Succeeded"
          value={formatNumber(aggregates.byStatus.succeeded)}
          caption={`${formatNumber(aggregates.byStatus.cancelled)} cancelled`}
          to={listFilterHref('/admin/jobs', { status: 'succeeded' })}
        />
        <StatCard
          label="Mean duration"
          value={
            aggregates.averageDurationSeconds === null
              ? '—'
              : formatDuration(aggregates.averageDurationSeconds)
          }
          caption="Across succeeded jobs"
        />
      </div>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load jobs"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <Card flush>
          <FilterBar
            search={{
              value: query.search,
              onChange: query.setSearch,
              placeholder: 'Search by id, kind or target',
              label: 'Search jobs',
            }}
            activeCount={query.activeFilterCount}
            onClear={query.clearFilters}
          >
            <FilterSelect
              label="Status"
              value={query.filters.status ?? ''}
              onChange={(value) => query.setFilter('status', value)}
              options={JOB_STATUSES.map((status) => ({
                value: status,
                label: JOB_STATUS_LABELS[status],
              }))}
            />
            <FilterSelect
              label="Queue"
              value={query.filters.queue ?? ''}
              onChange={(value) => query.setFilter('queue', value)}
              options={SCAN_QUEUES.map((queue) => ({ value: queue, label: QUEUE_LABELS[queue] }))}
            />
            <FilterSelect
              label="Worker"
              value={query.filters.worker ?? ''}
              onChange={(value) => query.setFilter('worker', value)}
              options={WORKER_HOSTS.map((host) => ({ value: host, label: host }))}
            />
          </FilterBar>

          {isPending ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-[13px] text-fg-muted">
              <Spinner />
              Loading jobs…
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={data?.results ?? []}
              rowKey={(row) => row.id}
              defaultSort={sortToState(query.sort) ?? undefined}
              onSortChange={(next) => query.setSort(sortFromState(next))}
              emptyTitle={query.hasAnyFilter ? 'No jobs match these filters' : 'No jobs'}
              emptyDescription={
                query.hasAnyFilter
                  ? 'Try clearing the status, queue or worker filter.'
                  : 'Nothing has been queued in this workspace.'
              }
              emptyAction={
                query.hasAnyFilter ? (
                  <Button variant="secondary" onClick={query.clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}

          <div className="border-t border-border-base px-5 py-3">
            <Pagination
              page={normalized.page}
              pageSize={normalized.pageSize}
              total={data?.count ?? 0}
              onPageChange={query.setPage}
              onPageSizeChange={query.setPageSize}
            />
          </div>
        </Card>
      )}

      <p className="text-[12px] leading-relaxed text-fg-subtle">
        A job that has already finished cannot be cancelled or reassigned: the outcome is on the
        record, and a retry requeues the work rather than erasing the failure. Every action here is
        written to{' '}
        <Link to={listFilterHref('/admin/audit-logs', { entity: 'job' })} className="text-accent hover:underline">
          the audit log
        </Link>
        .
      </p>
    </div>
  )
}
