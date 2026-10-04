import type { JobStatus, ModuleStatus, ReportFormat, ReportStatus } from '@/types'
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CirclePlay,
  Clock,
  Cpu,
  FlaskConical,
  HelpCircle,
  Loader2,
  Mail,
  OctagonX,
  Radar,
  Rocket,
  RotateCcw,
  Hourglass,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { TokenBadge, type BadgeSize } from './TokenBadge'
import { cn } from '@/utils/cn'
import {
  ASSESSMENT_TYPE_LABELS,
  ENVIRONMENT_META,
FINDING_STATUS_META,
JOB_STATUS_META,
MFA_META,
  MODULE_STATUS_META,
  OUTCOME_META,
  PROJECT_STATUS_META,
  REPORT_FORMAT_META,
  REPORT_STATUS_META,
  SCAN_STATUS_META,
  USER_STATUS_META,
} from '@/utils/severity'
import type { AssessmentType, Environment, FindingStatus, ProjectStatus, ScanStatus } from '@/types'

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>

const FINDING_ICONS: Record<FindingStatus, IconComponent | null> = {
  open: CircleDashed,
  potential: Radar,
  confirmed: CheckCircle2,
  false_positive: XCircle,
  needs_retest: HelpCircle,
  fixed: ShieldCheck,
  reopened: RotateCcw,
}

const SCAN_ICONS: Record<ScanStatus, IconComponent | null> = {
  queued: Clock,
  initializing: Loader2,
  running: Radar,
  analyzing: Cpu,
  completed: CheckCircle2,
  failed: OctagonX,
  cancelled: Ban,
}

/**
 * Finding lifecycle badge.
 *
 * `potential` is deliberately rendered with a dashed outline and a radar icon,
 * while `confirmed` uses a solid outline and a check. An unverified automated
 * result must never be visually mistaken for a validated vulnerability.
 */
export function FindingStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: FindingStatus
  size?: BadgeSize
  className?: string
}) {
  const Icon = FINDING_ICONS[status]
  return (
    <TokenBadge
      meta={FINDING_STATUS_META[status]}
      size={size}
      dashed={status === 'potential' || status === 'needs_retest'}
      icon={Icon ? <Icon className="size-3 shrink-0" /> : undefined}
      className={className}
    />
  )
}

/** Scan execution badge; running states read as live. */
export function ScanStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: ScanStatus
  size?: BadgeSize
  className?: string
}) {
  const Icon = SCAN_ICONS[status]
  const isLive = status === 'running' || status === 'analyzing' || status === 'initializing'

  return (
    <TokenBadge
      meta={SCAN_STATUS_META[status]}
      size={size}
      icon={
        Icon ? (
          <Icon className={cn('size-3 shrink-0', isLive && status === 'initializing' && 'animate-spin')} />
        ) : undefined
      }
      className={className}
    />
  )
}

/** Engagement lifecycle badge. */
export function ProjectStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: ProjectStatus
  size?: BadgeSize
  className?: string
}) {
  const Icon =
    status === 'active' ? CirclePlay : status === 'paused' ? CirclePause : status === 'completed' ? CircleCheck : undefined

  return (
    <TokenBadge
      meta={PROJECT_STATUS_META[status]}
      size={size}
      icon={Icon ? <Icon className="size-3 shrink-0" /> : undefined}
      className={className}
    />
  )
}

/** Deployment environment chip; production reads as high stakes. */
export function EnvironmentBadge({
  environment,
  size = 'xs',
  className,
}: {
  environment: Environment
  size?: BadgeSize
  className?: string
}) {
  return <TokenBadge meta={ENVIRONMENT_META[environment]} size={size} dot className={className} />
}

const ASSESSMENT_TYPE_ICONS: Record<AssessmentType, LucideIcon> = {
  web_application: Rocket,
  api: ServerCog,
  mobile_backend: Smartphone,
  infrastructure: ServerCog,
  red_team: FlaskConical,
}

