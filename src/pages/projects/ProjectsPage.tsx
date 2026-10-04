import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { RiskScoreInline } from '@/components/common/RiskScore'
import { AssessmentTypeLabel, ProjectStatusBadge } from '@/components/common/StatusBadge'
import { StatCard } from '@/components/common/StatCard'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { CreateProjectModal } from './CreateProjectModal'
import { projectService, userService, type ProjectAggregates, type ProjectListRow } from '@/services/projects'
import { queryKeys } from '@/services/queryKeys'
import { PAGE_SIZE_OPTIONS } from '@/services/transport'
import { ASSESSMENT_TYPES, PROJECT_STATUSES } from '@/types'
import { ASSESSMENT_TYPE_LABELS, PROJECT_STATUS_META } from '@/utils/severity'
import { formatDate, formatNumber, formatRelativeTime } from '@/utils/format'

const EMPTY_AGGREGATES: ProjectAggregates = {
  total: 0,
  active: 0,
  openFindings: 0,
  criticalHigh: 0,
  runningScans: 0,
}

/**
 * Project register.
 *
 * List state lives in the URL, so a filtered view can be shared with a colleague
 * or pasted into a ticket. The tiles above the table describe the whole filtered
 * set rather than the twelve rows on screen, so they still add up when the
 * register is paginated.
 */
