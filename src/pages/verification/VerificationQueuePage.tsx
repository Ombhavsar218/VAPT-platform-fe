import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { AlarmClock, BadgeCheck, ClipboardList, Hourglass, UserRound, XCircle } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import { StatCard } from '@/components/common/StatCard'
import { FindingStatusBadge } from '@/components/common/StatusBadge'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { projectService } from '@/services/projects'
import { queryKeys } from '@/services/queryKeys'
import { targetService } from '@/services/targets'
import {
  EMPTY_VERIFICATION_AGGREGATES,
  verificationService,
  type VerificationAggregates,
  type VerificationRow,
} from '@/services/verification'
import { PAGE_SIZE_OPTIONS } from '@/services/transport'
import { VERIFICATION_DECISIONS } from '@/types'
import { cn } from '@/utils/cn'
import { formatDate, formatRelativeTime } from '@/utils/format'

/**
 * Verification queue.
 *
 * Ordered the way a reviewer works rather than the way a database would: the
 * default sort is priority then due date, so the highest-risk undecided
 * inference is always the first row. Overdue work is called out in the table
 * itself, because a queue that silently reorders is a queue nobody trusts.
 */

const PRIORITY_CLASSES: Record<VerificationRow['priority'], string> = {
  high: 'text-sev-critical',
  medium: 'text-sev-medium',
  low: 'text-fg-subtle',
}

const DECISION_LABELS: Record<(typeof VERIFICATION_DECISIONS)[number], string> = {
  confirmed: 'Confirmed',
  false_positive: 'False positive',
  needs_retest: 'Needs retest',
}

