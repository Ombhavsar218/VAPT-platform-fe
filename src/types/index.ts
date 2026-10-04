/**
 * Core domain types for VAPTFlow.
 *
 * These shapes intentionally mirror what a Django REST API will eventually
 * return, so the mock service layer can be swapped for `fetch` without touching
 * a single component.
 *
 * Conventions:
 *  - String-literal unions + `as const` arrays (no TS enums; `erasableSyntaxOnly`
 *    is enabled and enums are also a poor fit for JSON serialisation).
 *  - All ids are opaque strings.
 *  - Timestamps are ISO-8601 strings, matching DRF's default serialisation.
 */

export const SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
] as const
export type Severity = (typeof SEVERITIES)[number]

export const CONFIDENCES = ['high', 'medium', 'low'] as const
export type Confidence = (typeof CONFIDENCES)[number]

/**
 * Lifecycle of a single finding.
 *
 * The distinction between `potential` and `confirmed` is a core product
 * concept: the scanner only ever produces *potential* findings, and a human
 * analyst promotes one to `confirmed`.
 */
export const FINDING_STATUSES = [
  'open',
  'potential',
  'confirmed',
  'false_positive',
  'needs_retest',
  'fixed',
  'reopened',
] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]

export const SCAN_STATUSES = [
  'queued',
  'initializing',
  'running',
  'analyzing',
  'completed',
  'failed',
  'cancelled',
] as const
export type ScanStatus = (typeof SCAN_STATUSES)[number]

export const PROJECT_STATUSES = ['planning', 'active', 'paused', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const ASSESSMENT_TYPES = [
  'web_application',
  'api',
  'mobile_backend',
  'infrastructure',
  'red_team',
] as const
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number]

export const TARGET_TYPES = ['web_application', 'api', 'web_service'] as const
export type TargetType = (typeof TARGET_TYPES)[number]

export const ENVIRONMENTS = ['development', 'staging', 'production', 'lab'] as const
export type Environment = (typeof ENVIRONMENTS)[number]

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export const SCAN_PROFILES = ['quick', 'standard', 'full'] as const
export type ScanProfileId = (typeof SCAN_PROFILES)[number]

