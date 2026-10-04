import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, FlaskConical } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Spinner } from '@/components/common/Spinner'
import { StatCard } from '@/components/common/StatCard'
import { ModuleStatusBadge } from '@/components/common/StatusBadge'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { modulesService, EMPTY_MODULE_AGGREGATES, type ModuleRow } from '@/services/modules'
import { queryKeys } from '@/services/queryKeys'
import { normalizeListParams } from '@/services/transport'
import { MODULE_STATUSES } from '@/types'
import { MODULE_STATUS_META } from '@/utils/severity'
import { formatNumber, formatRelativeTime } from '@/utils/format'

/**
 * Detection modules (`/modules`).
 *
 * Framed as a question an analyst asks before trusting a result: *which
 * detections were available when this ran?* So every row carries its test count
 * and the OWASP categories it feeds, and the status tile row doubles as the
 * filter — the counts are the navigation.
 */
export function ModulesPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: 'name' } })
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const normalized = normalizeListParams(query.params)
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.modules.list(normalized),
    queryFn: () => modulesService.list(query.params),
  })
  const { data: options } = useQuery({
    queryKey: queryKeys.modules.options(),
    queryFn: () => modulesService.options(),
  })

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: ModuleRow['status']; name: string }) =>
      modulesService.setStatus(input.id, input.status, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.modules.root })
      void queryClient.invalidateQueries({ queryKey: queryKeys.coverage.root })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.root })
      toast.success('Module updated', `${row.name} is now ${row.status}.`)
    },
    onError: (caught) => {
      toast.error(
        'Could not update the module',
        caught instanceof Error ? caught.message : 'Unknown error.',
      )
    },
  })

  const aggregates = data?.aggregates ?? EMPTY_MODULE_AGGREGATES

  const columns = useMemo<Column<ModuleRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Module',
        primaryOnMobile: true,
        sortValue: (row) => row.name,
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-fg">{row.name}</p>
            <p className="truncate font-mono text-[11px] text-fg-subtle">{row.slug}</p>
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        hideBelowLg: true,
        sortValue: (row) => row.category,
        cell: (row) => <span className="text-[13px] text-fg-muted">{row.category}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (row) => row.status,
        cell: (row) => (
          <div className="flex flex-col items-start gap-1.5">
            <ModuleStatusBadge status={row.status} />
            <Button
              variant="ghost"
              loading={setStatus.isPending}
              onClick={() =>
                setStatus.mutate({
                  id: row.id,
                  status: row.status === 'enabled' ? 'disabled' : 'enabled',
                  name: row.name,
                })
              }
            >
              {row.status === 'enabled' ? 'Disable' : 'Enable'}
            </Button>
          </div>
        ),
      },
      {
        key: 'version',
        header: 'Version',
        hideBelowLg: true,
        sortValue: (row) => row.version,
        cell: (row) => (
          <span className="font-mono text-[12px] text-fg-muted">{row.version}</span>
        ),
      },
      {
        key: 'testCount',
        header: 'Tests',
        align: 'right',
        sortValue: (row) => row.testCount,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatNumber(row.testCount)}
          </span>
        ),
      },
      {
        key: 'findingCount',
        header: 'Findings',
        align: 'right',
        sortValue: (row) => row.findingCount,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatNumber(row.findingCount)}
          </span>
        ),
      },
      {
        key: 'owasp',
        header: 'OWASP',
        hideBelowLg: true,
        cell: (row) => (
          <span className="font-mono text-[11px] text-fg-subtle">
            {row.owaspCategories.join(' ')}
          </span>
        ),
      },
      {
        key: 'profiles',
        header: 'Profiles',
        hideBelowLg: true,
        cell: (row) => (
          <span className="text-[12px] text-fg-muted">
            {row.includedInProfiles.length > 0 ? row.includedInProfiles.join(', ') : '—'}
          </span>
        ),
      },
      {
        key: 'updatedAt',
        header: 'Updated',
        align: 'right',
        sortValue: (row) => row.updatedAt,
        cell: (row) => (
          <span className="text-[13px] whitespace-nowrap text-fg-muted">
            {formatRelativeTime(row.updatedAt)}
          </span>
        ),
      },
    ],
    [setStatus],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scanner modules"
        description="The detections available to this workspace. Disabling one stops future runs using it and never retracts findings it already produced."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MODULE_STATUSES.map((status) => {
          const meta = MODULE_STATUS_META[status]
          const count = aggregates.byStatus[status]
          const selected = (query.filters.status ?? '').split(',').includes(status)
          return (
            <button
              key={status}
              type="button"
              aria-pressed={selected}
              onClick={() => query.toggleFilterValue('status', status)}
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
                <span className="text-xl font-semibold tabular-nums text-fg">
                  {formatNumber(count)}
                </span>
              </span>
            </button>
          )
        })}

        <StatCard
          label="Tests available"
          value={formatNumber(aggregates.totalTests)}
          caption="Summed across the catalogue"
          icon={<FlaskConical className="size-4" aria-hidden="true" />}
        />
      </div>

      {aggregates.categories.length > 0 ? (
        <p className="text-[13px] text-fg-muted">
          {aggregates.categories.length} categor{aggregates.categories.length === 1 ? 'y' : 'ies'} ·{' '}
          {formatNumber(aggregates.findingsFromEnabled)} findings trace back to an enabled module.
        </p>
      ) : null}

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load modules"
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
              placeholder: 'Search modules',
              label: 'Search modules',
            }}
            activeCount={query.activeFilterCount}
            onClear={query.clearFilters}
          >
            <FilterSelect
              label="Category"
              value={query.filters.category ?? ''}
              onChange={(value) => query.setFilter('category', value)}
              options={(options?.categories ?? []).map((category) => ({
                value: category,
                label: category,
              }))}
            />
            <FilterSelect
              label="Profile"
              value={query.filters.profile ?? ''}
              onChange={(value) => query.setFilter('profile', value)}
              options={(options?.profiles ?? []).map((profile) => ({
                value: profile.id,
                label: profile.name,
              }))}
            />
            <FilterSelect
              label="OWASP"
              value={query.filters.owasp ?? ''}
              onChange={(value) => query.setFilter('owasp', value)}
              options={(options?.owaspCategories ?? []).map((category) => ({
                value: category.id,
                label: category.label,
              }))}
            />
          </FilterBar>

          {isPending ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-[13px] text-fg-muted">
              <Spinner />
              Loading modules…
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={data?.results ?? []}
              rowKey={(row) => row.id}
              defaultSort={sortToState(query.sort) ?? undefined}
              onSortChange={(next) => query.setSort(sortFromState(next))}
              emptyTitle={query.hasAnyFilter ? 'No modules match these filters' : 'No modules'}
              emptyDescription={
                query.hasAnyFilter
                  ? 'Try widening the status, category or OWASP filter.'
                  : 'The workspace has no detection modules installed.'
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

      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-fg-subtle">
        <Boxes className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Deployment across the worker fleet is an operational concern and lives under Administration →
        Module registry. A module can be enabled here and still be missing from a host.
      </p>
    </div>
  )
}
