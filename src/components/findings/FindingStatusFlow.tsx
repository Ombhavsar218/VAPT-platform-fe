import type { FindingStatus } from '@/types'
import { FINDING_STATUS_META } from '@/utils/severity'
import { cn } from '@/utils/cn'

/**
 * Where a finding sits in triage.
 *
 * The linear part is the path every finding walks — detected, then either
 * promoted or dismissed by a reviewer, then retested and closed. `false
 * positive` is drawn as a branch off `potential` because that is where it
 * actually comes from: a scanner inference that a human threw out.
 */

const MAIN_FLOW: readonly FindingStatus[] = ['open', 'potential', 'confirmed', 'needs_retest', 'fixed']

const BRANCHES: readonly FindingStatus[] = ['false_positive', 'reopened']

function Step({
  status,
  current,
  crossedOut,
}: {
  status: FindingStatus
  current: FindingStatus
  crossedOut: boolean
}) {
  const meta = FINDING_STATUS_META[status]
  const isCurrent = status === current
  const reached = MAIN_FLOW.indexOf(current) >= MAIN_FLOW.indexOf(status)

  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          'size-2.5 shrink-0 rounded-full ring-4',
          isCurrent ? meta.fill : reached ? 'bg-fg-subtle' : 'bg-border-strong',
          isCurrent && 'ring-surface',
        )}
      />
      <span
        className={cn(
          'text-xs',
          isCurrent ? 'font-semibold text-fg' : 'text-fg-subtle',
          crossedOut && 'line-through',
        )}
      >
        {meta.label}
      </span>
      {isCurrent ? (
        <span className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">now</span>
      ) : null}
    </li>
  )
}

export function FindingStatusFlow({ status }: { status: FindingStatus }) {
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {MAIN_FLOW.map((step) => (
          <Step key={step} status={step} current={status} crossedOut={false} />
        ))}
      </ol>
      <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-dashed border-border-base pt-2">
        <span className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">
          branches
        </span>
        {BRANCHES.map((step) => (
          <Step
            key={step}
            status={step}
            current={status}
            crossedOut={step === 'false_positive' && status !== 'false_positive'}
          />
        ))}
      </ol>
    </div>
  )
}