export const USER_ROLES = ['admin', 'lead_analyst', 'analyst', 'viewer'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const REPORT_FORMATS = ['pdf', 'html', 'docx', 'markdown'] as const
export type ReportFormat = (typeof REPORT_FORMATS)[number]

export const REPORT_STATUSES = ['generating', 'ready', 'outdated', 'failed'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const MODULE_STATUSES = ['enabled', 'disabled', 'experimental'] as const
export type ModuleStatus = (typeof MODULE_STATUSES)[number]

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const VERIFICATION_DECISIONS = ['confirmed', 'false_positive', 'needs_retest'] as const
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number]

/* -------------------------------------------------------------------------- */
/* Organisation & scope                                                        */
/* -------------------------------------------------------------------------- */

export interface Organization {
  id: string
  name: string
  slug: string
}

export interface Project {
  id: string
  name: string
  description: string
  client: string
  assessmentType: AssessmentType
  status: ProjectStatus
  startDate: string
  endDate: string
  owner: string
  createdAt: string
  updatedAt: string
}

export interface ScopeConfig {
  allowedPaths: string[]
  excludedPaths: string[]
  allowedDomains: string[]
  excludedDomains: string[]
  authorizationConfirmed: boolean
  authorizationNote: string
}

export interface Target {
  id: string
  projectId: string | null
  name: string
  baseUrl: string
  type: TargetType
  environment: Environment
  description: string
  scope: ScopeConfig
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Technology {
  name: string
  category: string
  version: string | null
  confidence: Confidence
}

export interface Endpoint {
  id: string
  targetId: string
  method: HttpMethod
  path: string
  contentType: string
  parameters: string[]
  discoveredAt: string
  authRequired: boolean
}

/* -------------------------------------------------------------------------- */
/* Scanning                                                                    */
/* -------------------------------------------------------------------------- */

export interface ScanProfile {
  id: ScanProfileId
  name: string
  description: string
  estimatedMinutes: number
  intensity: 'low' | 'balanced' | 'thorough'
  capabilities: string[]
  moduleIds: string[]
}

export interface ScannerModule {
  id: string
  name: string
  slug: string
  description: string
  category: string
  status: ModuleStatus
  version: string
  testCount: number
  /** OWASP Top 10:2025 categories this module contributes tests to. */
  owaspCategories: string[]
  updatedAt: string
}

export interface ScanStage {
  id: string
  name: string
  state: 'pending' | 'active' | 'done' | 'skipped' | 'failed'
  progress: number
  startedAt: string | null
  completedAt: string | null
}

export interface ScanLogEntry {
  id: string
  timestamp: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export interface ScanCounters {
  endpointsDiscovered: number
  parametersDiscovered: number
  requestsTested: number
  testsCompleted: number
  potentialFindings: number
}

export interface Scan {
  id: string
  sequence: number
  projectId: string
  targetId: string
  profileId: ScanProfileId
  /** Modules actually selected for this run, as opposed to the profile's defaults. */
  moduleIds: string[]
  initiatedBy: string
  status: ScanStatus
  progress: number
  startedAt: string
  completedAt: string | null
  durationSeconds: number
  stages: ScanStage[]
  counters: ScanCounters
  logs: ScanLogEntry[]
  findingCount: number
}

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

export interface VulnerabilityType {
  id: string
  name: string
  slug: string
  cweId: string
  owaspId: string
  severity: Severity
  description: string
  remediation: string
}

export interface Evidence {
  request: string
  response: string
  observedAt: string
}

export interface Finding {
  id: string
  title: string
  vulnerabilityTypeId: string
  severity: Severity
  confidence: Confidence
  status: FindingStatus
  targetId: string
  projectId: string
  scanId: string
  endpoint: string
  httpMethod: HttpMethod
  parameter: string | null
  cweId: string
  owaspId: string
  description: string
  detectionReason: string
  impact: string
  remediation: string
  references: Reference[]
  evidence: Evidence
  firstDetected: string
  lastDetected: string
  occurrenceCount: number
  requiresManualVerification: boolean
  assignee: string | null
}

export interface Reference {
  id: string
  label: string
  url: string
  source: 'owasp' | 'cwe' | 'nvd' | 'other'
}

export interface VerificationTask {
  id: string
  findingId: string
  targetId: string
  projectId: string
  priority: 'high' | 'medium' | 'low'
  assignedTo: string | null
  dueDate: string | null
  createdAt: string
  scannerRationale: string
  observedBehaviour: string
  suggestedSteps: string[]
  decision: VerificationDecision | null
  decidedAt: string | null
  notes: string
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                    */
/* -------------------------------------------------------------------------- */

export interface OwaspCategory {
  id: string
  title: string
  year: number
  summary: string
}

export interface OwaspCoverageRow {
  owaspId: string
  testsAvailable: number
  testsExecuted: number
  findings: number
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

export interface Report {
  id: string
  name: string
  projectId: string
  targetId: string | null
  scanId: string | null
  format: ReportFormat
  status: ReportStatus
  generatedAt: string | null
  findingCount: number
  createdBy: string
  version: number
}

export interface ScanComparison {
  previousScanId: string
  currentScanId: string
  fixed: number
  newIssues: number
  stillOpen: number
  reopened: number
  timeline: ComparisonPoint[]
  bySeverity: ComparisonSeverityBucket[]
}

export interface ComparisonPoint {
  scanId: string
  label: string
  date: string
  critical: number
  high: number
  medium: number
  low: number
  informational: number
}

export interface ComparisonSeverityBucket {
  severity: Severity
  fixed: number
  newIssues: number
  stillOpen: number
  reopened: number
}

/* -------------------------------------------------------------------------- */
/* People, jobs, audit                                                         */
/* -------------------------------------------------------------------------- */

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  organizationId: string
  lastActiveAt: string
  status: 'active' | 'invited' | 'suspended'
  mfaEnabled: boolean
}

export interface Job {
  id: string
  kind: string
  queue: ScanQueue
  status: JobStatus
  scanId: string | null
  startedAt: string | null
  durationSeconds: number
  worker: string
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  actor: string
  action: string
  entity: string
  entityId: string
  ipAddress: string
  outcome: 'success' | 'failure'
}

/* -------------------------------------------------------------------------- */
/* Workspace settings, module deployment                                       */
/* -------------------------------------------------------------------------- */

export const WORKER_HOSTS = [
  'scanner-01',
  'scanner-02',
  'scanner-03',
  'analyst-01',
  'report-01',
] as const

/**
 * Job queues.
 *
 * These must stay in step with `JOB_KINDS` in `src/data/reports.ts`, which is
 * what actually seeds jobs. A queue missing from this list is silently dropped
 * from every queue breakdown and cannot be filtered on.
 */
export const SCAN_QUEUES = ['scans', 'analysis', 'reporting', 'notifications', 'maintenance'] as const

export type WorkerHost = (typeof WORKER_HOSTS)[number]
export type ScanQueue = (typeof SCAN_QUEUES)[number]

/**
 * Workspace-wide defaults an analyst inherits when starting a scan.
 *
 * These are deliberately *defaults*, not policy: a run may override any of
 * them, and the wizard always shows what it is about to use.
 */
export interface ScannerDefaults {
  profileId: ScanProfileId
  assessmentType: AssessmentType
  /** Auto-start a queued run as soon as a worker frees up. */
  autoStart: boolean
  /** Max simultaneous runs this workspace will hold in flight. */
  maxConcurrentScans: number
  /** Retest a fixed finding automatically when its target is rescanned. */
  autoRetestFixed: boolean
  /** Working hours gate for scheduled work, 0-23 in the workspace timezone. */
  scheduleStartHour: number
  scheduleEndHour: number
}

export interface NotificationPreferences {
  scanStarted: boolean
  scanCompleted: boolean
  scanFailed: boolean
  verificationAssigned: boolean
  reportReady: boolean
  /** Daily digest of queue depth and failed jobs. */
  dailyDigest: boolean
  /** Email address the preferences above are delivered to. */
  email: string
}

export interface SecurityPreferences {
  /** Require a second factor before any destructive or export action. */
  requireMfaForExports: boolean
  /** Idle sign-out in minutes; 0 disables automatic sign-out. */
  sessionTimeoutMinutes: number
  /** Sign-in notifications to the account owner. */
  notifyOnNewSignIn: boolean
  /** Block targets whose authorisation has not been confirmed. */
  requireAuthorisation: boolean
  /** Warn before a run whose rate limit exceeds the workspace ceiling. */
  warnOnRateLimitOverride: boolean
}

export interface WorkspaceSettings {
  organizationId: string
  name: string
  /** Short label shown in the sidebar and on report covers. */
  shortName: string
  timezone: string
  /** IANA zone used to render every timestamp in the UI. */
  defaultLocale: string
  scanner: ScannerDefaults
  notifications: NotificationPreferences
  security: SecurityPreferences
  updatedAt: string
  updatedBy: string
}

/**
 * Where a module is actually installed.
 *
 * Distinct from `ScannerModule.status`, which is an editorial judgement about
 * whether a detection should run at all. Deployment answers "which worker pools
 * carry this build", which is what an operator needs during a rollout.
 */
export interface ModuleDeployment {
  moduleId: string
  /** Worker hosts that have the module installed. */
  installedOn: WorkerHost[]
  /** Hosts pinned to a different build than the registry version. */
  driftedOn: WorkerHost[]
  /** True once every live worker reports the module loaded. */
  converged: boolean
  lastDeployAt: string
  deployedBy: string
}

/* -------------------------------------------------------------------------- */
/* Transport envelope — shaped to match DRF pagination                         */
/* -------------------------------------------------------------------------- */

export interface Paginated<T> {
  count: number
  results: T[]
  page: number
  pageSize: number
  totalPages: number
}

export interface ListParams {
  page?: number
  pageSize?: number
  search?: string
  sort?: string
  filters?: Record<string, string | string[] | undefined>
}
