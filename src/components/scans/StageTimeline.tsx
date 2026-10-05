import { Check, CircleDashed, Loader2, MinusCircle, OctagonX } from 'lucide-react'

import { ProgressBar } from '@/components/common/ProgressBar'
import type { ScanStage } from '@/types'
import { cn } from '@/utils/cn'
import { formatElapsed } from '@/utils/format'

/**
 * The scan pipeline, stage by stage.
 *
 * A vertical timeline rather than a row of pills: the stages are sequential, and
 * the panel has to stay readable next to the log without stealing its width.
 */

const STATE_TONE: Record<ScanStage['state'], string> = {
  done: 'border-success/60 bg-success/15 text-success',
  active: 'border-accent/60 bg-accent/15 text-accent-text',
  pending: 'border-border-base bg-surface-2 text-fg-subtle',
  skipped: 'border-border-base bg-surface-2 text-fg-subtle',
  failed: 'border-danger/60 bg-danger/15 text-danger',
}

function StageIcon({ state }: { state: ScanStage['state'] }) {
  if (state === 'done') return <Check className="size-3.5" aria-hidden="true" />
  if (state === 'active') return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
  if (state === 'failed') return <OctagonX className="size-3.5" aria-hidden="true" />
  if (state === 'skipped') return <MinusCircle className="size-3.5" aria-hidden="true" />
  return <CircleDashed className="size-3.5" aria-hidden="true" />
}

function StateLabel({ stage }: { stage: ScanStage }) {
  if (stage.state === 'done') return stage.completedAt ? `Done in ${formatElapsed(stageProgressSeconds(stage))}` : 'Done'
  if (stage.state === 'active') return `${stage.progress}% · running`
  if (stage.state === 'failed') return `Failed at ${stage.progress}%`
  if (stage.state === 'skipped') return 'Skipped'
  return 'Waiting'
}

function stageProgressSeconds(stage: ScanStage): number {
  if (!stage.startedAt || !stage.completedAt) return 0
  return Math.max(
    0,
    Math.round((new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime()) / 1000),
  )
}

export function StageTimeline({ stages, className }: { stages: ScanStage[]; className?: string }) {
  return (
    <ol className={cn('space-y-0.5', className)}>
      {stages.map((stage, index) => (
        <li key={stage.id} className="relative flex gap-3 pb-3 last:pb-0">
          {/* Connector between stage markers. */}
          {index < stages.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute bottom-3 left-[13px] top-7 w-px',
                stage.state === 'done' ? 'bg-success/40' : 'bg-border-base',
              )}
            />
          ) : null}

          <span
            className={cn(
              'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border',
              STATE_TONE[stage.state],
            )}
          >
            <StageIcon state={stage.state} />
          </span>

          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-baseline justify-between gap-3">
              <p
                className={cn(
                  'truncate text-[13px] font-medium',
                  stage.state === 'pending' ? 'text-fg-subtle' : 'text-fg',
                )}
              >
                {stage.name}
              </p>
              <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">
                <StateLabel stage={stage} />
              </span>
            </div>
            {stage.state === 'active' ? (
              <ProgressBar value={stage.progress} size="sm" className="mt-1.5" />
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
