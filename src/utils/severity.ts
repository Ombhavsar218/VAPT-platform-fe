import { JOB_STATUSES, SEVERITIES } from '@/types'
import type {
  AssessmentType,
  Confidence,
  Environment,
  FindingStatus,
  JobStatus,
  ModuleStatus,
  ProjectStatus,
  ReportFormat,
  ReportStatus,
  ScanQueue,
  ScanStatus,
  Severity,
} from '@/types'

/**
 * Single source of truth for how severity, confidence and status are presented.
 *
 * Every badge, chart, dot and border in the app reads its colours from here, so
 * the palette can never drift between pages.
 *
 * Colour is never the only signal — each token also carries a text label.
 */

export interface TokenMeta {
  label: string
  /** Text colour, e.g. `text-sev-critical`. */
  text: string
  /** Tinted background, e.g. `bg-sev-critical/12`. */
  surface: string
  /** Border for outlined treatments. */
  border: string
  /** Solid fill for dots and rules. */
  fill: string
  /** Short form for dense contexts such as chart legends. */
  short: string
}

/** Higher rank = more severe. Used for sorting and risk maths. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
}

export type SeverityCounts = Record<Severity, number>

export function emptySeverityCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
}

/**
 * Risk score, 0-100, from the open findings' severities.
 *
 * The curve is deliberately compressive: twenty criticals and two criticals
 * cannot differ by 10x, because an engagement's risk should move visibly
 * without ever saturating at 100 and losing the ability to show progress.
 * Shared by the dashboard, project detail and the report risk summary so the
 * number a client reads in a PDF is the number the app showed them.
 */
const RISK_WEIGHTS: Record<Severity, number> = {
  critical: 22,
  high: 12,
  medium: 5,
  low: 1.5,
  informational: 0.4,
}

export function riskScoreFrom(counts: SeverityCounts): number {
  const weighted = SEVERITIES.reduce((total, severity) => total + counts[severity] * RISK_WEIGHTS[severity], 0)
  return Math.round(100 * (1 - Math.exp(-weighted / 90)))
}

/** Severity bands for a set of findings, counting each one once. */
export function severityCountsOf(findings: readonly { severity: Severity }[]): SeverityCounts {
  const counts = emptySeverityCounts()
  for (const finding of findings) counts[finding.severity] += 1
  return counts
}

export const SEVERITY_META: Record<Severity, TokenMeta> = {
  critical: {
    label: 'Critical',
    short: 'CRIT',
    text: 'text-sev-critical',
    surface: 'bg-sev-critical/12',
    border: 'border-sev-critical/35',
    fill: 'bg-sev-critical',
  },
  high: {
    label: 'High',
    short: 'HIGH',
    text: 'text-sev-high',
    surface: 'bg-sev-high/12',
    border: 'border-sev-high/35',
    fill: 'bg-sev-high',
  },
  medium: {
    label: 'Medium',
    short: 'MED',
    text: 'text-sev-medium',
    surface: 'bg-sev-medium/12',
    border: 'border-sev-medium/35',
    fill: 'bg-sev-medium',
  },
  low: {
    label: 'Low',
    short: 'LOW',
    text: 'text-sev-low',
    surface: 'bg-sev-low/12',
    border: 'border-sev-low/35',
    fill: 'bg-sev-low',
  },
  informational: {
    label: 'Informational',
    short: 'INFO',
    text: 'text-sev-info',
    surface: 'bg-sev-info/12',
    border: 'border-sev-info/35',
    fill: 'bg-sev-info',
  },
}

/* -------------------------------------------------------------------------- */
/* Project and target attributes                                                */
/* -------------------------------------------------------------------------- */

