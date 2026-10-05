import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, Bug, Clock, Plus, Radar, ShieldX, Timer } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { StatCard } from '@/components/common/StatCard'
import { ScanProgressCell } from '@/components/scans/ScanProgressCell'
import { pollWhileAnyInFlight } from '@/hooks/livePolling'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { projectService } from '@/services/projects'
import { queryKeys } from '@/services/queryKeys'
import { referenceService, targetService } from '@/services/targets'
import {
  EMPTY_SCAN_AGGREGATES,
  SCAN_STATUS_LABELS,
  scanService,
  type ScanAggregates,
  type ScanRegister,
  type ScanRow,
} from '@/services/scans'
import { PAGE_SIZE_OPTIONS } from '@/services/transport'
import { SCAN_STATUSES } from '@/types'
import { isScanInFlight } from '@/utils/severity'
import { formatCompact, formatElapsed, formatNumber, formatRelativeTime } from '@/utils/format'

/**
 * Scan register.
 *
 * The one page in the app that is expected to move while you watch it: runs in
 * flight tick their own progress, so the page polls only while a row is live
 * and goes quiet the moment the workspace is idle.
 */
export function ScansPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: '-startedAt' } })
  const navigate = useNavigate()

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.scans.list(query.normalized),
    queryFn: () => scanService.register(query.params),
    placeholderData: (previous) => previous,
    // In-flight runs are the only rows that change on their own, so the register
    // only polls while something is running. Reading the count off the query's
    // own result keeps the condition and the data it describes in one place.
    refetchInterval: (query) =>
      pollWhileAnyInFlight(
        (query.state.data as ScanRegister | undefined)?.aggregates.inFlight,
      ),
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

  const profilesQuery = useQuery({
    queryKey: queryKeys.reference.scanProfiles(),
    queryFn: () => referenceService.scanProfiles(),
    staleTime: 60 * 60_000,
  })

  const stats: ScanAggregates = data?.aggregates ?? EMPTY_SCAN_AGGREGATES
  const liveCount = stats.inFlight

  const startScan = () => {
    // Carry the register's filters into the wizard, so starting a scan from a
    // filtered view does not lose the context that led to it.
    const project = query.filters.project ?? ''
    navigate(project ? `/scans/new?project=${project}` : '/scans/new')
  }

  const columns = useMemo<Column<ScanRow>[]>(
    () => [
      {
        key: 'id',
        header: 'Scan',
        primaryOnMobile: true,
        sortValue: (row) => row.id,
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] font-medium text-fg">
              {row.id}
              {row.moduleIds.length > 0 ? (
                <span className="ml-1.5 font-sans text-[11px] text-fg-subtle">
                  {row.moduleIds.length} modules
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-fg-subtle">
              {row.profileName} · {row.projectName}
            </p>
          </div>
        ),
      },
      {
        key: 'target',
        header: 'Target',
        sortValue: (row) => row.targetName,
        cell: (row) => (
          <div className="min-w-0 max-w-56">
            <p className="truncate text-[13px] text-fg">{row.targetName}</p>
            <p className="truncate text-[11px] text-fg-subtle">{row.targetBaseUrl}</p>
          </div>
        ),
      },
      {
        key: 'profile',
        header: 'Profile',
        hideBelowLg: true,
        sortValue: (row) => row.profileName,
        cell: (row) => (
          <span className="text-[13px] text-fg-muted">
            {row.profileName}
            <span className="block text-[11px] capitalize text-fg-subtle">{row.profileIntensity}</span>
          </span>
        ),
      },
      {
        key: 'progress',
        header: 'Status',
        sortValue: (row) => row.progress,
        cell: (row) => <ScanProgressCell row={row} className="w-44" />,
      },
      {
        key: 'findingCount',
        header: 'Findings',
        align: 'right',
        sortValue: (row) => row.findingCount,
        cell: (row) =>
          row.findingCount === 0 ? (
            <span className="text-[13px] text-fg-subtle">0</span>
          ) : (
            <span className="flex items-center justify-end gap-1.5">
              {row.severityCounts.critical > 0 ? (
                <span
                  title={`${row.severityCounts.critical} critical`}
                  className="rounded border border-sev-critical/35 bg-sev-critical/12 px-1 text-[10px] font-semibold text-sev-critical"
                >
                  {row.severityCounts.critical} C
                </span>
              ) : null}
              {row.severityCounts.high > 0 ? (
                <span
                  title={`${row.severityCounts.high} high`}
                  className="rounded border border-sev-high/35 bg-sev-high/12 px-1 text-[10px] font-semibold text-sev-high"
                >
                  {row.severityCounts.high} H
                </span>
              ) : null}
              <span className="text-[13px] font-medium tabular-nums text-fg">{row.findingCount}</span>
            </span>
          ),
      },
      {
        key: 'requestsTested',
        header: 'Requests',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.counters.requestsTested,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatCompact(row.counters.requestsTested)}
          </span>
        ),
      },
      {
        key: 'startedAt',
        header: 'Started',
        sortValue: (row) => row.startedAt,
        cell: (row) => (
          <span className="text-[13px] text-fg-muted">
            {isScanInFlight(row.status) ? (
              <span className="inline-flex items-center gap-1.5 text-accent-text">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
                </span>
                Live
              </span>
            ) : (
              formatRelativeTime(row.startedAt)
            )}
          </span>
        ),
      },
      {
        key: 'initiatedBy',
        header: 'Analyst',
        hideBelowLg: true,
        sortValue: (row) => row.initiatedByName,
        cell: (row) => (
          <span className="block max-w-32 truncate text-[13px] text-fg-muted">
            {row.initiatedByName}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scans"
        description="Every run in the workspace, live progress while work is in flight, and what each run found."
        actions={
          <Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={startScan}>
            New scan
          </Button>
        }
        meta={
          liveCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text">
              <Radar className="size-3.5" aria-hidden="true" />
              {liveCount} run{liveCount === 1 ? '' : 's'} in flight
            </span>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="In flight"
          value={formatNumber(stats.inFlight)}
          icon={<Activity className="size-4" />}
          accentClassName={stats.inFlight > 0 ? 'bg-accent' : 'bg-fg-subtle'}
          caption={
            stats.queued > 0
              ? `${formatNumber(stats.queued)} waiting for a worker.`
              : stats.inFlight > 0
                ? 'Advancing while this page is open.'
                : 'The scanner fleet is idle.'
          }
        />
        <StatCard
          label="Completed"
          value={formatNumber(stats.completed)}
          icon={<Clock className="size-4" />}
          accentClassName="bg-success"
          caption={`${formatNumber(stats.successRate)}% of finished runs succeeded.`}
        />
        <StatCard
          label="Findings recorded"
          value={formatNumber(stats.findings)}
          icon={<Bug className="size-4" />}
          accentClassName={stats.findings > 0 ? 'bg-sev-high' : 'bg-success'}
          caption={`${formatCompact(stats.requestsTested)} requests sent across these runs.`}
        />
        <StatCard
          label="Average duration"
          value={stats.averageDurationSeconds > 0 ? formatElapsed(stats.averageDurationSeconds) : '—'}
          icon={<Timer className="size-4" />}
          accentClassName={stats.failed > 0 ? 'bg-danger' : 'bg-fg-subtle'}
          caption={
            stats.failed > 0 || stats.cancelled > 0
              ? `${formatNumber(stats.failed)} failed, ${formatNumber(stats.cancelled)} cancelled.`
              : 'No failed or cancelled runs in view.'
          }
        />
      </div>

      <FilterBar
        search={{
          value: query.search,
          onChange: query.setSearch,
          placeholder: 'Search scan id, target, project or analyst',
          label: 'Search scans',
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
            .filter((target) => (query.filters.project ? target.projectId === query.filters.project : true))
            .map((target) => ({ value: target.id, label: target.name }))}
          allLabel="All"
        />
        <FilterSelect
          label="Profile"
          value={query.filters.profile ?? ''}
          onChange={(value) => query.setFilter('profile', value)}
          options={(profilesQuery.data ?? []).map((profile) => ({
            value: profile.id,
            label: profile.name,
          }))}
          allLabel="All"
        />
        <FilterSelect
          label="Status"
          value={query.filters.status ?? ''}
          onChange={(value) => query.setFilter('status', value)}
          options={SCAN_STATUSES.map((status) => ({ value: status, label: SCAN_STATUS_LABELS[status] }))}
        />
        <FilterSelect
          label="Window"
          value={query.filters.window ?? ''}
          onChange={(value) => query.setFilter('window', value)}
          options={[
            { value: '1', label: 'Last 24 hours' },
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
          ]}
          allLabel="Any time"
        />
        <FilterSelect
          label="Only"
          value={query.filters.inFlight ?? ''}
          onChange={(value) => query.setFilter('inFlight', value)}
          options={[{ value: 'true', label: 'In flight only' }]}
          allLabel="Everything"
        />
      </FilterBar>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load scans"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/scans/${row.id}`)}
          loading={isPending}
          skeletonRows={8}
          caption="Scan history with live progress, findings and request volume."
          defaultSort={sortToState(query.sort) ?? { key: 'startedAt', direction: 'desc' }}
          onSortChange={(next) => query.setSort(sortFromState(next))}
          emptyTitle={query.hasAnyFilter ? 'No scans match these filters' : 'No scans yet'}
          emptyDescription={
            query.hasAnyFilter
              ? 'Try clearing a filter or widening the search term.'
              : 'Configure a scan against an authorised target to get started.'
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
                onClick={startScan}
              >
                New scan
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
            <ShieldX className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <span>
              Scans can only be started against a target with recorded written authorisation. Add one
              from the <Link to="/targets" className="text-accent-text underline-offset-2 hover:underline">targets register</Link>.
            </span>
          </p>
        </Card>
      ) : null}
    </div>
  )
}
