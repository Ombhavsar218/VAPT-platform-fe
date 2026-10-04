import { useLayoutEffect, useRef, useState } from 'react'

import type { ScanLogEntry } from '@/types'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/format'

/**
 * The scanner's activity log.
 *
 * Follows the tail while a run is in flight and stops following as soon as the
 * user scrolls up to read, which is what a terminal does and what an analyst
 * expects when a line matters.
 */

const LEVEL_TONE: Record<ScanLogEntry['level'], string> = {
  info: 'text-fg-muted',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
}

const LEVEL_MARK: Record<ScanLogEntry['level'], string> = {
  info: '·',
  success: '+',
  warning: '!',
  error: 'x',
}

export interface ScanLogStreamProps {
  entries: ScanLogEntry[]
  /** Scrolls to the newest line as it arrives. */
  live?: boolean
  className?: string
  maxHeight?: number
}

export function ScanLogStream({ entries, live = false, className, maxHeight = 340 }: ScanLogStreamProps) {
  // Whether the viewport is parked at the newest line. `following` is derived
  // rather than stored, so a run that finishes simply stops following instead of
  // needing an effect to push a new value into state.
  const [pinnedToBottom, setPinnedToBottom] = useState(true)
  const following = live && pinnedToBottom
  const viewport = useRef<HTMLDivElement>(null)

  // Auto-follow only while the user has not taken over the scroll position.
  useLayoutEffect(() => {
    if (!following) return
    const element = viewport.current
    if (element) element.scrollTop = element.scrollHeight
  }, [entries, following])

  if (entries.length === 0) {
    return (
      <p
        className={cn(
          'rounded-card border border-border-base bg-surface-2 px-4 py-6 text-center text-[13px] text-fg-subtle',
          className,
        )}
      >
        No activity recorded yet. Log lines appear as the run reaches each stage.
      </p>
    )
  }

  return (
    <div
      ref={viewport}
      onScroll={(event) => {
        const element = event.currentTarget
        setPinnedToBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 24)
      }}
      className={cn(
        'overflow-y-auto rounded-card border border-border-base bg-surface-2 font-mono text-xs',
        className,
      )}
      style={{ maxHeight }}
    >
      <ol className="divide-y divide-border-base">
        {entries.map((entry) => (
          <li key={entry.id} className="flex gap-2.5 px-3 py-1.5">
            <span className="shrink-0 tabular-nums text-fg-subtle">{formatTime(entry.timestamp)}</span>
            <span className={cn('w-3 shrink-0 text-center', LEVEL_TONE[entry.level])}>
              {LEVEL_MARK[entry.level]}
            </span>
            <span className={cn('min-w-0 break-words', LEVEL_TONE[entry.level])}>{entry.message}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
