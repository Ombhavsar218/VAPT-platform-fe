import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { Card } from '@/components/common/Card'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/common/PageHeader'
import { Spinner } from '@/components/common/Spinner'
import {
  CoverageMatrix,
  CoverageOverview,
  CoverageScopeSelect,
  ModuleCoverageTable,
} from '@/components/coverage/CoveragePanels'
import { queryKeys } from '@/services/queryKeys'
import { coverageService } from '@/services/coverage'

/**
 * OWASP and module coverage.
 *
 * Read as an answer to "what did we not test?" rather than "what did we find?".
 * The scope picker stays in the URL because "which project is this coverage for"
 * is the first question anyone asks, and it is the difference between a category
 * that is unsupported and one that was simply out of scope this engagement.
 */
export function CoveragePage() {
  const [params, setParams] = useSearchParams()
  const projectId = params.get('project') ?? ''

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.coverage.matrix(projectId || null),
    queryFn: () => coverageService.overview(projectId ? { projectId } : {}),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Coverage"
        description="What the scanner is capable of testing, what it actually tested, and where the catalogue is still unproven."
        actions={
          data ? (
            <div className="min-w-56">
              <CoverageScopeSelect
                projects={data.projects}
                value={projectId}
                onChange={(next) => {
                  const nextParams = new URLSearchParams(params)
                  if (next) nextParams.set('project', next)
                  else nextParams.delete('project')
                  setParams(nextParams, { replace: true })
                }}
              />
            </div>
          ) : null
        }
      />

      {data?.scopedToProject ? (
        <p className="text-[13px] text-fg-muted">
          Scoped to one project: executions, signals and findings narrow to that project, while the
          catalogue and available tests stay workspace-wide.
        </p>
      ) : null}

      {isPending ? (
        <div className="flex min-h-64 items-center justify-center gap-2 text-[13px] text-fg-muted">
          <Spinner />
          Recomputing coverage…
        </div>
      ) : null}

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load coverage"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : null}

      {data ? (
        <>
          <CoverageOverview aggregates={data.aggregates} scopedToProject={data.scopedToProject} />

          <CoverageMatrix matrix={data.matrix} />

          <ModuleCoverageTable modules={data.modules} />
        </>
      ) : null}
    </div>
  )
}