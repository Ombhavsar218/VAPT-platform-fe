import { Check, Loader2, MinusCircle } from 'lucide-react'

import { ProgressBar } from '@/components/common/ProgressBar'
import type { ModuleRun } from '@/services/scanSimulation'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'

/**
 * Per-module execution, in the order the run scheduled them.
 *
 * Modules are the unit an analyst actually reasons about — "did the access
 * control module even run?" — so the detail page shows them individually rather
 * than as one "3 of 14 complete" counter.
 */

const STATE_LABEL: Record<ModuleRun['state'], string> = {
  pending: 'Queued',
  running: 'Running',
  done: 'Complete',
}

export function ModuleRunList({
  runs,
  className,
}: {
  runs: ModuleRun[]
  className?: string
}) {
  if (runs.length === 0) {
    return (
      <p className={cn('text-[13px] text-fg-subtle', className)}>
        This run had no modules selected.
      </p>
    )
  }

  return (
    <ul className={cn('space-y-2', className)}>
      {runs.map((run) => (
        <li key={run.id} className="rounded-card border border-border-base bg-surface-2 px-3.5 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-fg">
                {run.state === 'done' ? (
                  <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                ) : run.state === 'running' ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-accent-text" aria-hidden="true" />
                ) : (
                  <MinusCircle className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                )}
                {run.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-fg-subtle">
                {run.category} · {formatNumber(run.testCount)} tests
                {run.owaspCategories.length > 0 ? ` · ${run.owaspCategories.join(', ')}` : ''}
              </p>
            </div>
            <span className="shrink-0 text-right text-[11px] tabular-nums text-fg-subtle">
              <span
                className={cn(
                  'block font-medium',
                  run.state === 'done' ? 'text-success' : run.state === 'running' ? 'text-accent-text' : 'text-fg-subtle',
                )}
              >
                {STATE_LABEL[run.state]}
              </span>
              <span className="mt-0.5 block">
                {formatNumber(run.testsCompleted)}/{formatNumber(run.testCount)}
              </span>
            </span>
          </div>
          {run.state === 'running' ? (
            <ProgressBar value={run.progress} size="sm" className="mt-2" />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
