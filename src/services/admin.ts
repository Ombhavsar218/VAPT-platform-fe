import type {
  AuditLogEntry,
  Job,
  JobStatus,
  ListParams,
  ModuleDeployment,
  ModuleStatus,
  Paginated,
  Scan,
  ScanStatus,
  ScannerModule,
  User,
  UserRole,
  WorkerHost,
} from '@/types'
import { JOB_STATUSES, SCAN_QUEUES, USER_ROLES, WORKER_HOSTS } from '@/types'

import { nextAuditIndex } from '@/utils/ids'

import { findingsForModule } from './coverage'
import { demoStore } from './store'
import {
  ApiError,
  filterIncludes,
  notFound,
  normalizeListParams,
  paginate,
  request,
  requestWrite,
  type ListSelectors,
} from './transport'

/**
 * Administration: workspace health, members, the module registry, the job queue
 * and the audit trail.
 *
 * Everything here is read-mostly governance. The mutations that do exist —
 * changing a role, suspending an account, moving a job between workers, changing
 * a module's status — are exactly the actions an assessor has to be able to
 * explain afterwards, so every one of them writes an audit entry and refuses to
 * act twice.
 */

const AUDIT_ACTOR_IP = '10.4.0.12'

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

export interface AdminOverview {
  users: {
    total: number
    active: number
    invited: number
    suspended: number
    mfaEnabled: number
    /** Members with MFA off, which is the number worth surfacing. */
    mfaGaps: number
    byRole: Record<UserRole, number>
  }
  scans: {
    total: number
    running: number
    queued: number
    completed: number
    failed: number
  }
  jobs: {
    total: number
    queued: number
    running: number
    failed: number
    cancelled: number
    succeeded: number
    /** Jobs that have waited longer than a minute without starting. */
    stale: number
    byQueue: Record<string, number>
  }
  modules: {
    total: number
    byStatus: Record<ModuleStatus, number>
    /** Modules whose worker fleet has not converged on one build. */
    drifted: number
    notInstalled: number
  }
  activity: AuditRow[]
  /** Non-empty warnings, worst first. Rendered as an operator's to-do list. */
  attention: { id: string; label: string; detail: string; severity: 'critical' | 'warning' | 'info' }[]
}

function countBy<T extends string>(rows: readonly { value: T }[], keys: readonly T[]): Record<T, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>
  for (const row of rows) counts[row.value] += 1
  return counts
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

export interface UserRow extends User {
  /** Findings currently assigned to this member. */
  openAssignments: number
  /** Verification tasks awaiting their decision. */
  pendingVerifications: number
  /** Reports they generated. */
  reportsGenerated: number
}

export interface UserAggregates {
  total: number
  active: number
  invited: number
  suspended: number
  mfaEnabled: number
  byRole: Record<UserRole, number>
}

export const EMPTY_USER_AGGREGATES: UserAggregates = {
  total: 0,
  active: 0,
  invited: 0,
  suspended: 0,
  mfaEnabled: 0,
  byRole: { admin: 0, lead_analyst: 0, analyst: 0, viewer: 0 },
}

function toUserRow(data: ReturnType<typeof demoStore.snapshot>, user: User): UserRow {
  return {
    ...user,
    openAssignments: data.findings.filter(
      (finding) => finding.assignee === user.id && finding.status === 'open',
    ).length,
    pendingVerifications: data.verificationTasks.filter(
      (task) => task.assignedTo === user.id && task.decision === null,
    ).length,
    reportsGenerated: data.reports.filter((report) => report.createdBy === user.id).length,
  }
}

const USER_SELECTORS: ListSelectors<UserRow> = {
  searchText: (row) => `${row.name} ${row.email} ${row.role}`,
  sortValue: (row, key) => {
    switch (key) {
      case 'name':
        return row.name.toLowerCase()
      case 'email':
        return row.email.toLowerCase()
      case 'role':
        return row.role
      case 'status':
        return row.status
      case 'lastActiveAt':
        return row.lastActiveAt
      default:
        return undefined
    }
  },
}

/* -------------------------------------------------------------------------- */
/* Jobs                                                                        */
/* -------------------------------------------------------------------------- */

export interface JobRow extends Job {
  scanStatus: ScanStatus | null
  targetName: string | null
  projectName: string | null
  /** Seconds spent waiting in the queue; 0 once started. */
  queueSeconds: number
}

