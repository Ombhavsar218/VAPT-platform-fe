import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Rocket } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card, CardHeader } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/common/PageHeader'
import { Spinner } from '@/components/common/Spinner'
import { StatCard } from '@/components/common/StatCard'
import { ModuleStatusBadge } from '@/components/common/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { adminService, EMPTY_REGISTRY_AGGREGATES, type RegistryRow } from '@/services/admin'
import { queryKeys } from '@/services/queryKeys'
import { formatNumber, formatRelativeTime } from '@/utils/format'

/** Per-host cell: converged, drifted behind, or not installed. */
function HostCell({ state }: { state: 'current' | 'drifted' | 'missing' }) {
  if (state === 'current') {
    return (
      <span
        title="Running the registry build"
        className="inline-block size-2.5 rounded-full bg-success"
        aria-label="Current"
      />
    )
  }
  if (state === 'drifted') {
    return (
      <span
        title="Pinned to an older build"
        className="inline-block size-2.5 rounded-full bg-warning"
        aria-label="Drifted"
      />
    )
  }
  return (
    <span
      title="Not installed"
      className="inline-block size-2.5 rounded-full border border-dashed border-fg-subtle"
      aria-label="Missing"
    />
  )
}

/**
 * Module registry (`/admin/modules`).
 *
 * The deployment matrix, which is a different question from the analyst-facing
 * register at `/modules`: not "should this detection run" but "is the fleet
 * actually running the build we think it is". A module can be enabled and still
 * be missing from every host, and only this view says so.
 */
export function AdminModulesPage() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.registry(),
    queryFn: () => adminService.registry(),
  })

  const deploy = useMutation({
    mutationFn: (moduleId: string) => adminService.deployModule(moduleId, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.root })
      toast.success('Module deployed', `${row.name} is now converged across the fleet.`)
    },
    onError: (caught) =>
      toast.error('Could not deploy', caught instanceof Error ? caught.message : 'Unknown error.'),
  })

  const aggregates = data?.aggregates ?? EMPTY_REGISTRY_AGGREGATES

  const hostColumns = useMemo<Column<RegistryRow>[]>(() => {
    const hosts = aggregates.hosts.filter((host) => host !== 'report-01')
    return [
      {
        key: 'name',
        header: 'Module',
        primaryOnMobile: true,
        sortValue: (row) => row.name,
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-fg">{row.name}</p>
            <p className="truncate font-mono text-[11px] text-fg-subtle">
              {row.id} · {row.version}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Editorial',
        sortValue: (row) => row.status,
        cell: (row) => <ModuleStatusBadge status={row.status} />,
      },
      {
        key: 'tests',
        header: 'Tests',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.testCount,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatNumber(row.testCount)}
          </span>
        ),
      },
      {
        key: 'findings',
        header: 'Findings',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.findings,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatNumber(row.findings)}
          </span>
        ),
      },
      ...hosts.map((host) => ({
        key: `host-${host}`,
        header: host,
        align: 'center' as const,
        cell: (row: RegistryRow) => (
          <HostCell
            state={
              row.driftedOn.includes(host)
                ? 'drifted'
                : row.installedOn.includes(host)
                  ? 'current'
                  : 'missing'
            }
          />
        ),
      })),
      {
        key: 'deploy',
        header: 'Rollout',
        align: 'right',
        sortValue: (row) => String(row.converged),
        cell: (row) => (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Rocket className="size-3.5" />}
            disabled={deploy.isPending || row.converged}
            title={
              row.converged
                ? 'Already converged across the fleet'
                : 'Install the registry build on every scanner host'
            }
            onClick={() => deploy.mutate(row.id)}
          >
            {row.converged ? 'Converged' : 'Deploy'}
          </Button>
        ),
      },
    ]
  }, [aggregates.hosts, deploy])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Module registry"
        description="Which build of each detection the worker fleet is actually running."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Converged"
          value={formatNumber(aggregates.converged)}
          caption={`of ${aggregates.total} modules`}
        />
        <StatCard
          label="Drifted"
          value={formatNumber(aggregates.drifted)}
          caption="Hosts pinned to an older build"
          accentClassName={aggregates.drifted > 0 ? 'bg-warning' : undefined}
        />
        <StatCard
          label="Not installed"
          value={formatNumber(aggregates.missingEverywhere)}
          caption="Absent from every host"
        />
        <StatCard
          label="Disabled"
          value={formatNumber(aggregates.byStatus.disabled)}
          caption="Will not run even when installed"
        />
      </div>

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load the registry"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <Card flush>
          <div className="border-b border-border-base px-5 py-4">
            <CardHeader
              title="Fleet matrix"
              description="One column per scanner host. The report host loads no detection modules."
            />
          </div>

          {isPending ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-[13px] text-fg-muted">
              <Spinner />
              Loading registry…
            </div>
          ) : (
            <DataTable
              columns={hostColumns}
              rows={data?.modules ?? []}
              rowKey={(row) => row.id}
              emptyTitle="No modules installed"
              emptyDescription="Install a detection module to populate the fleet matrix."
            />
          )}
        </Card>
      )}

      <Card flush>
        <div className="border-b border-border-base px-5 py-4">
          <CardHeader title="Legend" />
        </div>
        <ul className="divide-y divide-border-base">
          <li className="flex items-center gap-3 px-5 py-3">
            <HostCell state="current" />
            <span className="text-[13px] text-fg-muted">
              Running the build the registry names.
            </span>
          </li>
          <li className="flex items-center gap-3 px-5 py-3">
            <HostCell state="drifted" />
            <span className="text-[13px] text-fg-muted">
              Installed, but pinned to an older build — a rollout that did not finish.
            </span>
          </li>
          <li className="flex items-center gap-3 px-5 py-3">
            <HostCell state="missing" />
            <span className="text-[13px] text-fg-muted">
              Not installed on that host.
            </span>
          </li>
        </ul>
      </Card>

      {data?.modules.some((row) => !row.converged) ? (
        <p className="text-[12px] leading-relaxed text-fg-subtle">
          Deploying converges the fleet on one build. A module that is enabled on the register but
          missing from a host will not contribute findings from that host’s scans, which is what the
          coverage gaps on the coverage screen are measuring.
        </p>
      ) : null}

      {data && data.modules.length > 0 ? (
        <p className="text-[12px] text-fg-subtle">
          Last rollout activity:{' '}
          {formatRelativeTime(
            data.modules
              .map((row) => row.lastDeployAt)
              .sort()
              .at(-1) ?? data.modules[0]?.lastDeployAt ?? '',
          )}
          .
        </p>
      ) : null}
    </div>
  )
}