export function ProjectsPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: '-riskScore' } })
  const [createOpen, setCreateOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.projects.list(query.normalized),
    queryFn: () => projectService.register(query.params),
    placeholderData: (previous) => previous,
  })

  const usersQuery = useQuery({
    queryKey: queryKeys.reference.users(),
    queryFn: () => userService.list(),
    staleTime: 5 * 60_000,
  })

  const ownerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of usersQuery.data ?? []) map.set(user.id, user.name)
    return map
  }, [usersQuery.data])

  // Built from the workspace-wide owner ids, not the rows on this page, so the
  // dropdown can always name the engagement you are looking for.
  const ownerOptions = useMemo(
    () =>
      (data?.ownerIds ?? []).map((id) => ({
        value: id,
        label: ownerNames.get(id) ?? id,
      })),
    [data?.ownerIds, ownerNames],
  )

  const stats = data?.aggregates ?? EMPTY_AGGREGATES

  const columns = useMemo<Column<ProjectListRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Project',
        primaryOnMobile: true,
        sortValue: (row) => row.project.name,
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{row.project.name}</p>
            <p className="truncate text-xs text-fg-subtle">
              {row.project.client} · {ownerNames.get(row.project.owner) ?? row.project.owner}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (row) => row.project.status,
        cell: (row) => <ProjectStatusBadge status={row.project.status} size="xs" />,
      },
      {
        key: 'assessmentType',
        header: 'Assessment',
        hideBelowLg: true,
        sortValue: (row) => ASSESSMENT_TYPE_LABELS[row.project.assessmentType],
        cell: (row) => <AssessmentTypeLabel type={row.project.assessmentType} />,
      },
      {
        key: 'riskScore',
        header: 'Risk',
        sortValue: (row) => row.riskScore,
        cell: (row) => <RiskScoreInline value={row.riskScore} />,
      },
      {
        key: 'targetCount',
        header: 'Targets',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.targetCount,
        cell: (row) => <span className="tabular-nums text-fg-muted">{row.targetCount}</span>,
      },
      {
        key: 'openFindingCount',
        header: 'Open findings',
        sortValue: (row) => row.openFindingCount,
        cell: (row) =>
          row.openFindingCount === 0 ? (
            <span className="text-[13px] text-fg-subtle">None</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium tabular-nums text-fg">
                {row.openFindingCount}
              </span>
              {row.criticalCount > 0 ? (
                <span
                  title={`${row.criticalCount} critical`}
                  className="rounded border border-sev-critical/35 bg-sev-critical/12 px-1 text-[10px] font-semibold text-sev-critical"
                >
                  {row.criticalCount} C
                </span>
              ) : null}
              {row.highCount > 0 ? (
                <span
                  title={`${row.highCount} high`}
                  className="rounded border border-sev-high/35 bg-sev-high/12 px-1 text-[10px] font-semibold text-sev-high"
                >
                  {row.highCount} H
                </span>
              ) : null}
            </span>
          ),
      },
      {
        key: 'lastScanAt',
        header: 'Last scan',
        hideBelowLg: true,
        sortValue: (row) => row.lastScanAt ?? '',
        cell: (row) => (
          <span className="text-[13px] text-fg-muted">
            {row.lastScanAt ? formatRelativeTime(row.lastScanAt) : 'Never'}
          </span>
        ),
      },
      {
        key: 'endDate',
        header: 'Window',
        hideBelowLg: true,
        sortValue: (row) => row.project.endDate,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatDate(row.project.startDate)} → {formatDate(row.project.endDate)}
          </span>
        ),
      },
    ],
    [ownerNames],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Client engagements and internal assessments, with scope and open-finding totals."
        actions={
          <Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            New project
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active engagements"
          value={formatNumber(stats.active)}
          caption={
            query.hasAnyFilter ? 'Within the current filter.' : 'Planning, active or paused.'
          }
        />
        <StatCard
          label="Open findings"
          value={formatNumber(stats.openFindings)}
          caption={query.hasAnyFilter ? 'Within the current filter.' : 'Across every engagement.'}
        />
        <StatCard
          label="Critical & high"
          value={formatNumber(stats.criticalHigh)}
          accentClassName="bg-sev-high"
          caption="Severity that usually drives the engagement plan."
        />
        <StatCard
          label="Scans running"
          value={formatNumber(stats.runningScans)}
          accentClassName="bg-accent"
          caption="Live work inside these engagements."
        />
      </div>

      <FilterBar
        search={{
          value: query.search,
          onChange: query.setSearch,
          placeholder: 'Search projects, clients or owners',
          label: 'Search projects',
        }}
        activeCount={query.activeFilterCount}
        onClear={query.clearFilters}
      >
        <FilterSelect
          label="Status"
          value={query.filters.status ?? ''}
          onChange={(value) => query.setFilter('status', value)}
          options={PROJECT_STATUSES.map((status) => ({
            value: status,
            label: PROJECT_STATUS_META[status].label,
          }))}
        />
        <FilterSelect
          label="Assessment"
          value={query.filters.assessmentType ?? ''}
          onChange={(value) => query.setFilter('assessmentType', value)}
          options={ASSESSMENT_TYPES.map((type) => ({
            value: type,
            label: ASSESSMENT_TYPE_LABELS[type],
          }))}
        />
        <FilterSelect
          label="Owner"
          value={query.filters.owner ?? ''}
          onChange={(value) => query.setFilter('owner', value)}
          options={ownerOptions}
        />
      </FilterBar>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load projects"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.results ?? []}
            rowKey={(row) => row.project.id}
            onRowClick={(row) => navigate(`/projects/${row.project.id}`)}
            loading={isPending}
            skeletonRows={8}
            caption="Projects in this workspace, with risk, scope and open-finding totals."
            defaultSort={sortToState(query.sort) ?? { key: 'riskScore', direction: 'desc' }}
            onSortChange={(next) => query.setSort(sortFromState(next))}
            emptyTitle={query.hasAnyFilter ? 'No projects match these filters' : 'No projects yet'}
            emptyDescription={
              query.hasAnyFilter
                ? 'Try clearing a filter or widening the search term.'
                : 'Create the first engagement to start tracking targets and scans.'
            }
            emptyAction={
              query.hasAnyFilter ? (
                <Button variant="secondary" onClick={query.reset}>
                  Clear filters
                </Button>
              ) : (
                <Button
                  variant="primary"
                  leadingIcon={<Plus className="size-4" />}
                  onClick={() => setCreateOpen(true)}
                >
                  New project
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

          {isFetching && !isPending ? (
            <p role="status" className="text-xs text-fg-subtle">
              Updating results…
            </p>
          ) : null}
        </>
      )}

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.projects.root })
          void queryClient.invalidateQueries({ queryKey: queryKeys.counts() })
        }}
      />
    </div>
  )
}
