import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { Card, CardHeader } from '@/components/common/Card'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Select } from '@/components/common/Form'
import { PageHeader } from '@/components/common/PageHeader'
import { Spinner } from '@/components/common/Spinner'
import { ScanCompareView } from '@/components/comparison/ScanCompareView'
import { queryKeys } from '@/services/queryKeys'
import { comparisonService, type CompareTargetOption } from '@/services/comparison'

/**
 * Scan comparison page.
 *
 * Both picks live in the URL, so a comparison is a link someone can paste into a
 * ticket. Defaults to the oldest and newest completed run of the target with the
 * richest history, which is the comparison most people actually want.
 */
/** Stable identity so the adopt-defaults effect does not re-run every render. */
const NO_TARGETS: CompareTargetOption[] = []

export function ScanComparePage() {
  const [params, setParams] = useSearchParams()

  const targetId = params.get('target') ?? ''
  const previousId = params.get('previous') ?? ''
  const currentId = params.get('current') ?? ''

  const optionsQuery = useQuery({
    queryKey: ['comparison', 'options'],
    queryFn: () => comparisonService.options(),
    staleTime: 5 * 60_000,
  })

  const options = optionsQuery.data ?? NO_TARGETS

// Fill in whatever the URL is missing, without discarding a pair the user
  // arrived with: the scan detail page links straight in with `previous` and
  // `current` set but no `target`.
  useEffect(() => {
    const fallback = options[0]
    if (!fallback) return

    const byId = options.find((option) => option.targetId === targetId)
    const byPair = options.find(
      (option) =>
        option.scans.some((scan) => scan.id === previousId || scan.id === currentId),
    )
    const option = byId ?? byPair ?? fallback

    const next = new URLSearchParams()
    next.set('target', option.targetId)
    next.set(
      'previous',
      option.scans.some((scan) => scan.id === previousId) ? previousId : (option.scans[0]?.id ?? ''),
    )
    next.set(
      'current',
      option.scans.some((scan) => scan.id === currentId)
        ? currentId
        : (option.scans.at(-1)?.id ?? ''),
    )

    // Comparing before writing keeps a `replace` from looping.
    if (next.toString() === params.toString()) return
    setParams(next, { replace: true })
  }, [options, targetId, previousId, currentId, params, setParams])

  const target = options.find((option) => option.targetId === targetId) ?? null

  const comparisonQuery = useQuery({
    queryKey: queryKeys.scans.compare(previousId, currentId),
    queryFn: () => comparisonService.compare(previousId, currentId),
    enabled: previousId !== '' && currentId !== '' && target !== null,
  })

  if (optionsQuery.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-[13px] text-fg-muted">
        <Spinner />
        Loading scan history…
      </div>
    )
  }

  if (optionsQuery.isError) {
    return (
      <Card>
        <ErrorState
          title="Could not load scan history"
          message={
            optionsQuery.error instanceof Error ? optionsQuery.error.message : 'Unknown error.'
          }
          onRetry={() => void optionsQuery.refetch()}
        />
      </Card>
    )
  }

  if (options.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Scan comparison" />
        <EmptyState
          title="No target has two completed runs"
          description="Comparison needs a baseline, so run a scan against a target that has already been assessed once."
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scan comparison"
        description="What changed between two runs of the same target: what was fixed, what appeared, and what came back."
      />

      <Card>
        <CardHeader
          title="Runs to compare"
          description="Only completed runs of the same target can be compared."
        />

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Target
            </span>
            <Select
              className="mt-1.5"
              value={targetId}
              onChange={(event) => {
                const option = options.find((entry) => entry.targetId === event.target.value)
                setParams(defaultsFor(option))
              }}
              options={options.map((option) => ({
                value: option.targetId,
                label: `${option.targetName} · ${option.scans.length} runs`,
              }))}
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Earlier run
            </span>
            <Select
              className="mt-1.5"
              value={previousId}
              onChange={(event) =>
                setParams({ target: targetId, previous: event.target.value, current: currentId })
              }
              options={(target?.scans ?? []).map((scan) => ({
                value: scan.id,
                label: `${scan.label} · ${scan.findingCount} findings`,
              }))}
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Newer run
            </span>
            <Select
              className="mt-1.5"
              value={currentId}
              onChange={(event) =>
                setParams({ target: targetId, previous: previousId, current: event.target.value })
              }
              options={(target?.scans ?? []).map((scan) => ({
                value: scan.id,
                label: `${scan.label} · ${scan.findingCount} findings`,
              }))}
            />
          </label>
        </div>
      </Card>

      {comparisonQuery.isPending ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-[13px] text-fg-muted">
          <Spinner />
          Matching findings across both runs…
        </div>
      ) : null}

      {comparisonQuery.isError ? (
        <Card>
          <ErrorState
            title="Could not compare those runs"
            message={
              comparisonQuery.error instanceof Error
                ? comparisonQuery.error.message
                : 'Unknown error.'
            }
            onRetry={() => void comparisonQuery.refetch()}
          />
        </Card>
      ) : null}

      {comparisonQuery.data ? <ScanCompareView data={comparisonQuery.data} /> : null}
    </div>
  )
}

function defaultsFor(option: CompareTargetOption | undefined): URLSearchParams {
  const scans = option?.scans ?? []
  const params = new URLSearchParams()
  if (option) params.set('target', option.targetId)
  if (scans[0]) params.set('previous', scans[0].id)
  if (scans.at(-1)) params.set('current', scans.at(-1)!.id)
  return params
}