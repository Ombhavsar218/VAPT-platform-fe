import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileOutput, History, Layers3, RefreshCcw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { StatCard } from '@/components/common/StatCard'
import { ReportFormatBadge, ReportStatusBadge } from '@/components/common/StatusBadge'
import { GenerateReportModal } from '@/components/reports/GenerateReportModal'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { queryKeys } from '@/services/queryKeys'
import {
  EMPTY_REPORT_AGGREGATES,
  reportService,
  type ReportRow,
} from '@/services/reports'
import { PAGE_SIZE_OPTIONS } from '@/services/transport'
import { REPORT_FORMATS, REPORT_STATUSES } from '@/types'
import { REPORT_FORMAT_META, REPORT_STATUS_META } from '@/utils/severity'
import { formatNumber, formatRelativeTime } from '@/utils/format'

/**
 * Report register.
 *
 * The four state tiles are filters rather than decoration, because the state
 * that decides your next action is the state of the document: something ready
 * can go to a client, something outdated has to be regenerated first, and
 * something failed needs investigating before anyone quotes a number from it.
 */
export function ReportsPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: '-generatedAt' } })
  const navigate = useNavigate()
  const [generating, setGenerating] = useState(false)

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.reports.list(query.normalized),
    queryFn: () => reportService.register(query.params),
    placeholderData: (previous) => previous,
  })

  const stats = data?.aggregates ?? EMPTY_REPORT_AGGREGATES

  const toggleState = (state: string) => {
    const current = query.filters.status ? query.filters.status.split(',') : []
    const next = current.includes(state)
      ? current.filter((entry) => entry !== state)
      : [...current, state]
    query.setFilter('status', next.join(','))
  }

  const columns = useMemo<Column<ReportRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Report',
        primaryOnMobile: true,
        sortValue: (row) => row.report.name,
        cell: (row) => (
          <div className="min-w-0 max-w-md">
            <p className="truncate text-[13px] font-medium text-fg">{row.report.name}</p>
            <p className="truncate text-[11px] text-fg-subtle">
              {row.client} · {row.projectName}
            </p>
          </div>
        ),
      },
      {
        key: 'state',
        header: 'State',
        sortValue: (row) => row.state,
        cell: (row) => (
          <div className="min-w-0">
            <ReportStatusBadge status={row.state} />
            {row.report.version > 1 ? (
              <span className="mt-1 block text-[11px] text-fg-subtle">
                Version {row.report.version}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'scope',
        header: 'Scope',
        hideBelowLg: true,
        sortValue: (row) => row.scopeLabel,
        cell: (row) => (
          <span className="block max-w-40 truncate text-[13px] text-fg-muted">
            {row.scopeLabel}
          </span>
        ),
      },
      {
        key: 'format',
        header: 'Format',
        hideBelowLg: true,
        sortValue: (row) => row.report.format,
        cell: (row) => <ReportFormatBadge format={row.report.format} size="xs" />,
      },
      {
        key: 'findings',
        header: 'Findings',
        align: 'right',
        sortValue: (row) => row.report.findingCount,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatNumber(row.report.findingCount)}
          </span>
        ),
      },
      {
        key: 'createdBy',
        header: 'Author',
        hideBelowLg: true,
        sortValue: (row) => row.authorName,
        cell: (row) => (
          <span className="block max-w-32 truncate text-[13px] text-fg-muted">
            {row.authorName}
          </span>
        ),
      },
      {
        key: 'generatedAt',
        header: 'Generated',
        sortValue: (row) => row.report.generatedAt ?? '',
        cell: (row) => (
          <span className="text-[13px] whitespace-nowrap text-fg-muted">
            {row.report.generatedAt ? formatRelativeTime(row.report.generatedAt) : '—'}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Every deliverable generated for a client, and whether it still describes what is on the target."
        actions={
          <Button
            variant="primary"
            leadingIcon={<FileOutput className="size-4" />}
            onClick={() => setGenerating(true)}
            disabled={!data || data.generateOptions.length === 0}
          >
            Generate report
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {REPORT_STATUSES.map((state) => {
          const meta = REPORT_STATUS_META[state]
          const count = stats[state]
          const selected = (query.filters.status ?? '').split(',').includes(state)
          return (
            <button
              key={state}
              type="button"
              onClick={() => toggleState(state)}
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
                {count === 0 ? 'None in view' : `${Math.round((count / Math.max(1, stats.total)) * 100)}% of view`}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Findings quoted"
          value={formatNumber(stats.findingsCovered)}
          icon={<Layers3 className="size-4" />}
          accentClassName="bg-fg-subtle"
          caption="Summed across the reports in this view."
        />
        <StatCard
          label="Needs regenerating"
          value={formatNumber(stats.outdated)}
          icon={<RefreshCcw className="size-4" />}
          accentClassName={stats.outdated > 0 ? 'bg-warning' : 'bg-success'}
          caption="A newer scan of the same target has landed."
        />
        <StatCard
          label="Failed renders"
          value={formatNumber(stats.failed)}
          icon={<TriangleAlert className="size-4" />}
          accentClassName={stats.failed > 0 ? 'bg-danger' : 'bg-success'}
          caption="Cannot be downloaded until regenerated."
        />
        <StatCard
          label="Revised"
          value={formatNumber(stats.regenerated)}
          icon={<History className="size-4" />}
          accentClassName="bg-info"
          caption="Reports regenerated at least once."
        />
      </div>

      <FilterBar
        search={{
          value: query.search,
          onChange: query.setSearch,
          placeholder: 'Search report name, client, project or scope',
          label: 'Search reports',
        }}
        activeCount={query.activeFilterCount}
        onClear={query.clearFilters}
      >
        <FilterSelect
          label="Project"
          value={query.filters.project ?? ''}
          onChange={(value) => query.setFilter('project', value)}
          options={(data?.projects ?? []).map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          allLabel="All"
        />
        <FilterSelect
          label="Format"
          value={query.filters.format ?? ''}
          onChange={(value) => query.setFilter('format', value)}
          options={REPORT_FORMATS.map((format) => ({
            value: format,
            label: REPORT_FORMAT_META[format].label,
          }))}
          allLabel="Any"
        />
      </FilterBar>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load reports"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(row) => row.report.id}
          onRowClick={(row) => navigate(`/reports/${row.report.id}`)}
          loading={isPending}
          skeletonRows={8}
          caption="Generated reports, newest first."
          defaultSort={sortToState(query.sort) ?? { key: 'generatedAt', direction: 'desc' }}
          onSortChange={(next) => query.setSort(sortFromState(next))}
          emptyTitle={query.hasAnyFilter ? 'No reports match these filters' : 'No reports yet'}
          emptyDescription={
            query.hasAnyFilter
              ? 'Try clearing a filter or widening the search term.'
              : 'Generate a report from a completed scan and it will appear here.'
          }
          emptyAction={
            <Button
              variant="primary"
              leadingIcon={<FileOutput className="size-4" />}
              onClick={() => setGenerating(true)}
            >
              Generate report
            </Button>
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

      <GenerateReportModal
        open={generating}
        onClose={() => setGenerating(false)}
        options={data?.generateOptions ?? []}
        onGenerated={(reportId) => navigate(`/reports/${reportId}`)}
      />
    </div>
  )
}