export interface JobAggregates {
  total: number
  byStatus: Record<JobStatus, number>
  byQueue: Record<string, number>
  /** Mean duration of finished jobs, or null when nothing has finished. */
  averageDurationSeconds: number | null
  failedLast24h: number
}

export const EMPTY_JOB_AGGREGATES: JobAggregates = {
  total: 0,
  byStatus: { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 },
  byQueue: {},
  averageDurationSeconds: null,
  failedLast24h: 0,
}

function toJobRow(data: ReturnType<typeof demoStore.snapshot>, job: Job): JobRow {
  const scan: Scan | undefined =
    job.scanId === null ? undefined : data.scans.find((entry) => entry.id === job.scanId)
  const target = scan ? data.targets.find((entry) => entry.id === scan.targetId) : undefined
  const project = scan ? data.projects.find((entry) => entry.id === scan.projectId) : undefined

  return {
    ...job,
    scanStatus: scan?.status ?? null,
    targetName: target?.name ?? null,
    projectName: project?.name ?? null,
    queueSeconds: job.startedAt === null ? STALE_QUEUE_SECONDS : 0,
  }
}

/** A queued job that has not started after this long is worth flagging. */
const STALE_QUEUE_SECONDS = 60

const JOB_SELECTORS: ListSelectors<JobRow> = {
  searchText: (row) => `${row.id} ${row.kind} ${row.queue} ${row.worker} ${row.targetName ?? ''}`,
  sortValue: (row, key) => {
    switch (key) {
      case 'id':
        return row.id
      case 'kind':
        return row.kind.toLowerCase()
      case 'queue':
        return row.queue
      case 'status':
        return row.status
      case 'worker':
        return row.worker
      case 'startedAt':
        return row.startedAt ?? ''
      case 'durationSeconds':
        return row.durationSeconds
      default:
        return undefined
    }
  },
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export interface AuditRow extends AuditLogEntry {
  actorName: string
  actorRole: UserRole | null
  /** Human sentence describing the action, e.g. "changed the role of …". */
  summary: string
  entityName: string
}

export interface AuditAggregates {
  total: number
  byOutcome: { success: number; failure: number }
  byAction: { action: string; count: number }[]
  distinctActors: number
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'auth.login_failed': 'failed sign-in',
  'scan.initiate': 'started a scan',
  'scan.cancel': 'cancelled a scan',
  'scan.complete': 'completed a scan',
  'finding.status_change': 'changed a finding status',
  'finding.assign': 'assigned a finding',
  'verification.decide': 'recorded a verification decision',
  'report.generate': 'generated a report',
  'report.download': 'downloaded a report',
  'module.status_change': 'changed a module status',
  'user.role_change': 'changed a member role',
  'user.status_change': 'changed a member status',
  'user.mfa_change': 'changed MFA enrolment',
  'user.invite': 'invited a member',
  'settings.update': 'updated workspace settings',
  'job.cancel': 'cancelled a job',
  'job.retry': 'retried a job',
  'job.assign': 'reassigned a job',
  'module.deploy': 'deployed a module',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ')
}

const AUDIT_SELECTORS: ListSelectors<AuditRow> = {
  searchText: (row) => `${row.actorName} ${row.action} ${row.entity} ${row.entityId} ${row.ipAddress}`,
  sortValue: (row, key) => {
    switch (key) {
      case 'timestamp':
        return row.timestamp
      case 'actor':
        return row.actorName.toLowerCase()
      case 'action':
        return row.action
      case 'entity':
        return row.entity
      case 'outcome':
        return row.outcome
      default:
        return undefined
    }
  },
}

/* -------------------------------------------------------------------------- */
/* Module registry (admin view)                                                */
/* -------------------------------------------------------------------------- */

export interface RegistryRow {
  id: string
  name: string
  slug: string
  category: string
  status: ModuleStatus
  version: string
  testCount: number
  updatedAt: string
  installedOn: WorkerHost[]
  driftedOn: WorkerHost[]
  /** Hosts in the fleet with no install of this module. */
  missingOn: WorkerHost[]
  converged: boolean
  lastDeployAt: string
  deployedBy: string
  findings: number
}

export interface RegistryAggregates {
  total: number
  converged: number
  drifted: number
  missingEverywhere: number
  byStatus: Record<ModuleStatus, number>
  hosts: WorkerHost[]
}

export const EMPTY_REGISTRY_AGGREGATES: RegistryAggregates = {
  total: 0,
  converged: 0,
  drifted: 0,
  missingEverywhere: 0,
  byStatus: { enabled: 0, disabled: 0, experimental: 0 },
  hosts: [...WORKER_HOSTS],
}

function scannerHosts(): WorkerHost[] {
  return WORKER_HOSTS.filter((host) => host !== 'report-01')
}

function toRegistryRow(
  data: ReturnType<typeof demoStore.snapshot>,
  module: ScannerModule,
  deployment: ModuleDeployment | undefined,
): RegistryRow {
  const fleet = scannerHosts()
  const installedOn = deployment?.installedOn ?? []
  const driftedOn = deployment?.driftedOn ?? []
  const covered = new Set([...installedOn, ...driftedOn])

  return {
    id: module.id,
    name: module.name,
    slug: module.slug,
    category: module.category,
    status: module.status,
    version: module.version,
    testCount: module.testCount,
    updatedAt: module.updatedAt,
    installedOn,
    driftedOn,
    missingOn: fleet.filter((host) => !covered.has(host)),
    converged: deployment?.converged ?? false,
    lastDeployAt: deployment?.lastDeployAt ?? module.updatedAt,
    deployedBy: deployment?.deployedBy ?? 'usr-001',
    findings: findingsForModule(data, module).length,
  }
}

/* -------------------------------------------------------------------------- */
/* Service                                                                     */
/* -------------------------------------------------------------------------- */

function audit(actor: string, action: string, entity: string, entityId: string, outcome: 'success' | 'failure' = 'success') {
  return {
    id: `aud-${String(nextAuditIndex(demoStore.snapshot().auditLog)).padStart(5, '0')}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    entity,
    entityId,
    ipAddress: AUDIT_ACTOR_IP,
    outcome,
  }
}

export const adminService = {
  /* ------------------------------------------------------------- overview */

  async overview(): Promise<AdminOverview> {
    return request(() => {
      const data = demoStore.snapshot()

      const users = {
        ...countBy(data.users.map((user) => ({ value: user.status })), ['active', 'invited', 'suspended'] as const),
        total: data.users.length,
        mfaEnabled: data.users.filter((user) => user.mfaEnabled).length,
        mfaGaps: data.users.filter((user) => user.status === 'active' && !user.mfaEnabled).length,
        byRole: countBy(data.users.map((user) => ({ value: user.role })), USER_ROLES),
      }

      const scans = {
        ...countBy(
          data.scans.map((scan) => ({ value: scan.status })),
          ['queued', 'running', 'completed', 'failed'] as const,
        ),
        total: data.scans.length,
      }

      const jobs = {
        ...countBy(data.jobs.map((job) => ({ value: job.status })), JOB_STATUSES),
        total: data.jobs.length,
        stale: data.jobs.filter((job) => job.status === 'queued').length,
        byQueue: Object.fromEntries(
          SCAN_QUEUES.map((queue) => [
            queue,
            data.jobs.filter((job) => job.queue === queue).length,
          ]),
        ),
      }

      const drifted = data.moduleDeployments.filter((entry) => !entry.converged).length
      const missingEverywhere = data.modules.filter(
        (module) => !data.moduleDeployments.some((entry) => entry.moduleId === module.id),
      ).length

      const modules = {
        total: data.modules.length,
        byStatus: countBy(data.modules.map((module) => ({ value: module.status })), [
          'enabled',
          'disabled',
          'experimental',
        ] as const),
        drifted,
        notInstalled: missingEverywhere,
      }

      // Worst first: an account without MFA outranks a cosmetic drift warning.
      const attention: AdminOverview['attention'] = []
      if (users.mfaGaps > 0) {
        attention.push({
          id: 'mfa',
          label: 'Active accounts without MFA',
          detail: `${users.mfaGaps} active ${users.mfaGaps === 1 ? 'member has' : 'members have'} not enrolled a second factor.`,
          severity: 'warning',
        })
      }
      if (jobs.failed > 0) {
        attention.push({
          id: 'jobs-failed',
          label: 'Failed jobs on the queue',
          detail: `${jobs.failed} ${jobs.failed === 1 ? 'job has' : 'jobs have'} failed and may need a retry.`,
          severity: 'critical',
        })
      }
      if (modules.drifted > 0) {
        attention.push({
          id: 'modules-drift',
          label: 'Module builds out of sync',
          detail: `${modules.drifted} ${modules.drifted === 1 ? 'module is' : 'modules are'} not converged across the worker fleet.`,
          severity: 'warning',
        })
      }
      if (users.suspended > 0) {
        attention.push({
          id: 'users-suspended',
          label: 'Suspended accounts',
          detail: `${users.suspended} suspended ${users.suspended === 1 ? 'account' : 'accounts'} can still hold findings.`,
          severity: 'info',
        })
      }

      return {
        users,
        scans,
        jobs,
        modules,
        activity: data.auditLog
          .slice()
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 8)
          .map((entry) => toAuditRow(data, entry)),
        attention,
      }
    })
  },

  /* ---------------------------------------------------------------- users */

  async listUsers(params: ListParams = {}): Promise<Paginated<UserRow> & { aggregates: UserAggregates }> {
    const query = normalizeListParams(params)

    return request(() => {
      const data = demoStore.snapshot()
      const rows = data.users.map((user) => toUserRow(data, user))

      const aggregates: UserAggregates = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        invited: rows.filter((row) => row.status === 'invited').length,
        suspended: rows.filter((row) => row.status === 'suspended').length,
        mfaEnabled: rows.filter((row) => row.mfaEnabled).length,
        byRole: countBy(rows.map((row) => ({ value: row.role })), USER_ROLES),
      }

      const filtered = rows.filter((row) => {
        if (!filterIncludes(query.filters, 'role', row.role)) return false
        if (!filterIncludes(query.filters, 'status', row.status)) return false
        const mfa = query.filters['mfa']
        if (mfa && mfa.length > 0) {
          const key = mfa.includes('enabled') ? row.mfaEnabled : !row.mfaEnabled
          if (!key) return false
        }
        return true
      })

      return { ...paginate(filtered, query, USER_SELECTORS), aggregates }
    })
  },

  async userDetail(userId: string): Promise<{
    user: UserRow
    recentAudit: AuditRow[]
    roles: readonly UserRole[]
  }> {
    return request(() => {
      const data = demoStore.snapshot()
      const user = data.users.find((entry) => entry.id === userId)
      if (!user) throw notFound('User', userId)

      const recentAudit = data.auditLog
        .filter((entry) => entry.actor === userId)
        .slice()
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 20)
        .map((entry) => toAuditRow(data, entry))

      return { user: toUserRow(data, user), recentAudit, roles: USER_ROLES }
    })
  },

  /**
   * Change a member's role.
   *
   * Two invariants worth the code: the last active admin cannot be demoted out
   * of the workspace (an unrecoverable state), and a change to the same role is
   * a 409 rather than a silent no-op that would pollute the audit trail.
   */
  async setUserRole(userId: string, role: UserRole, actor: string): Promise<UserRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const user = data.users.find((entry) => entry.id === userId)
      if (!user) throw notFound('User', userId)
      if (!USER_ROLES.includes(role)) {
        throw new ApiError(400, `Unknown role "${role}".`, { role: 'Unknown role.' })
      }
      if (user.role === role) throw new ApiError(409, `${user.name} is already ${role}.`)

      if (user.role === 'admin' && role !== 'admin') {
        const otherAdmins = data.users.filter(
          (entry) => entry.role === 'admin' && entry.status === 'active' && entry.id !== userId,
        )
        if (otherAdmins.length === 0) {
          throw new ApiError(409, 'The last active admin cannot be demoted.', {
            role: 'Promote another admin first.',
          })
        }
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.users.find((entry) => entry.id === userId)
        if (target) target.role = role
        draft.auditLog.push(audit(actor, 'user.role_change', 'user', userId))
      })

      const updated = snapshot.users.find((entry) => entry.id === userId)
      if (!updated) throw notFound('User', userId)
      return toUserRow(snapshot, updated)
    })
  },

  /** Suspend or reactivate an account. Self-suspension is refused. */
  async setUserStatus(
    userId: string,
    status: User['status'],
    actor: string,
  ): Promise<UserRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const user = data.users.find((entry) => entry.id === userId)
      if (!user) throw notFound('User', userId)
      if (!['active', 'invited', 'suspended'].includes(status)) {
        throw new ApiError(400, `Unknown status "${status}".`, { status: 'Unknown status.' })
      }
      if (user.status === status) throw new ApiError(409, `${user.name} is already ${status}.`)
      if (userId === actor) {
        throw new ApiError(409, 'You cannot change your own account status.', {
          status: 'Ask another admin.',
        })
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.users.find((entry) => entry.id === userId)
        if (target) target.status = status
        draft.auditLog.push(audit(actor, 'user.status_change', 'user', userId))
      })

      const updated = snapshot.users.find((entry) => entry.id === userId)
      if (!updated) throw notFound('User', userId)
      return toUserRow(snapshot, updated)
    })
  },

  /**
   * Toggle MFA enrolment.
   *
   * Removing a second factor is treated as a security-relevant action and always
   * audited, because "who could export a report" is a question this log has to
   * answer.
   */
  async setUserMfa(userId: string, enabled: boolean, actor: string): Promise<UserRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const user = data.users.find((entry) => entry.id === userId)
      if (!user) throw notFound('User', userId)
      if (user.mfaEnabled === enabled) {
        throw new ApiError(409, `${user.name} already has MFA ${enabled ? 'enabled' : 'disabled'}.`)
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.users.find((entry) => entry.id === userId)
        if (target) target.mfaEnabled = enabled
        draft.auditLog.push(audit(actor, 'user.mfa_change', 'user', userId))
      })

      const updated = snapshot.users.find((entry) => entry.id === userId)
      if (!updated) throw notFound('User', userId)
      return toUserRow(snapshot, updated)
    })
  },

  /** Invite a member. Email is the identity, so it has to be unique. */
  async inviteUser(input: { name: string; email: string; role: UserRole }, actor: string): Promise<UserRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const email = input.email.trim().toLowerCase()
      const name = input.name.trim()

      const fields: Record<string, string> = {}
      if (name.length < 2) fields.name = 'Enter the member’s name.'
      if (!email.includes('@')) fields.email = 'Enter a valid email address.'
      if (!input.role || !USER_ROLES.includes(input.role)) fields.role = 'Choose a role.'
      if (Object.keys(fields).length > 0) {
        throw new ApiError(400, 'The invitation could not be validated.', fields)
      }
      if (data.users.some((user) => user.email.toLowerCase() === email)) {
        throw new ApiError(409, 'A member with that email already exists.', {
          email: 'That email is already in use.',
        })
      }

      const snapshot = demoStore.mutate((draft) => {
        const index = draft.users.reduce((max, user) => {
          const parsed = Number(user.id.replace('usr-', ''))
          return Number.isFinite(parsed) && parsed > max ? parsed : max
        }, 0) + 1
        const id = `usr-${String(index).padStart(3, '0')}`

        draft.users.push({
          id,
          name,
          email,
          role: input.role,
          organizationId: draft.workspaceSettings.organizationId,
          lastActiveAt: new Date().toISOString(),
          status: 'invited',
          mfaEnabled: false,
        })
        draft.auditLog.push(audit(actor, 'user.invite', 'user', id))
      })

      const created = snapshot.users.find((entry) => entry.email.toLowerCase() === email)
      if (!created) throw new ApiError(500, 'The invitation could not be created.')
      return toUserRow(snapshot, created)
    })
  },

  /* ----------------------------------------------------------------- jobs */

  async listJobs(params: ListParams = {}): Promise<Paginated<JobRow> & { aggregates: JobAggregates }> {
    const query = normalizeListParams(params)

    return request(() => {
      const data = demoStore.snapshot()
      const rows = data.jobs.map((job) => toJobRow(data, job))

      const finished = rows.filter((row) => row.status === 'succeeded')
      const averages = finished.length
        ? Math.round(finished.reduce((sum, row) => sum + row.durationSeconds, 0) / finished.length)
        : null

      const aggregates: JobAggregates = {
        total: rows.length,
        byStatus: countBy(rows.map((row) => ({ value: row.status })), JOB_STATUSES),
        byQueue: countBy(rows.map((row) => ({ value: row.queue })), SCAN_QUEUES),
        averageDurationSeconds: averages,
        failedLast24h: rows.filter(
          (row) =>
            row.status === 'failed' &&
            row.startedAt !== null &&
            Date.now() - new Date(row.startedAt).getTime() < 24 * 3_600_000,
        ).length,
      }

      const filtered = rows.filter((row) => {
        if (!filterIncludes(query.filters, 'status', row.status)) return false
        if (!filterIncludes(query.filters, 'queue', row.queue)) return false
        if (!filterIncludes(query.filters, 'worker', row.worker)) return false
        return true
      })

      return { ...paginate(filtered, query, JOB_SELECTORS), aggregates }
    })
  },

  /**
   * Cancel a job.
   *
   * A job that has already finished cannot be cancelled: the outcome is on the
   * record and pretending otherwise would let an operator "cancel" a failure
   * that already happened, hiding it from the queue.
   */
  async cancelJob(jobId: string, actor: string): Promise<JobRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const job = data.jobs.find((entry) => entry.id === jobId)
      if (!job) throw notFound('Job', jobId)
      if (job.status === 'cancelled') throw new ApiError(409, 'That job is already cancelled.')
      if (job.status === 'succeeded' || job.status === 'failed') {
        throw new ApiError(409, 'That job has already finished and cannot be cancelled.')
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.jobs.find((entry) => entry.id === jobId)
        if (target) {
          target.status = 'cancelled'
          target.startedAt = target.startedAt ?? new Date().toISOString()
        }
        draft.auditLog.push(audit(actor, 'job.cancel', 'job', jobId))
      })

      const updated = snapshot.jobs.find((entry) => entry.id === jobId)
      if (!updated) throw notFound('Job', jobId)
      return toJobRow(snapshot, updated)
    })
  },

  /** Requeue a failed or cancelled job onto a worker. */
  async retryJob(jobId: string, worker: WorkerHost, actor: string): Promise<JobRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const job = data.jobs.find((entry) => entry.id === jobId)
      if (!job) throw notFound('Job', jobId)
      if (job.status !== 'failed' && job.status !== 'cancelled') {
        throw new ApiError(409, 'Only a failed or cancelled job can be retried.')
      }
      if (!WORKER_HOSTS.includes(worker)) {
        throw new ApiError(400, `Unknown worker "${worker}".`, { worker: 'Unknown worker.' })
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.jobs.find((entry) => entry.id === jobId)
        if (target) {
          target.status = 'queued'
          target.startedAt = null
          target.durationSeconds = 0
          target.worker = worker
        }
        draft.auditLog.push(audit(actor, 'job.retry', 'job', jobId))
      })

      const updated = snapshot.jobs.find((entry) => entry.id === jobId)
      if (!updated) throw notFound('Job', jobId)
      return toJobRow(snapshot, updated)
    })
  },

  /** Move a queued or running job to a different worker. */
  async assignJob(jobId: string, worker: WorkerHost, actor: string): Promise<JobRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const job = data.jobs.find((entry) => entry.id === jobId)
      if (!job) throw notFound('Job', jobId)
      if (job.worker === worker) throw new ApiError(409, `Already assigned to ${worker}.`)
      if (job.status === 'succeeded' || job.status === 'failed') {
        throw new ApiError(409, 'A finished job cannot be reassigned.')
      }
      if (!WORKER_HOSTS.includes(worker)) {
        throw new ApiError(400, `Unknown worker "${worker}".`, { worker: 'Unknown worker.' })
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.jobs.find((entry) => entry.id === jobId)
        if (target) target.worker = worker
        draft.auditLog.push(audit(actor, 'job.assign', 'job', jobId))
      })

      const updated = snapshot.jobs.find((entry) => entry.id === jobId)
      if (!updated) throw notFound('Job', jobId)
      return toJobRow(snapshot, updated)
    })
  },

  /* ---------------------------------------------------------------- audit */

  async listAudit(params: ListParams = {}): Promise<Paginated<AuditRow> & { aggregates: AuditAggregates }> {
    const query = normalizeListParams(params)

    return request(() => {
      const data = demoStore.snapshot()
      const rows = data.auditLog.map((entry) => toAuditRow(data, entry))

      const byAction = new Map<string, number>()
      for (const row of rows) byAction.set(row.action, (byAction.get(row.action) ?? 0) + 1)

      const aggregates: AuditAggregates = {
        total: rows.length,
        byOutcome: {
          success: rows.filter((row) => row.outcome === 'success').length,
          failure: rows.filter((row) => row.outcome === 'failure').length,
        },
        byAction: [...byAction.entries()]
          .map(([action, count]) => ({ action, count }))
          .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action)),
        distinctActors: new Set(rows.map((row) => row.actor)).size,
      }

      const filtered = rows.filter((row) => {
        if (!filterIncludes(query.filters, 'outcome', row.outcome)) return false
        if (!filterIncludes(query.filters, 'action', row.action)) return false
        if (!filterIncludes(query.filters, 'entity', row.entity)) return false
        const actor = query.filters['actor']
        if (actor && actor.length > 0 && !actor.includes(row.actor)) return false
        const since = query.filters['since']
        if (since && since.length > 0) {
          const cutoff = Date.parse(since[0] ?? '')
          if (Number.isFinite(cutoff) && Date.parse(row.timestamp) < cutoff) return false
        }
        return true
      })

      return { ...paginate(filtered, query, AUDIT_SELECTORS), aggregates }
    })
  },

  async auditOptions(): Promise<{
    actions: string[]
    entities: string[]
    actors: { id: string; name: string }[]
  }> {
    return request(() => {
      const data = demoStore.snapshot()
      const userById = new Map(data.users.map((user) => [user.id, user]))
      const actors = [...new Set(data.auditLog.map((entry) => entry.actor))]
        .map((id) => ({ id, name: userById.get(id)?.name ?? 'Unknown actor' }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return {
        actions: [...new Set(data.auditLog.map((entry) => entry.action))].sort(),
        entities: [...new Set(data.auditLog.map((entry) => entry.entity))].sort(),
        actors,
      }
    })
  },

  /* ------------------------------------------------------- module registry */

  async registry(): Promise<{ modules: RegistryRow[]; aggregates: RegistryAggregates }> {
    return request(() => {
      const data = demoStore.snapshot()
      const deploymentByModule = new Map(
        data.moduleDeployments.map((entry) => [entry.moduleId, entry]),
      )
      const modules = data.modules.map((module) =>
        toRegistryRow(data, module, deploymentByModule.get(module.id)),
      )

      const aggregates: RegistryAggregates = {
        total: modules.length,
        converged: modules.filter((row) => row.converged).length,
        drifted: modules.filter((row) => !row.converged && row.installedOn.length + row.driftedOn.length > 0)
          .length,
        missingEverywhere: modules.filter(
          (row) => row.installedOn.length + row.driftedOn.length === 0,
        ).length,
        byStatus: countBy(modules.map((row) => ({ value: row.status })), [
          'enabled',
          'disabled',
          'experimental',
        ] as const),
        hosts: [...WORKER_HOSTS],
      }

      return { modules, aggregates }
    })
  },

  /**
   * Deploy a module to every scanner host, converging the fleet on one build.
   */
  async deployModule(moduleId: string, actor: string): Promise<RegistryRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const module = data.modules.find((entry) => entry.id === moduleId)
      if (!module) throw notFound('Module', moduleId)

      const existing = data.moduleDeployments.find((entry) => entry.moduleId === moduleId)
      if (existing?.converged) {
        throw new ApiError(409, `${module.name} is already converged across the fleet.`)
      }

      const snapshot = demoStore.mutate((draft) => {
        const index = draft.moduleDeployments.findIndex((entry) => entry.moduleId === moduleId)
        const next: ModuleDeployment = {
          moduleId,
          installedOn: scannerHosts(),
          driftedOn: [],
          converged: true,
          lastDeployAt: new Date().toISOString(),
          deployedBy: actor,
        }
        if (index === -1) draft.moduleDeployments.push(next)
        else draft.moduleDeployments[index] = next
        draft.auditLog.push(audit(actor, 'module.deploy', 'module', moduleId))
      })

      const updated = snapshot.modules.find((entry) => entry.id === moduleId)
      if (!updated) throw notFound('Module', moduleId)
      return toRegistryRow(
        snapshot,
        updated,
        snapshot.moduleDeployments.find((entry) => entry.moduleId === moduleId),
      )
    })
  },
}

function toAuditRow(data: ReturnType<typeof demoStore.snapshot>, entry: AuditLogEntry): AuditRow {
  const actor = data.users.find((user) => user.id === entry.actor)
  return {
    ...entry,
    actorName: actor?.name ?? 'Unknown actor',
    actorRole: actor?.role ?? null,
    summary: `${actor?.name ?? entry.actor} ${auditActionLabel(entry.action)} ${entry.entity} ${entry.entityId}`,
    entityName: entry.entityId,
  }
}