export const PROJECT_STATUS_META: Record<ProjectStatus, TokenMeta> = {
  planning: {
    label: 'Planning',
    short: 'PLAN',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  active: {
    label: 'Active',
    short: 'ACTIVE',
    text: 'text-info',
    surface: 'bg-info/12',
    border: 'border-info/35',
    fill: 'bg-info',
  },
  paused: {
    label: 'Paused',
    short: 'PAUSED',
    text: 'text-warning',
    surface: 'bg-warning/10',
    border: 'border-warning/40',
    fill: 'bg-warning',
  },
  completed: {
    label: 'Completed',
    short: 'DONE',
    text: 'text-success',
    surface: 'bg-success/12',
    border: 'border-success/35',
    fill: 'bg-success',
  },
}

/**
 * Environment tone.
 *
 * `production` deliberately borrows the critical treatment: a target in
 * production carries materially more risk than the same code in a lab.
 */
export const ENVIRONMENT_META: Record<Environment, TokenMeta> = {
  development: {
    label: 'Development',
    short: 'DEV',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  staging: {
    label: 'Staging',
    short: 'STG',
    text: 'text-info',
    surface: 'bg-info/12',
    border: 'border-info/35',
    fill: 'bg-info',
  },
  production: {
    label: 'Production',
    short: 'PROD',
    text: 'text-sev-critical',
    surface: 'bg-sev-critical/12',
    border: 'border-sev-critical/35',
    fill: 'bg-sev-critical',
  },
  lab: {
    label: 'Lab',
    short: 'LAB',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
}

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  web_application: 'Web application',
  api: 'API',
  mobile_backend: 'Mobile backend',
  infrastructure: 'Infrastructure',
  red_team: 'Red team',
}

export const CONFIDENCE_META: Record<Confidence, TokenMeta> = {  high: {
    label: 'High confidence',
    short: 'HIGH',
    text: 'text-fg',
    surface: 'bg-surface-2',
    border: 'border-border-strong',
    fill: 'bg-fg-muted',
  },
  medium: {
    label: 'Medium confidence',
    short: 'MED',
    text: 'text-warning',
    surface: 'bg-warning/12',
    border: 'border-warning/35',
    fill: 'bg-warning',
  },
  low: {
    label: 'Low confidence',
    short: 'LOW',
    text: 'text-fg-subtle',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
}

/**
 * Finding status presentation.
 *
 * `potential` and `confirmed` are styled very differently on purpose: an
 * unverified automated result must never look like a validated vulnerability.
 */
export const FINDING_STATUS_META: Record<FindingStatus, TokenMeta> = {
  open: {
    label: 'Open',
    short: 'OPEN',
    text: 'text-info',
    surface: 'bg-info/12',
    border: 'border-info/35',
    fill: 'bg-info',
  },
  potential: {
    label: 'Potential',
    short: 'POTENTIAL',
    text: 'text-warning',
    surface: 'bg-warning/10',
    border: 'border-warning/40',
    fill: 'bg-warning',
  },
  confirmed: {
    label: 'Confirmed',
    short: 'CONFIRMED',
    text: 'text-success',
    surface: 'bg-success/14',
    border: 'border-success/40',
    fill: 'bg-success',
  },
  false_positive: {
    label: 'False positive',
    short: 'FP',
    text: 'text-fg-subtle',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  needs_retest: {
    label: 'Needs more testing',
    short: 'RETEST',
    text: 'text-warning',
    surface: 'bg-warning/10',
    border: 'border-warning/40',
    fill: 'bg-warning',
  },
  fixed: {
    label: 'Fixed',
    short: 'FIXED',
    text: 'text-success',
    surface: 'bg-success/10',
    border: 'border-success/30',
    fill: 'bg-success',
  },
  reopened: {
    label: 'Reopened',
    short: 'REOPENED',
    text: 'text-sev-high',
    surface: 'bg-sev-high/12',
    border: 'border-sev-high/35',
    fill: 'bg-sev-high',
  },
}

export const SCAN_STATUS_META: Record<ScanStatus, TokenMeta> = {
  queued: {
    label: 'Queued',
    short: 'QUEUED',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  initializing: {
    label: 'Initializing',
    short: 'INIT',
    text: 'text-info',
    surface: 'bg-info/12',
    border: 'border-info/35',
    fill: 'bg-info',
  },
  running: {
    label: 'Running',
    short: 'RUNNING',
    text: 'text-accent',
    surface: 'bg-accent-soft',
    border: 'border-accent-border',
    fill: 'bg-accent',
  },
  analyzing: {
    label: 'Analyzing',
    short: 'ANALYZING',
    text: 'text-accent',
    surface: 'bg-accent-soft',
    border: 'border-accent-border',
    fill: 'bg-accent',
  },
  completed: {
    label: 'Completed',
    short: 'DONE',
    text: 'text-success',
    surface: 'bg-success/12',
    border: 'border-success/35',
    fill: 'bg-success',
  },
  failed: {
    label: 'Failed',
    short: 'FAILED',
    text: 'text-danger',
    surface: 'bg-danger/12',
    border: 'border-danger/35',
    fill: 'bg-danger',
  },
  cancelled: {
    label: 'Cancelled',
    short: 'CANCELLED',
    text: 'text-fg-subtle',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
}

/** A scan is "in flight" while it occupies a worker slot. */
export function isScanInFlight(status: ScanStatus): boolean {
  return (
    status === 'queued' ||
    status === 'initializing' ||
    status === 'running' ||
    status === 'analyzing'
  )
}

/** A finding still needs analyst attention. */
export function isFindingOpen(status: FindingStatus): boolean {
  return (
    status === 'open' ||
    status === 'potential' ||
    status === 'needs_retest' ||
    status === 'reopened'
  )
}

export function severityFromRank(rank: number): Severity {
  switch (rank) {
    case 5:
      return 'critical'
    case 4:
      return 'high'
    case 3:
      return 'medium'
    case 2:
      return 'low'
    default:
      return 'informational'
  }
}
/** One severity band with its share of the set, for stacked bars and tiles. */
export interface SeveritySlice {
  severity: Severity
  count: number
  /** Percentage to one decimal, so three bands cannot sum to 99.6 by accident. */
  share: number
}

export function severitySlices(counts: SeverityCounts): SeveritySlice[] {
  const total = SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0)
  return SEVERITIES.map((severity) => ({
    severity,
    count: counts[severity],
    share: total === 0 ? 0 : Math.round((counts[severity] / total) * 1000) / 10,
  }))
}
export const REPORT_STATUS_META: Record<ReportStatus, TokenMeta> = {
  generating: {
    label: 'Generating',
    short: 'RENDER',
    text: 'text-info',
    surface: 'bg-info/12',
    border: 'border-info/35',
    fill: 'bg-info',
  },
  ready: {
    label: 'Ready',
    short: 'READY',
    text: 'text-success',
    surface: 'bg-success/12',
    border: 'border-success/35',
    fill: 'bg-success',
  },
  outdated: {
    label: 'Outdated',
    short: 'STALE',
    text: 'text-warning',
    surface: 'bg-warning/12',
    border: 'border-warning/35',
    fill: 'bg-warning',
  },
  failed: {
    label: 'Failed',
    short: 'FAILED',
    text: 'text-danger',
    surface: 'bg-danger/12',
    border: 'border-danger/35',
    fill: 'bg-danger',
  },
}

export const REPORT_FORMAT_META: Record<ReportFormat, TokenMeta> = {
  pdf: {
    label: 'PDF',
    short: 'PDF',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  html: {
    label: 'HTML',
    short: 'HTML',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  docx: {
    label: 'Word',
    short: 'DOCX',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  markdown: {
    label: 'Markdown',
    short: 'MD',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
}

export const MODULE_STATUS_META: Record<ModuleStatus, TokenMeta> = {
  enabled: {
    label: 'Enabled',
    short: 'ON',
    text: 'text-success',
    surface: 'bg-success/12',
    border: 'border-success/35',
    fill: 'bg-success',
  },
  experimental: {
    label: 'Experimental',
    short: 'BETA',
    text: 'text-warning',
    surface: 'bg-warning/12',
    border: 'border-warning/35',
    fill: 'bg-warning',
  },
  disabled: {
    label: 'Disabled',
    short: 'OFF',
    text: 'text-fg-subtle',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
}
/**
 * Audit outcome. `failure` is the only one that should ever draw the eye, so it
 * carries the danger token and success is deliberately quiet.
 */
export const OUTCOME_META: Record<'success' | 'failure', TokenMeta> = {
  success: {
    label: 'Success',
    short: 'OK',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  failure: {
    label: 'Failure',
    short: 'FAIL',
    text: 'text-danger',
    surface: 'bg-danger/12',
    border: 'border-danger/35',
    fill: 'bg-danger',
  },
}

/** Account state on the members register. */
export const USER_STATUS_META: Record<'active' | 'invited' | 'suspended', TokenMeta> = {
  active: {
    label: 'Active',
    short: 'ON',
    text: 'text-success',
    surface: 'bg-success/12',
    border: 'border-success/35',
    fill: 'bg-success',
  },
  invited: {
    label: 'Invited',
    short: 'NEW',
    text: 'text-accent',
    surface: 'bg-accent/12',
    border: 'border-accent/35',
    fill: 'bg-accent',
  },
  suspended: {
    label: 'Suspended',
    short: 'SUSP',
    text: 'text-danger',
    surface: 'bg-danger/12',
    border: 'border-danger/35',
    fill: 'bg-danger',
  },
}
/**
 * MFA enrolment carries its own labels: reusing the outcome tokens would render
 * "Success" next to a person's name, which reads as a verdict on them.
 */
export const MFA_META: Record<'on' | 'off', TokenMeta> = {
  on: {
    label: 'MFA on',
    short: 'ON',
    text: 'text-success',
    surface: 'bg-success/12',
    border: 'border-success/35',
    fill: 'bg-success',
  },
  off: {
    label: 'MFA off',
    short: 'OFF',
    text: 'text-danger',
    surface: 'bg-danger/12',
    border: 'border-danger/35',
    fill: 'bg-danger',
  },
}
/** Job lifecycle. `failed` is the only state that should pull the eye. */
export const JOB_STATUS_META: Record<JobStatus, TokenMeta> = {
  queued: {
    label: 'Queued',
    short: 'Q',
    text: 'text-fg-muted',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
  running: {
    label: 'Running',
    short: 'RUN',
    text: 'text-accent',
    surface: 'bg-accent/12',
    border: 'border-accent/35',
    fill: 'bg-accent',
  },
  succeeded: {
    label: 'Succeeded',
    short: 'OK',
    text: 'text-success',
    surface: 'bg-success/12',
    border: 'border-success/35',
    fill: 'bg-success',
  },
  failed: {
    label: 'Failed',
    short: 'FAIL',
    text: 'text-danger',
    surface: 'bg-danger/12',
    border: 'border-danger/35',
    fill: 'bg-danger',
  },
  cancelled: {
    label: 'Cancelled',
    short: 'CXL',
    text: 'text-fg-subtle',
    surface: 'bg-surface-2',
    border: 'border-border-base',
    fill: 'bg-fg-subtle',
  },
}

export const JOB_STATUS_LABELS = Object.fromEntries(
  JOB_STATUSES.map((status) => [status, JOB_STATUS_META[status].label]),
) as Record<JobStatus, string>
/** Display names for the job queues, which are slugs in the data. */
export const QUEUE_LABELS: Record<ScanQueue, string> = {
  scans: 'Scan work',
  analysis: 'Analysis',
  reporting: 'Reporting',
  notifications: 'Notifications',
  maintenance: 'Maintenance',
}