/** Assessment type, rendered as a muted icon + label rather than a loud badge. */
export function AssessmentTypeLabel({ type, className }: { type: AssessmentType; className?: string }) {
  const Icon = ASSESSMENT_TYPE_ICONS[type]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] text-fg-muted', className)}>
      <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      {ASSESSMENT_TYPE_LABELS[type]}
    </span>
  )
}

/** Animated three-dot indicator for live scan contexts. */
export function LivePulse({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      <span className="text-xs font-medium text-accent">Live</span>
    </span>
  )
}

const REPORT_STATUS_ICONS: Record<ReportStatus, IconComponent> = {
  generating: Hourglass,
  ready: CircleCheck,
  outdated: RotateCcw,
  failed: XCircle,
}

/**
 * Deliverable state badge.
 *
 * `outdated` is deliberately a warning rather than an error: the document is
 * still readable, it just no longer describes the target, and the action is to
 * regenerate rather than to investigate.
 */
export function ReportStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: ReportStatus
  size?: BadgeSize
  className?: string
}) {
  const Icon = REPORT_STATUS_ICONS[status]
  return (
    <TokenBadge
      meta={REPORT_STATUS_META[status]}
      size={size}
      className={className}
      icon={<Icon className={cn('size-3 shrink-0', status === 'generating' && 'animate-pulse')} />}
    />
  )
}

/** Scanner module availability; experimental reads as "use at your own risk". */
export function ModuleStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: ModuleStatus
  size?: BadgeSize
  className?: string
}) {
  const Icon = status === 'disabled' ? Ban : status === 'experimental' ? FlaskConical : CircleCheck
  return (
    <TokenBadge
      meta={MODULE_STATUS_META[status]}
      size={size}
      className={className}
      icon={<Icon className="size-3 shrink-0" />}
    />
  )
}

/** Output format of a deliverable; muted, since it is metadata not state. */
export function ReportFormatBadge({
  format,
  size = 'sm',
  className,
}: {
  format: ReportFormat
  size?: BadgeSize
  className?: string
}) {
  return <TokenBadge meta={REPORT_FORMAT_META[format]} size={size} className={className} />
}
/** Audit outcome: quiet when it worked, loud when it did not. */
export function OutcomeBadge({
  outcome,
  size = 'sm',
  className,
}: {
  outcome: 'success' | 'failure'
  size?: BadgeSize
  className?: string
}) {
  const Icon = outcome === 'failure' ? CircleAlert : CircleCheck
  return (
    <TokenBadge
      meta={OUTCOME_META[outcome]}
      size={size}
      className={className}
      icon={<Icon className="size-3 shrink-0" />}
    />
  )
}

/** Member account state. */
export function UserStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: 'active' | 'invited' | 'suspended'
  size?: BadgeSize
  className?: string
}) {
  const Icon = status === 'active' ? CircleCheck : status === 'invited' ? Mail : Ban
  return (
    <TokenBadge
      meta={USER_STATUS_META[status]}
      size={size}
      className={className}
      icon={<Icon className="size-3 shrink-0" />}
    />
  )
}

/** MFA enrolment: rendered as state because a gap here is an audit finding. */
export function MfaBadge({
  enabled,
  size = 'sm',
  className,
}: {
  enabled: boolean
  size?: BadgeSize
  className?: string
}) {
  return (
    <TokenBadge
      meta={MFA_META[enabled ? 'on' : 'off']}
      size={size}
      className={className}
      icon={
        enabled ? (
          <ShieldCheck className="size-3 shrink-0" />
        ) : (
          <ShieldAlert className="size-3 shrink-0" />
        )
      }
    />
  )
}
/** Job lifecycle state on the admin queue. */
export function JobStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: JobStatus
  size?: BadgeSize
  className?: string
}) {
  const Icon =
    status === 'failed'
      ? XCircle
      : status === 'succeeded'
        ? CircleCheck
        : status === 'running'
          ? Loader2
          : status === 'cancelled'
            ? OctagonX
            : Hourglass

  return (
    <TokenBadge
      meta={JOB_STATUS_META[status]}
      size={size}
      className={className}
      icon={<Icon className={cn('size-3 shrink-0', status === 'running' && 'animate-spin')} />}
    />
  )
}