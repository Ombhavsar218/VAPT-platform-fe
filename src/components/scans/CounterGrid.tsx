import type { ScanCounters } from '@/types'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'

/**
 * Work counters for a run.
 *
 * These are the numbers an analyst watches to judge whether a scan is doing
 * anything, so they get their own panel rather than being folded into a stat
 * tile: four of them move while the run is live, and the whole point is seeing
 * them move.
 */

interface CounterDefinition {
  key: keyof ScanCounters
  label: string
  hint: string
}

const COUNTERS: CounterDefinition[] = [
  { key: 'endpointsDiscovered', label: 'Endpoints', hint: 'Discovered by the crawler' },
  { key: 'parametersDiscovered', label: 'Parameters', hint: 'Testable inputs found' },
  { key: 'requestsTested', label: 'Requests', hint: 'Probes sent' },
  { key: 'testsCompleted', label: 'Tests', hint: 'Probe executions finished' },
]

export function CounterGrid({
  counters,
  className,
}: {
  counters: ScanCounters
  className?: string
}) {
  return (
    <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border-base bg-border-base sm:grid-cols-4', className)}>
      {COUNTERS.map((definition) => (
        <div key={definition.key} className="bg-surface px-3.5 py-3">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            {definition.label}
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-fg">
            {formatNumber(counters[definition.key])}
          </dd>
          <p className="mt-0.5 text-[11px] leading-tight text-fg-subtle">{definition.hint}</p>
        </div>
      ))}
    </dl>
  )
}
