import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bug, Crosshair, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { StatCard } from '@/components/common/StatCard'
import { EnvironmentBadge } from '@/components/common/StatusBadge'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { AddTargetModal } from './AddTargetModal'
import { projectService } from '@/services/projects'
import { queryKeys } from '@/services/queryKeys'
import { targetService, type TargetAggregates, type TargetRow } from '@/services/targets'
import { PAGE_SIZE_OPTIONS } from '@/services/transport'
import { ENVIRONMENTS, TARGET_TYPES } from '@/types'
import { ENVIRONMENT_META } from '@/utils/severity'
import { formatNumber, formatRelativeTime, hostnameOf } from '@/utils/format'

const TYPE_LABELS: Record<(typeof TARGET_TYPES)[number], string> = {
  web_application: 'Web application',
  api: 'API',
  web_service: 'Web service',
}

const EMPTY_AGGREGATES: TargetAggregates = {
  total: 0,
  production: 0,
  unauthorised: 0,
  endpoints: 0,
  openFindings: 0,
  neverScanned: 0,
}

/**
 * Target register.
 *
 * Every row shows its authorisation state, because an unauthorised target is not
 * a valid scan input — the detail page and the scan wizard both enforce it.
 */
export function TargetsPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: '-lastScanAt' } })
  const [addOpen, setAddOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.targets.list(query.normalized),
    queryFn: () => targetService.register(query.params),
    placeholderData: (previous) => previous,
  })

  const projectsQuery = useQuery({
    queryKey: queryKeys.reference.projects(),
    queryFn: () => projectService.options(),
    staleTime: 5 * 60_000,
  })

  // Counts describe the whole filtered set, not the rows on this page, so the
  // tiles stay true when the register is paginated. They arrive with the page
  // rather than as a second request, so the two can never disagree.
  const aggregates = data?.aggregates
  const stats = aggregates ?? EMPTY_AGGREGATES

  const columns = useMemo<Column<TargetRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Target',
        primaryOnMobile: true,
        sortValue: (row) => row.name,
        cell: (row) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-fg">
              {row.name}
              {row.runningScanCount > 0 ? (
                <span
                  title={`${row.runningScanCount} scan(s) in progress`}
                  className="inline-flex size-1.5 shrink-0 rounded-full bg-accent"
                />
              ) : null}
            </p>
            <p className="truncate font-mono text-xs text-fg-subtle">{hostnameOf(row.baseUrl)}</p>
          </div>
        ),
      },
      {
        key: 'project',
        header: 'Project',
        sortValue: (row) => row.projectName ?? 'zzz',
        cell: (row) =>
          row.projectId ? (
            <span className="block max-w-56 truncate text-[13px] text-fg-muted">{row.projectName}</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
              Unassigned
            </span>
          ),
      },
      {
        key: 'type',
        header: 'Type',
        hideBelowLg: true,
        sortValue: (row) => row.type,
        cell: (row) => <span className="text-[13px] text-fg-muted">{TYPE_LABELS[row.type]}</span>,
      },
      {
        key: 'environment',
        header: 'Environment',
        sortValue: (row) => row.environment,
        cell: (row) => <EnvironmentBadge environment={row.environment} />,
      },
      {
        key: 'authorised',
        header: 'Authorisation',
        hideBelowLg: true,
        cell: (row) =>
          row.scope.authorizationConfirmed ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-success">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Confirmed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-danger">
              <ShieldAlert className="size-3.5" aria-hidden="true" />
              Missing
            </span>
          ),
      },
      {
        key: 'endpointCount',
        header: 'Endpoints',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.endpointCount,
        cell: (row) => <span className="tabular-nums text-fg-muted">{row.endpointCount}</span>,
      },
      {
        key: 'openFindingCount',
        header: 'Open',
        align: 'right',
        sortValue: (row) => row.openFindingCount,
        cell: (row) =>
          row.openFindingCount === 0 ? (
            <span className="text-[13px] text-fg-subtle">0</span>
          ) : (
            <span className="flex items-center justify-end gap-1.5">
              {row.criticalCount > 0 ? (
                <span
                  title={`${row.criticalCount} critical`}
                  className="rounded border border-sev-critical/35 bg-sev-critical/12 px-1 text-[10px] font-semibold text-sev-critical"
                >
                  {row.criticalCount} C
                </span>
              ) : null}
              <span className="text-[13px] font-medium tabular-nums text-fg">{row.openFindingCount}</span>
            </span>
          ),
      },
      {
        key: 'lastScanAt',
        header: 'Last scan',
        sortValue: (row) => row.lastScanAt ?? '',
        cell: (row) => (
          <span className="text-[13px] text-fg-muted">
            {row.lastScanAt ? formatRelativeTime(row.lastScanAt) : 'Never'}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Targets"
        description="Authorised web applications, APIs and services in scope for testing."
        actions={
          <Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
            Add target
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Targets in scope"
          value={formatNumber(stats.total)}
          icon={<Crosshair className="size-4" />}
          caption={
            query.hasAnyFilter
              ? 'Matching the current filter and search.'
              : 'Every authorised asset in the workspace.'
          }
        />
        <StatCard
          label="Production"
          value={formatNumber(stats.production)}
          accentClassName="bg-sev-critical"
          caption="Live customer-facing systems."
        />
        <StatCard
          label="Open findings"
          value={formatNumber(stats.openFindings)}
          icon={<Bug className="size-4" />}
          accentClassName={stats.openFindings > 0 ? 'bg-sev-high' : 'bg-success'}
          caption={
            stats.neverScanned > 0
              ? `${formatNumber(stats.neverScanned)} target${stats.neverScanned === 1 ? '' : 's'} never scanned.`
              : 'Every matching target has been scanned at least once.'
          }
        />
        <StatCard
          label="Missing authorisation"
          value={formatNumber(stats.unauthorised)}
          icon={stats.unauthorised > 0 ? <ShieldAlert className="size-4" /> : <ShieldCheck className="size-4" />}
          accentClassName={stats.unauthorised > 0 ? 'bg-danger' : 'bg-success'}
          caption={
            stats.unauthorised > 0
              ? 'Cannot be scanned until written authorisation is recorded.'
              : 'Every matching target has recorded authorisation.'
          }
        />
      </div>

      <FilterBar
        search={{
          value: query.search,
          onChange: query.setSearch,
          placeholder: 'Search targets, hosts or clients',
          label: 'Search targets',
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
          label="Type"
          value={query.filters.type ?? ''}
          onChange={(value) => query.setFilter('type', value)}
          options={TARGET_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }))}
        />
        <FilterSelect
          label="Environment"
          value={query.filters.environment ?? ''}
          onChange={(value) => query.setFilter('environment', value)}
          options={ENVIRONMENTS.map((environment) => ({
            value: environment,
            label: ENVIRONMENT_META[environment].label,
          }))}
        />
        <FilterSelect
          label="Authorisation"
          value={query.filters.authorized ?? ''}
          onChange={(value) => query.setFilter('authorized', value)}
          options={[
            { value: 'true', label: 'Confirmed' },
            { value: 'false', label: 'Missing' },
          ]}
        />
      </FilterBar>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load targets"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.results ?? []}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/targets/${row.id}`)}
            loading={isPending}
            skeletonRows={8}
            caption="Authorised targets with scope, endpoint counts and open findings."
            defaultSort={sortToState(query.sort) ?? { key: 'lastScanAt', direction: 'desc' }}
            onSortChange={(next) => query.setSort(sortFromState(next))}
            emptyTitle={query.hasAnyFilter ? 'No targets match these filters' : 'No targets yet'}
            emptyDescription={
              query.hasAnyFilter
                ? 'Try clearing a filter or widening the search term.'
                : 'Add the first authorised asset to begin scanning.'
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
                  onClick={() => setAddOpen(true)}
                >
                  Add target
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

      {data && data.count === 0 && !isPending ? (
        <EmptyState
          size="sm"
          title="Nothing to triage"
          description="The register is empty for the selected filter."
        />
      ) : null}

      <AddTargetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.targets.root })
          void queryClient.invalidateQueries({ queryKey: queryKeys.counts() })
        }}
      />
    </div>
  )
}
