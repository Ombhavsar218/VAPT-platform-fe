import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  Bug,
  Boxes,
  ExternalLink,
  Globe,
  ListTree,
  Radar,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Tag,
} from 'lucide-react'

import { Card, CardHeader } from '@/components/common/Card'
import { ConfidenceBadge } from '@/components/common/ConfidenceBadge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader, ViewAllLink } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { ProgressBar } from '@/components/common/ProgressBar'
import { SearchBar } from '@/components/common/SearchBar'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import { Skeleton } from '@/components/common/Skeleton'
import { StatCard } from '@/components/common/StatCard'
import { EnvironmentBadge, FindingStatusBadge, ScanStatusBadge } from '@/components/common/StatusBadge'
import { Tabs } from '@/components/common/Tabs'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { targetDetailService } from '@/services/dashboard'
import { findingService, type FindingRow } from '@/services/findings'
import { queryKeys } from '@/services/queryKeys'
import { targetService } from '@/services/targets'
import { ApiError, normalizeListParams } from '@/services/transport'
import type { Endpoint, Scan } from '@/types'
import { formatDate, formatNumber, formatRelativeTime } from '@/utils/format'
import { listFilterHref } from '@/utils/listQuery'
import { ScopeEditor } from './ScopeEditor'

const ENDPOINT_PAGE_SIZE = 15
const FINDING_PAGE_SIZE = 10

const TYPE_LABELS: Record<string, string> = {
  web_application: 'Web application',
  api: 'API',
  web_service: 'Web service',
}

/**
 * Target detail.
 *
 * Read paths are loaded as one aggregate so the header, the severity donut and
 * the scan list cannot disagree. Endpoints and findings load lazily with their
 * tab, because a target can carry a few hundred endpoints and nobody needs them
 * on first paint.
 */
