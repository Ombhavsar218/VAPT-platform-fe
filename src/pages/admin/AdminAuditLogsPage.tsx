import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Spinner } from '@/components/common/Spinner'
import { OutcomeBadge } from '@/components/common/StatusBadge'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { adminService, auditActionLabel, type AuditRow } from '@/services/admin'
import { queryKeys } from '@/services/queryKeys'
import { normalizeListParams } from '@/services/transport'
import { formatNumber, formatRelativeTime } from '@/utils/format'

/**
 * Audit log (`/admin/audit-logs`).
 *
 * Read-only by construction: there is no mutation anywhere in this screen, and
 * the register is sorted newest-first by default because the question being
 * asked is almost always "what just happened". Entries carry the actor, the
 * outcome and the source address, because "who did this" has to be answerable
 * after the fact.
 */
export function AdminAuditLogsPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: '-timestamp' } })

  const normalized = normalizeListParams(query.params)
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.auditLogList(normalized),
    queryFn: () => adminService.listAudit(query.params),
  })
  const { data: options } = useQuery({
    queryKey: queryKeys.admin.auditOptions(),
    queryFn: () => adminService.auditOptions(),
  })

  const aggregates = data?.aggregates

  const columns = useMemo<Column<AuditRow>[]>(
    () => [
      {
        key: 'timestamp',
        header: 'When',
        primaryOnMobile: true,
        sortValue: (row) => row.timestamp,
        cell: (row) => (
          <span
            className="text-[13px] whitespace-nowrap text-fg-muted"
            title={row.timestamp}
          >
            {formatRelativeTime(row.timestamp)}
          </span>
        ),
      },
      {
        key: 'actor',
        header: 'Actor',
        sortValue: (row) => row.actorName,
        cell: (row) => (
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-fg">{row.actorName}</span>
            {row.actorRole ? (
              <span className="block truncate text-[11px] text-fg-subtle">
                {row.actorRole.replace('_', ' ')}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: 'action',
        header: 'Action',
        sortValue: (row) => row.action,
        cell: (row) => (
          <span className="text-[13px] text-fg">{auditActionLabel(row.action)}</span>
        ),
      },
      {
        key: 'entity',
        header: 'Entity',
        hideBelowLg: true,
        sortValue: (row) => row.entity,
        cell: (row) => (
          <span className="font-mono text-[12px] text-fg-muted">
            {row.entity} {row.entityId}
          </span>
        ),
      },
      {
        key: 'ipAddress',
        header: 'Source',
        hideBelowLg: true,
        cell: (row) => (
          <span className="font-mono text-[12px] text-fg-subtle">{row.ipAddress}</span>
        ),
      },
      {
        key: 'outcome',
        header: 'Outcome',
        align: 'right',
        sortValue: (row) => row.outcome,
        cell: (row) => <OutcomeBadge outcome={row.outcome} />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit logs"
        description="Every recorded action in the workspace. Entries are immutable; nothing on this screen can be edited or removed."
      />

      {aggregates ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Entries
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-fg">
              {formatNumber(aggregates.total)}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Failures
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-fg">
              {formatNumber(aggregates.byOutcome.failure)}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Distinct actors
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-fg">
              {formatNumber(aggregates.distinctActors)}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Action types
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-fg">
              {formatNumber(aggregates.byAction.length)}
            </p>
          </Card>
        </div>
      ) : null}

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load the audit log"
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
              placeholder: 'Search actor, action or entity',
              label: 'Search the audit log',
            }}
            activeCount={query.activeFilterCount}
            onClear={query.clearFilters}
          >
            <FilterSelect
              label="Action"
              value={query.filters.action ?? ''}
              onChange={(value) => query.setFilter('action', value)}
              options={(options?.actions ?? []).map((action) => ({
                value: action,
                label: auditActionLabel(action),
              }))}
            />
            <FilterSelect
              label="Entity"
              value={query.filters.entity ?? ''}
              onChange={(value) => query.setFilter('entity', value)}
              options={(options?.entities ?? []).map((entity) => ({ value: entity, label: entity }))}
            />
            <FilterSelect
              label="Actor"
              value={query.filters.actor ?? ''}
              onChange={(value) => query.setFilter('actor', value)}
              options={(options?.actors ?? []).map((actor) => ({
                value: actor.id,
                label: actor.name,
              }))}
            />
            <FilterSelect
              label="Outcome"
              value={query.filters.outcome ?? ''}
              onChange={(value) => query.setFilter('outcome', value)}
              options={[
                { value: 'success', label: 'Success' },
                { value: 'failure', label: 'Failure' },
              ]}
            />
          </FilterBar>

          {isPending ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-[13px] text-fg-muted">
              <Spinner />
              Loading entries…
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={data?.results ?? []}
              rowKey={(row) => row.id}
              defaultSort={sortToState(query.sort) ?? undefined}
              onSortChange={(next) => query.setSort(sortFromState(next))}
              emptyTitle={
                query.hasAnyFilter ? 'No entries match these filters' : 'No audit entries'
              }
              emptyDescription={
                query.hasAnyFilter
                  ? 'Try clearing the action, entity, actor or outcome filter.'
                  : 'Nothing has been recorded in this workspace yet.'
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

      {aggregates && aggregates.byAction.length > 0 ? (
        <Card flush>
          <div className="border-b border-border-base px-5 py-4">
            <p className="text-[13px] font-medium text-fg">Most frequent actions</p>
          </div>
          <ul className="divide-y divide-border-base">
            {aggregates.byAction.slice(0, 6).map((entry) => (
              <li key={entry.action} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <span className="text-[13px] text-fg-muted">
                  {auditActionLabel(entry.action)}
                </span>
                <span className="text-[13px] tabular-nums text-fg">
                  {formatNumber(entry.count)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
