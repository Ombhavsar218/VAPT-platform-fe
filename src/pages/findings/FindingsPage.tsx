import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  Bug,
  ClipboardCheck,
  Clock3,
  Hourglass,
  UserRound,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { ConfidenceBadge } from '@/components/common/ConfidenceBadge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
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
import { EMPTY_FINDING_AGGREGATES, findingService, type FindingAggregates, type FindingRow } from '@/services/findings'
import { PAGE_SIZE_OPTIONS } from '@/services/transport'
import { CONFIDENCES, FINDING_STATUSES, SEVERITIES } from '@/types'
import { FINDING_STATUS_META, SEVERITY_META } from '@/utils/severity'
import { formatNumber, formatRelativeTime } from '@/utils/format'

/**
 * Findings register.
 *
 * Two audiences share this page, so the severity tiles are filters rather than
 * decoration: an engineer triaging one critical bug and a lead asking "how much
 * of this is unverified noise?" should not need different screens.
 */

function confidenceLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function FindingsPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: '-lastDetected' } })
  const navigate = useNavigate()

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.findings.list(query.normalized),
    queryFn: () => findingService.register(query.params),
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

  const stats: FindingAggregates = data?.aggregates ?? EMPTY_FINDING_AGGREGATES
  const selectedSeverities = query.filters.severity ? query.filters.severity.split(',') : []

  const toggleSeverity = (severity: string) => {
    const next = selectedSeverities.includes(severity)
      ? selectedSeverities.filter((entry) => entry !== severity)
      : [...selectedSeverities, severity]
    query.setFilter('severity', next.join(','))
  }

  const columns = useMemo<Column<FindingRow>[]>(
    () => [
      {
        key: 'title',
        header: 'Finding',
        primaryOnMobile: true,
        sortValue: (row) => row.title,
        cell: (row) => (
          <div className="min-w-0 max-w-md">
            <p className="truncate text-[13px] font-medium text-fg">{row.title}</p>
            <p className="truncate font-mono text-[11px] text-fg-subtle">
              {row.httpMethod} {row.endpoint}
              {row.parameter ? ` · ${row.parameter}` : ''}
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
        key: 'status',
        header: 'Status',
        sortValue: (row) => row.status,
        cell: (row) => (
          <div className="min-w-0">
            <FindingStatusBadge status={row.status} />
            {row.requiresManualVerification && row.status === 'potential' ? (
              <span className="mt-1 block text-[11px] text-fg-subtle">Awaiting verification</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'confidence',
        header: 'Confidence',
        hideBelowLg: true,
        cell: (row) => <ConfidenceBadge confidence={row.confidence} />,
      },
      {
        key: 'target',
        header: 'Target',
        sortValue: (row) => row.targetName,
        cell: (row) => (
          <div className="min-w-0 max-w-48">
            <p className="truncate text-[13px] text-fg-muted">{row.targetName}</p>
            <p className="truncate text-[11px] text-fg-subtle">
              {row.cweId} · {row.owaspId}
            </p>
          </div>
        ),
      },
      {
        key: 'occurrenceCount',
        header: 'Occurrences',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.occurrenceCount,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">{row.occurrenceCount}</span>
        ),
      },
      {
        key: 'assignee',
        header: 'Owner',
        hideBelowLg: true,
        sortValue: (row) => row.assigneeName ?? '',
        cell: (row) =>
          row.assigneeName ? (
            <span className="block max-w-32 truncate text-[13px] text-fg-muted">
              {row.assigneeName}
            </span>
          ) : (
            <span className="text-[13px] text-fg-subtle">Unassigned</span>
          ),
      },
      {
        key: 'lastDetected',
        header: 'Last seen',
        sortValue: (row) => row.lastDetected,
        cell: (row) => (
          <span className="text-[13px] whitespace-nowrap text-fg-muted">
            {formatRelativeTime(row.lastDetected)}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Findings"
        description="Everything the scanner has flagged, and how far each one has been through triage."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SEVERITIES.map((severity) => {
          const meta = SEVERITY_META[severity]
          const count = stats.bySeverity[severity]
          const selected = selectedSeverities.includes(severity)
          return (
            <button
              key={severity}
              type="button"
              onClick={() => toggleSeverity(severity)}
              aria-pressed={selected}
              className={
                'rounded-xl border p-3 text-left transition-colors ' +
                (selected
                  ? `${meta.border} ${meta.surface}`
                  : 'border-border-base bg-surface hover:border-border-strong')
              }
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-semibold tracking-[0.14em] uppercase ${meta.text}`}>
                  {meta.label}
                </span>
                <span className="text-lg font-semibold tabular-nums text-fg">
                  {formatNumber(count)}
                </span>
              </span>
              <span className="mt-1 block text-[11px] text-fg-subtle">
                {count === 0 ? 'None' : `${Math.round((count / Math.max(1, stats.total)) * 100)}% of view`}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open"
          value={formatNumber(stats.open)}
          icon={<Bug className="size-4" />}
          accentClassName="bg-info"
          caption="Still unresolved and counting towards risk."
        />
        <StatCard
          label="Awaiting verification"
          value={formatNumber(stats.awaitingVerification)}
          icon={<Hourglass className="size-4" />}
          accentClassName={stats.awaitingVerification > 0 ? 'bg-warning' : 'bg-success'}
          caption="Scanner inferences a human has not settled."
        />
        <StatCard
          label="Confirmed"
          value={formatNumber(stats.confirmed)}
          icon={<BadgeCheck className="size-4" />}
          accentClassName="bg-success"
          caption="Verified as real by an analyst."
        />
        <StatCard
          label="Dismissed"
          value={formatNumber(stats.falsePositive)}
          icon={<XCircle className="size-4" />}
          accentClassName="bg-fg-subtle"
          caption="Proved to be scanner noise."
        />
        <StatCard
          label="Needs retest"
          value={formatNumber(stats.needsRetest)}
          icon={<ClipboardCheck className="size-4" />}
          accentClassName={stats.needsRetest > 0 ? 'bg-sev-medium' : 'bg-fg-subtle'}
          caption="Sent back for a targeted scan."
        />
        <StatCard
          label="Unassigned"
          value={formatNumber(stats.unassigned)}
          icon={<UserRound className="size-4" />}
          accentClassName={stats.unassigned > 0 ? 'bg-warning' : 'bg-success'}
          caption={`${formatNumber(stats.assignedToMe)} assigned to you.`}
        />
        <StatCard
          label="Average age"
          value={stats.averageAgeDays > 0 ? `${stats.averageAgeDays}d` : '—'}
          icon={<Clock3 className="size-4" />}
          accentClassName="bg-fg-subtle"
          caption="Days since first detection, across this view."
        />
      </div>

      <FilterBar
        search={{
          value: query.search,
          onChange: query.setSearch,
          placeholder: 'Search title, endpoint, CWE, target or project',
          label: 'Search findings',
        }}
        activeCount={query.activeFilterCount}
        onClear={query.clearFilters}
      >
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
          label="Severity"
          value={query.filters.severity ?? ''}
          onChange={(value) => query.setFilter('severity', value)}
          options={SEVERITIES.map((severity) => ({
            value: severity,
            label: SEVERITY_META[severity].label,
          }))}
        />
        <FilterSelect
          label="Status"
          value={query.filters.status ?? ''}
          onChange={(value) => query.setFilter('status', value)}
          options={FINDING_STATUSES.map((status) => ({
            value: status,
            label: FINDING_STATUS_META[status].label,
          }))}
        />
        <FilterSelect
          label="Confidence"
          value={query.filters.confidence ?? ''}
          onChange={(value) => query.setFilter('confidence', value)}
          options={CONFIDENCES.map((confidence) => ({
            value: confidence,
            label: confidenceLabel(confidence),
          }))}
          allLabel="Any"
        />
        <FilterSelect
          label="Owner"
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
          value={query.filters.open ?? ''}
          onChange={(value) => query.setFilter('open', value)}
          options={[{ value: 'true', label: 'Open findings' }]}
          allLabel="Everything"
        />
      </FilterBar>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load findings"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/findings/${row.id}`)}
          loading={isPending}
          skeletonRows={8}
          caption="Findings across all projects, newest detection first."
          defaultSort={sortToState(query.sort) ?? { key: 'lastDetected', direction: 'desc' }}
          onSortChange={(next) => query.setSort(sortFromState(next))}
          emptyTitle={query.hasAnyFilter ? 'No findings match these filters' : 'No findings yet'}
          emptyDescription={
            query.hasAnyFilter
              ? 'Try clearing a filter or widening the search term.'
              : 'Run a scan and its findings will appear here.'
          }
          emptyAction={
            query.hasAnyFilter ? (
              <Button variant="secondary" onClick={query.reset}>
                Clear filters
              </Button>
            ) : (
              <Button variant="primary" onClick={() => navigate('/scans/new')}>
                Start a scan
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
        <EmptyState
          title="Nothing flagged yet"
          description="Findings appear here as soon as a scan finishes analysis."
        />
      ) : null}
    </div>
  )
}