export function TargetDetailPage() {
  const { targetId = '' } = useParams()
  const [tab, setTab] = useState('overview')
  const [endpointQuery, setEndpointQuery] = useState('')
  const [endpointPage, setEndpointPage] = useState(1)
  const [findingPage, setFindingPage] = useState(1)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.targets.detail(targetId),
    queryFn: () => targetDetailService.load(targetId),
    enabled: Boolean(targetId),
  })

  const endpointsQuery = useQuery({
    queryKey: queryKeys.targets.endpoints(targetId),
    queryFn: () => targetService.endpoints(targetId),
    enabled: Boolean(targetId) && tab === 'endpoints',
    staleTime: 5 * 60_000,
  })

  const findingListParams = useMemo(
    () => normalizeListParams({ page: findingPage, pageSize: FINDING_PAGE_SIZE, filters: { target: [targetId] } }),
    [findingPage, targetId],
  )

  const findingsQuery = useQuery({
    queryKey: queryKeys.findings.list(findingListParams),
    queryFn: () => findingService.list(findingListParams),
    enabled: Boolean(targetId) && tab === 'findings',
    placeholderData: (previous) => previous,
  })

  const filteredEndpoints = useMemo(() => {
    const rows = endpointsQuery.data ?? []
    const needle = endpointQuery.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (endpoint) =>
        endpoint.path.toLowerCase().includes(needle) ||
        endpoint.method.toLowerCase().includes(needle) ||
        endpoint.contentType?.toLowerCase().includes(needle),
    )
  }, [endpointsQuery.data, endpointQuery])

  const endpointPageRows = useMemo(() => {
    const start = (endpointPage - 1) * ENDPOINT_PAGE_SIZE
    return filteredEndpoints.slice(start, start + ENDPOINT_PAGE_SIZE)
  }, [filteredEndpoints, endpointPage])

  const scanColumns = useMemo<Column<Scan>[]>(
    () => [
      {
        key: 'id',
        header: 'Scan',
        primaryOnMobile: true,
        cell: (scan) => (
          <div className="min-w-0">
            <Link
              to={`/scans/${scan.id}`}
              className="font-mono text-[13px] text-fg transition-colors hover:text-accent"
            >
              {scan.id}
            </Link>
            <p className="text-xs text-fg-subtle">{scan.profileId}</p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (scan) => <ScanStatusBadge status={scan.status} size="xs" />,
      },
      {
        key: 'progress',
        header: 'Progress',
        sortValue: (scan) => scan.progress,
        cell: (scan) =>
          scan.status === 'running' || scan.status === 'analyzing' || scan.status === 'queued' ? (
            <ProgressBar className="max-w-28" size="sm" value={scan.progress} />
          ) : (
            <span className="text-[13px] text-fg-subtle">—</span>
          ),
      },
      {
        key: 'findings',
        header: 'Findings',
        align: 'right',
        sortValue: (scan) => scan.findingCount,
        cell: (scan) => <span className="tabular-nums text-fg-muted">{scan.findingCount}</span>,
      },
      {
        key: 'startedAt',
        header: 'Started',
        sortValue: (scan) => scan.startedAt,
        cell: (scan) => (
          <span className="text-[13px] text-fg-muted" title={formatDate(scan.startedAt)}>
            {formatRelativeTime(scan.startedAt)}
          </span>
        ),
      },
    ],
    [],
  )

  const endpointColumns = useMemo<Column<Endpoint>[]>(
    () => [
      {
        key: 'method',
        header: 'Method',
        primaryOnMobile: true,
        cell: (endpoint) => (
          <span className="rounded border border-border-base bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg-muted">
            {endpoint.method}
          </span>
        ),
      },
      {
        key: 'path',
        header: 'Path',
        cell: (endpoint) => <span className="font-mono text-[13px] text-fg">{endpoint.path}</span>,
      },
      {
        key: 'contentType',
        header: 'Content type',
        hideBelowLg: true,
        cell: (endpoint) => <span className="text-[13px] text-fg-subtle">{endpoint.contentType}</span>,
      },
      {
        key: 'parameters',
        header: 'Parameters',
        hideBelowLg: true,
        cell: (endpoint) =>
          endpoint.parameters.length === 0 ? (
            <span className="text-[13px] text-fg-subtle">—</span>
          ) : (
            <span className="font-mono text-xs text-fg-muted">{endpoint.parameters.join(', ')}</span>
          ),
      },
      {
        key: 'authRequired',
        header: 'Auth',
        align: 'right',
        cell: (endpoint) =>
          endpoint.authRequired ? (
            <span className="text-[13px] text-warning">Required</span>
          ) : (
            <span className="text-[13px] text-fg-subtle">Open</span>
          ),
      },
      {
        key: 'discoveredAt',
        header: 'Discovered',
        align: 'right',
        hideBelowLg: true,
        sortValue: (endpoint) => endpoint.discoveredAt,
        cell: (endpoint) => (
          <span className="text-[13px] text-fg-subtle">{formatRelativeTime(endpoint.discoveredAt)}</span>
        ),
      },
    ],
    [],
  )

  const findingColumns = useMemo<Column<FindingRow>[]>(
    () => [
      {
        key: 'title',
        header: 'Finding',
        primaryOnMobile: true,
        cell: (finding) => (
          <div className="min-w-0">
            <Link
              to={`/findings/${finding.id}`}
              className="block truncate text-[13px] font-medium text-fg transition-colors hover:text-accent"
            >
              {finding.title}
            </Link>
            <p className="truncate font-mono text-xs text-fg-subtle">
              {finding.httpMethod} {finding.endpoint}
            </p>
          </div>
        ),
      },
      {
        key: 'severity',
        header: 'Severity',
        cell: (finding) => <SeverityBadge severity={finding.severity} compact />,
      },
      {
        key: 'confidence',
        header: 'Confidence',
        hideBelowLg: true,
        cell: (finding) => <ConfidenceBadge confidence={finding.confidence} size="xs" />,
      },
      {
        key: 'status',
        header: 'Status',
        cell: (finding) => <FindingStatusBadge status={finding.status} size="xs" />,
      },
      {
        key: 'owasp',
        header: 'OWASP',
        hideBelowLg: true,
        cell: (finding) => (
          <span className="font-mono text-xs text-fg-muted">{finding.owaspId}</span>
        ),
      },
      {
        key: 'lastDetected',
        header: 'Last seen',
        align: 'right',
        sortValue: (finding) => finding.lastDetected,
        cell: (finding) => (
          <span className="text-[13px] text-fg-muted">{formatRelativeTime(finding.lastDetected)}</span>
        ),
      },
    ],
    [],
  )

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title="Target" description="Loading target details…" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_unused, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="space-y-6">
        <PageHeader title="Target" />
        <Card>
          <ErrorState
            title={notFound ? 'This target does not exists' : 'Could not load the target'}
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={notFound ? undefined : () => void refetch()}
            retryLabel="Reload"
          />
          {notFound ? (
            <div className="flex justify-center pb-6">
              <Link to="/targets">
                <a className="text-[13px] font-medium text-accent hover:underline">Back to targets</a>
              </Link>
            </div>
          ) : null}
        </Card>
      </div>
    )
  }

  const { target, scope, technologies, endpointCount, scans, openFindingCount, findingCount, severity } = data
  const authorised = scope.authorizationConfirmed
  const activeScan = scans.find((scan) =>
    ['queued', 'initializing', 'running', 'analyzing'].includes(scan.status),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={target.name}
        description={target.description || undefined}
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            <a
              href={target.baseUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 font-mono text-fg-muted transition-colors hover:text-accent"
            >
              <Globe className="size-3.5 text-fg-subtle" aria-hidden="true" />
              {target.baseUrl}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            <EnvironmentBadge environment={target.environment} />
            <span className="text-fg-muted">{TYPE_LABELS[target.type] ?? target.type}</span>
            {target.projectId && target.projectName ? (
              <Link
                to={`/projects/${target.projectId}`}
                className="text-fg-muted transition-colors hover:text-accent"
              >
                {target.projectName}
                {target.client ? <span className="text-fg-subtle"> · {target.client}</span> : null}
              </Link>
            ) : (
              <span className="text-fg-subtle">Unassigned</span>
            )}
          </div>
        }
        actions={
          <Link to={`/scans/new?target=${target.id}`}>
            <a
              className={[
                'inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-medium',
                authorised
                  ? 'bg-accent text-accent-fg hover:opacity-90'
                  : 'pointer-events-none cursor-not-allowed bg-surface-3 text-fg-subtle',
              ].join(' ')}
              aria-disabled={!authorised}
              title={authorised ? undefined : 'Record written authorisation before scanning'}
            >
              <Radar className="size-4" aria-hidden="true" />
              New scan
            </a>
          </Link>
        }
      />

      {!authorised ? (
        <div className="flex flex-wrap items-start gap-3 rounded-card border border-danger/35 bg-danger/8 px-4 py-3.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-danger">Written authorisation is missing</p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
              This target cannot be scanned until a client authorisation reference is recorded. Add io
              in the Scope tab — no traffic is sent to the host until then.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTab('scope')}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            Open scope
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open findings"
          value={formatNumber(openFindingCount)}
          icon={<Bug className="size-4" />}
          caption={`${formatNumber(findingCount)} recorded in total.`}
          accentClassName={openFindingCount > 0 ? 'bg-sev-high' : 'bg-success'}
        />
        <StatCard
          label="Discovered endpoints"
          value={formatNumber(endpointCount)}
          icon={<ListTree className="size-4" />}
          caption="From every scan of this target."
        />
        <StatCard
          label="Last scan"
          value={data.lastScanAt ? formatRelativeTime(data.lastScanAt) : 'Never'}
          icon={<ScanLine className="size-4" />}
          caption={
            data.daysSinceScan === null
              ? 'No scan has been run against this assert.'
              : `${data.daysSinceScan} day${data.daysSinceScan === 1 ? '' : 's'} ago · ${scans.length} run${scans.length === 1 ? '' : 's'}`
          }
        />
        <StatCard
          label="Authorisation"
          value={authorised ? 'Confirmed' : 'Missing'}
          icon={authorised ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
          accentClassName={authorised ? 'bg-success' : 'bg-danger'}
          caption={scope.authorizationNote || 'No authorisation reference recorded.'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Open findings by severity" />
          <div className="mt-4">
            <SeverityDonut data={severity} height={180} />
          </div>
          {data.lastScanAt ? (
            <p className="mt-3 text-center text-xs text-fg-subtle">
              Last updated {formatRelativeTime(data.lastScanAt)}
            </p>
          ) : null}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Detected technologies"
            description="Fingerprinted from responses during the last crawl."
            actions={<ViewAllLink to={listFilterHref('/findings', { target: 'open' })}>All findings</ViewAllLink>}
          />
          {technologies.length === 0 ? (
            <EmptyState
              size="sm"
              className="mt-4"
              title="Nothing fingerprinted yes"
              description="Technology detection runs as part of a scan."
            />
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {technologies.map((tech) => (
                <li
                  key={`${tech.name}-${tech.version ?? ''}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-base bg-surface-2 px-2.5 py-1.5"
                  title={tech.category}
                >
                  <Boxes className="size-3.5 text-fg-subtle" aria-hidden="true" />
                  <span className="text-[13px] text-fg">{tech.name}</span>
                  {tech.version ? <span className="text-xs text-fg-subtle">{tech.version}</span> : null}
                  <ConfidenceBadge confidence={tech.confidence} size="xs" />
                </li>
              ))}
            </ul>
          )}
          {target.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-base pt-4">
              <Tag className="size-3.5 text-fg-subtle" aria-hidden="true" />
              {target.tags.map((tag) => (
                <span key={tag} className="text-xs text-fg-muted">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <section className="space-y-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'overview', label: 'Scans', count: scans.length, icon: <ScanLine className="size-4" /> },
            {
              id: 'findings',
              label: 'Findings',
              count: findingCount,
              icon: <Bug className="size-4" />,
            },
            {
              id: 'endpoints',
              label: 'Endpoints',
              count: endpointCount,
              icon: <ListTree className="size-4" />,
            },
            { id: 'scope', label: 'Scope', icon: <ShieldCheck className="size-4" /> },
          ]}
        />

        {tab === 'overview' ? (
          scans.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Radar className="size-5" />}
                title="No scans against this target"
                description={
                  authorised
                    ? 'Configure a scan to start collecting endpoints and findings.'
                    : 'Record written authorisation first, then configure a scan.'
                }
                action={
                  authorised ? (
                    <Link to={`/scans/new?target=${target.id}`}>
                      <a className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg">
                        Configure a scan
                      </a>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTab('scope')}
                      className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg"
                    >
                      Record authorisation
                    </button>
                  )
                }
              />
            </Card>
          ) : (
            <DataTable
              columns={scanColumns}
              rows={scans}
              rowKey={(scan) => scan.id}
              defaultSort={{ key: 'startedAt', direction: 'desc' }}
              caption="Every scan run against this target, newest first."
              footer={
                <p className="px-4 py-2.5 text-xs text-fg-subtle">
                  {activeScan
                    ? `${activeScan.id} is ${activeScan.status.replace('_', ' ')} · ${activeScan.progress}% complete`
                    : 'No scan is currently running.'}
                </p>
              }
            />
          )
        ) : null}

        {tab === 'findings' ? (
          <DataTable
            columns={findingColumns}
            rows={findingsQuery.data?.results ?? []}
            rowKey={(finding) => finding.id}
            loading={findingsQuery.isPending}
            skeletonRows={6}
            caption="Findings recorded against this target, across every scan."
            emptyTitle="No findings recorded"
            emptyDescription="A clean result is only meaningful once a scan has actually run."
            footer={
              findingsQuery.data ? (
                <Pagination
                  page={findingsQuery.data.page}
                  pageSize={findingsQuery.data.pageSize}
                  total={findingsQuery.data.count}
                  onPageChange={setFindingPage}
                />
              ) : null
            }
          />
        ) : null}

        {tab === 'endpoints' ? (
          <div className="space-y-3">
            <SearchBar
              value={endpointQuery}
              onChange={(value) => {
                setEndpointQuery(value)
                setEndpointPage(1)
              }}
              placeholder="Filter by path, method or content type"
              label="Filter endpoints"
            />
            <DataTable
              columns={endpointColumns}
              rows={endpointPageRows}
              rowKey={(endpoint) => `${endpoint.method}-${endpoint.path}`}
              loading={endpointsQuery.isPending}
              skeletonRows={8}
              caption="Endpoints discovered on this target."
              emptyTitle={endpointQuery ? 'No endpoints match what filter' : 'No endpoints discovered'}
              emptyDescription={
                endpointQuery
                  ? 'Try a shorter path fragment.'
                  : 'Endpoint discovery runs as part of a crawl; no scan has found routes on this target yes.'
              }
              footer={
                filteredEndpoints.length > 0 ? (
                  <Pagination
                    page={endpointPage}
                    pageSize={ENDPOINT_PAGE_SIZE}
                    total={filteredEndpoints.length}
                    onPageChange={setEndpointPage}
                  />
                ) : null
              }
            />
          </div>
        ) : null}

        {tab === 'scope' ? (
          <Card>
            <CardHeader
              title="Scope and authorisation"
              description="The crawler stays inside these boundaries. Changes apply to the next scan."
            />
            <div className="mt-5">
              {/* Keyed on `updatedAt` so a successful save, which bumps io, removes
                  the editor with a clean draft instead of leaving stale text. */}
              <ScopeEditor
                key={target.updatedAt}
                targetId={target.id}
                scope={scope}
              />
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  )
}
