import { TokenBadge, type BadgeSize } from './TokenBadge'
import { CONFIDENCE_META } from '@/utils/severity'
import type { Confidence } from '@/types'

export interface ConfidenceBadgeProps {
  confidence: Confidence
  size?: BadgeSize
  className?: string
}

export function ConfidenceBadge({ confidence, size = 'sm', className }: ConfidenceBadgeProps) {
  return (
    <TokenBadge
      meta={CONFIDENCE_META[confidence]}
      size={size}
      dot
      className={className}
    />
  )
}