export function VerificationQueuePage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: 'priority' } })
  const navigate = useNavigate()

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.verification.list(query.normalized),
    queryFn: () => verificationService.queue(query.params),
    placeholderData: (previous) => previous,
  })

  const projectsQuery = useQuery({
    queryKey: queryKeys.reference.projects(),
    queryFn: () => projectService.options(),
    staleTime: 5 * 60_000,
  })

  const targetsQuery = useQuery({
    queryKey: queryKeys.reference.targets(),
    queryFn: () => targetService.options(),
    staleTime: 5 * 60_000,
  })

  const stats: VerificationAggregates = data?.aggregates ?? EMPTY_VERIFICATION_AGGREGATES

  const columns = useMemo<Column<VerificationRow>[]>(
    () => [
      {
        key: 'title',
        header: 'Task',
        primaryOnMobile: true,
        sortValue: (row) => row.title,
        cell: (row) => (
          <div className="min-w-0 max-w-md">
            <p className="truncate text-[13px] font-medium text-fg">{row.title}</p>
            <p className="truncate font-mono text-[11px] text-fg-subtle">
              {row.httpMethod} {row.endpoint}
            </p>
          </div>
        ),
      },
      {
        key: 'severity',
        header: 'Severity',
        sortValue: (row) => row.severity,
        cell: (row) => <SeverityBadge severity={row.severity} />,
      },
      {
        key: 'priority',
        header: 'Priority',
        sortValue: (row) => row.priority,
        cell: (row) => (
          <span className={cn('text-[13px] capitalize', PRIORITY_CLASSES[row.priority])}>
            {row.priority}
          </span>
        ),
      },
      {
        key: 'target',
        header: 'Target',
        hideBelowLg: true,
        sortValue: (row) => row.targetName,
        cell: (row) => (
          <span className="block max-w-40 truncate text-[13px] text-fg-muted">{row.targetName}</span>
        ),
      },
      {
        key: 'assignedToName',
        header: 'Assigned',
        hideBelowLg: true,
        sortValue: (row) => row.assignedToName ?? '',
        cell: (row) =>
          row.assignedToName ? (
            <span className="block max-w-28 truncate text-[13px] text-fg-muted">
              {row.assignedToName}
            </span>
          ) : (
            <span className="text-[13px] text-fg-subtle">Unassigned</span>
          ),
      },
      {
        key: 'dueDate',
        header: 'Due',
        sortValue: (row) => row.dueDate ?? '9999-12-31',
        cell: (row) => {
          if (row.decision !== null) {
            return (
              <span className="text-[13px] text-fg-subtle">
                {row.decidedAt ? formatRelativeTime(row.decidedAt) : '—'}
              </span>
            )
          }
          if (!row.dueDate) return <span className="text-[13px] text-fg-subtle">—</span>
          return (
            <span className={cn('text-[13px]', row.overdue ? 'text-danger' : 'text-fg-muted')}>
              {formatDate(row.dueDate)}
              {row.overdue ? (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] tracking-[0.12em] uppercase">
                  <AlarmClock className="size-3" aria-hidden="true" />
                  overdue
                </span>
              ) : null}
            </span>
          )
        },
      },
      {
        key: 'decision',
        header: 'Decision',
        sortValue: (row) => row.decision ?? '',
        cell: (row) =>
          row.decision === null ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-warning">
              <Hourglass className="size-3.5" aria-hidden="true" />
              Pending
            </span>
          ) : (
            <FindingStatusBadge status={DECISION_LABELS[row.decision] === 'Confirmed' ? 'confirmed' : row.decision === 'false_positive' ? 'false_positive' : 'needs_retest'} />
          ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Verification queue"
        description="Scanner inferences that need a human to confirm, dismiss or send for retest."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={<ClipboardList className="size-4" />}
          accentClassName={stats.pending > 0 ? 'bg-warning' : 'bg-success'}
          caption="Waiting on a decision."
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          icon={<AlarmClock className="size-4" />}
          accentClassName={stats.overdue > 0 ? 'bg-danger' : 'bg-success'}
          caption="Past their due date."
        />
        <StatCard
          label="Assigned to you"
          value={stats.mine}
          icon={<UserRound className="size-4" />}
          accentClassName={stats.mine > 0 ? 'bg-accent' : 'bg-fg-subtle'}
          caption={`${stats.unassigned} unassigned in this view.`}
        />
        <StatCard
          label="Settled"
          value={stats.confirmed + stats.falsePositive + stats.needsRetest}
          icon={<BadgeCheck className="size-4" />}
          accentClassName="bg-success"
          caption={`${stats.confirmed} confirmed, ${stats.falsePositive} dismissed, ${stats.needsRetest} for retest.`}
        />
      </div>

      <FilterBar
        search={{
          value: query.search,
          onChange: query.setSearch,
          placeholder: 'Search title, endpoint, CWE, target or project',
          label: 'Search tasks',
        }}
        activeCount={query.activeFilterCount}
        onClear={query.clearFilters}
      >
        <FilterSelect
          label="State"
          value={query.filters.decision ?? ''}
          onChange={(value) => query.setFilter('decision', value)}
          options={[
            { value: 'pending', label: 'Pending' },
            ...VERIFICATION_DECISIONS.map((decision) => ({
              value: decision,
              label: DECISION_LABELS[decision],
            })),
          ]}
          allLabel="All tasks"
        />
        <FilterSelect
          label="Project"
          value={query.filters.project ?? ''}
          onChange={(value) => query.setFilter('project', value)}
          options={(projectsQuery.data ?? []).map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          allLabel="All"
        />
        <FilterSelect
          label="Target"
          value={query.filters.target ?? ''}
          onChange={(value) => query.setFilter('target', value)}
          options={(targetsQuery.data ?? [])
            .filter((target) =>
              query.filters.project ? target.projectId === query.filters.project : true,
            )
            .map((target) => ({ value: target.id, label: target.name }))}
          allLabel="All"
        />
        <FilterSelect
          label="Priority"
          value={query.filters.priority ?? ''}
          onChange={(value) => query.setFilter('priority', value)}
          options={[
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
          allLabel="Any"
        />
        <FilterSelect
          label="Assignee"
          value={query.filters.assigned ?? ''}
          onChange={(value) => query.setFilter('assigned', value)}
          options={[
            { value: 'me', label: 'Assigned to me' },
            { value: 'unassigned', label: 'Unassigned' },
          ]}
          allLabel="Anyone"
        />
        <FilterSelect
          label="Only"
          value={query.filters.overdue ?? ''}
          onChange={(value) => query.setFilter('overdue', value)}
          options={[{ value: 'true', label: 'Overdue only' }]}
          allLabel="Everything"
        />
      </FilterBar>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load the queue"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/verification/${row.id}`)}
          loading={isPending}
          skeletonRows={8}
          caption="Manual verification tasks, highest priority first."
          defaultSort={sortToState(query.sort) ?? { key: 'priority', direction: 'asc' }}
          onSortChange={(next) => query.setSort(sortFromState(next))}
          emptyTitle={query.hasAnyFilter ? 'No tasks match these filters' : 'Queue is clear'}
          emptyDescription={
            query.hasAnyFilter
              ? 'Try clearing a filter or widening the search term.'
              : 'Every finding that needed a human has been settled.'
          }
          emptyAction={
            query.hasAnyFilter ? (
              <Button variant="secondary" onClick={query.reset}>
                Clear filters
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate('/findings')}>
                Back to findings
              </Button>
            )
          }
          footer={
            data ? (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.count}
                onPageChange={query.setPage}
                onPageSizeChange={query.setPageSize}
                pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              />
            ) : null
          }
        />
      )}

      {isFetching && !isPending ? (
        <p role="status" className="text-xs text-fg-subtle">
          Updating results…
        </p>
      ) : null}

      {data && data.count === 0 && !query.hasAnyFilter && !isPending ? (
        <Card>
          <p className="flex items-start gap-2 text-[13px] text-fg-muted">
            <XCircle className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              Nothing needs a decision right now. New tasks appear automatically when a scan finds
              something it cannot prove on its own — see{' '}
              <Link to="/findings" className="text-accent-text underline-offset-2 hover:underline">
                the findings register
              </Link>
              .
            </span>
          </p>
        </Card>
      ) : null}
    </div>
  )
}