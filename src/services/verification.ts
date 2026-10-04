import type {
  Confidence,
  Finding,
  FindingStatus,
  HttpMethod,
  ListParams,
  Paginated,
  Severity,
  VerificationDecision,
  VerificationTask,
} from '@/types'
import { VERIFICATION_DECISIONS } from '@/types'
import { paddedId } from '@/data'
import { demoStore } from './store'
import {
  ApiError,
  filterIncludes,
  notFound,
  normalizeListParams,
  paginate,
  request,
  requestWrite,
} from './transport'
import { SEVERITY_RANK } from '@/utils/severity'
import { nextAuditIndex } from '@/utils/ids'

/**
 * Manual verification queue (`/verification`) and the decision workflow.
 *
 * A task is the unit of human work: the scanner cannot tell a real SQLi from a
 * WAF banner, so anything with `requiresManualVerification` becomes a task with
 * a rationale and a suggested procedure. A decision is the only thing that may
 * move a finding to confirmed, false positive or needs-retest — see
 * `findingService.setStatus` for the other half of that rule.
 */

/** Decisions that must carry a written reason to be worth anything later. */
const REASON_REQUIRED: readonly VerificationDecision[] = ['false_positive', 'needs_retest']
const REASON_MIN_LENGTH = 8

export const DECISION_STATUS: Record<VerificationDecision, FindingStatus> = {
  confirmed: 'confirmed',
  false_positive: 'false_positive',
  needs_retest: 'needs_retest',
}

/* -------------------------------------------------------------------------- */
/* Queue                                                                       */
/* -------------------------------------------------------------------------- */

export interface VerificationRow {
  /** The task id — this is what `/verification/{id}` addresses. */
  id: string
  findingId: string
  priority: VerificationTask['priority']
  assignedTo: string | null
  assignedToName: string | null
  dueDate: string | null
  createdAt: string
  decision: VerificationDecision | null
  decidedAt: string | null
  notes: string
  title: string
  severity: Severity
  confidence: Confidence
  status: FindingStatus
  endpoint: string
  httpMethod: HttpMethod
  parameter: string | null
  cweId: string
  owaspId: string
  targetId: string
  targetName: string
  projectId: string
  projectName: string
  scanId: string
  /** Whole days since the task was raised. */
  ageDays: number
  overdue: boolean
}

export interface VerificationAggregates {
  total: number
  pending: number
  overdue: number
  mine: number
  unassigned: number
  highPriority: number
  confirmed: number
  falsePositive: number
  needsRetest: number
}

export interface VerificationQueue extends Paginated<VerificationRow> {
  aggregates: VerificationAggregates
}

function daysBetween(from: string | number, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000)
}

function toRow(task: VerificationTask, finding: Finding | undefined): VerificationRow | null {
  if (!finding) return null
  const { indexes } = demoStore

  return {
    id: task.id,
    findingId: task.findingId,
    priority: task.priority,
    assignedTo: task.assignedTo,
    assignedToName: task.assignedTo ? (indexes.userById.get(task.assignedTo)?.name ?? null) : null,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    decision: task.decision,
    decidedAt: task.decidedAt,
    notes: task.notes,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    status: finding.status,
    endpoint: finding.endpoint,
    httpMethod: finding.httpMethod,
    parameter: finding.parameter,
    cweId: finding.cweId,
    owaspId: finding.owaspId,
    targetId: task.targetId,
    targetName: indexes.targetById.get(task.targetId)?.name ?? 'Unknown target',
    projectId: task.projectId,
    projectName: indexes.projectById.get(task.projectId)?.name ?? 'Unassigned',
    scanId: finding.scanId,
    ageDays: daysBetween(task.createdAt),
    overdue: task.decision === null && task.dueDate !== null && new Date(task.dueDate).getTime() < Date.now(),
  }
}

function allRows(): VerificationRow[] {
  const data = demoStore.snapshot()
  return data.verificationTasks
    .map((task) => toRow(task, data.findings.find((entry) => entry.id === task.findingId)))
    .filter((row): row is VerificationRow => row !== null)
}

function applyQueueFilters(rows: VerificationRow[], filters: Record<string, string[]>): VerificationRow[] {
  const decisions = filters.decision ?? []
  const wantsPending = decisions.includes('pending')
  const wantsDecisions = decisions.filter((entry) => entry !== 'pending')

  const assignment = filters.assigned ?? []
  const wantsMe = assignment.includes('me')
  const wantsUnassigned = assignment.includes('unassigned')
  const wantsSpecific = assignment.filter((entry) => entry !== 'me' && entry !== 'unassigned')

  return rows.filter((row) => {
    if (decisions.length > 0) {
      const matches =
        row.decision === null
          ? wantsPending
          : row.decision !== null && wantsDecisions.includes(row.decision)
      if (!matches) return false
    }
    if (!filterIncludes(filters, 'priority', row.priority)) return false
    if (!filterIncludes(filters, 'severity', row.severity)) return false
    if (!filterIncludes(filters, 'project', row.projectId)) return false
    if (!filterIncludes(filters, 'target', row.targetId)) return false
    if (filters.overdue?.includes('true') === true && !row.overdue) return false
    if (assignment.length > 0) {
      const matches =
        (wantsMe && row.assignedTo === 'usr-001') ||
        (wantsUnassigned && row.assignedTo === null) ||
        (row.assignedTo !== null && wantsSpecific.includes(row.assignedTo))
      if (!matches) return false
    }
    return true
  })
}

const PRIORITY_RANK: Record<VerificationTask['priority'], number> = { high: 0, medium: 1, low: 2 }

function aggregateQueue(rows: VerificationRow[]): VerificationAggregates {
  return {
    total: rows.length,
    pending: rows.filter((row) => row.decision === null).length,
    overdue: rows.filter((row) => row.overdue).length,
    mine: rows.filter((row) => row.assignedTo === 'usr-001' && row.decision === null).length,
    unassigned: rows.filter((row) => row.assignedTo === null && row.decision === null).length,
    highPriority: rows.filter((row) => row.priority === 'high' && row.decision === null).length,
    confirmed: rows.filter((row) => row.decision === 'confirmed').length,
    falsePositive: rows.filter((row) => row.decision === 'false_positive').length,
    needsRetest: rows.filter((row) => row.decision === 'needs_retest').length,
  }
}

/** Shown before the first response so the tiles do not flash empty. */
export const EMPTY_VERIFICATION_AGGREGATES: VerificationAggregates = {
  total: 0,
  pending: 0,
  overdue: 0,
  mine: 0,
  unassigned: 0,
  highPriority: 0,
  confirmed: 0,
  falsePositive: 0,
  needsRetest: 0,
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

export interface VerificationDetailData {
  task: VerificationTask
  row: VerificationRow
  finding: Finding
  /** Copy of the finding's evidence so the reviewer does not need a second request. */
  evidence: Finding['evidence']
  activity: Array<{ id: string; timestamp: string; actor: string; action: string }>
  /** False once a decision exists; the queue then offers a reopen instead. */
  canDecide: boolean
  canReopen: boolean
}

/* -------------------------------------------------------------------------- */
/* Service                                                                     */
/* -------------------------------------------------------------------------- */

export const verificationService = {
  async queue(params: ListParams = {}): Promise<VerificationQueue> {
    const query = normalizeListParams(params)

    return request(() => {
      const filtered = applyQueueFilters(allRows(), query.filters)

      return {
        ...paginate(filtered, query, {
          searchText: (row) =>
            [row.title, row.endpoint, row.cweId, row.targetName, row.projectName].join(' '),
          sortValue: (row, key) => {
            switch (key) {
              case 'severity':
                return SEVERITY_RANK[row.severity]
              case 'priority':
                return PRIORITY_RANK[row.priority]
              case 'dueDate':
                return row.dueDate ?? '9999-12-31'
              case 'ageDays':
                return row.ageDays
              case 'target':
                return row.targetName
              default:
                return undefined
            }
          },
        }),
        aggregates: aggregateQueue(filtered),
      }
    })
  },

  async detail(taskId: string): Promise<VerificationDetailData> {
    return request(() => {
      const data = demoStore.snapshot()
      const task = data.verificationTasks.find((entry) => entry.id === taskId)
      if (!task) throw notFound('Verification task', taskId)

      const finding = data.findings.find((entry) => entry.id === task.findingId)
      if (!finding) {
        throw new ApiError(409, 'The finding behind this task no longer exists.')
      }

      const row = toRow(task, finding)
      if (!row) throw notFound('Verification task', taskId)

      const activity = data.auditLog
        .filter((entry) => entry.entityId === task.id || entry.entityId === finding.id)
        .map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          actor: entry.actor,
          action: entry.action,
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

      return {
        task,
        row,
        finding,
        evidence: finding.evidence,
        activity,
        canDecide: task.decision === null,
        canReopen: task.decision !== null,
      }
    })
  },

  /**
   * Records a decision and moves the finding with it.
   *
   * Both rows are written in one commit: a half-applied decision would leave
   * the register claiming a finding is confirmed while the queue still shows it
   * as pending, which is the exact state this stage exists to prevent.
   */
  async decide(
    taskId: string,
    input: { decision: VerificationDecision; notes: string; actor: string },
  ): Promise<{ task: VerificationTask; finding: Finding }> {
    const decision = input.decision
    const notes = input.notes.trim()

    if (!VERIFICATION_DECISIONS.includes(decision)) {
      throw new ApiError(400, `"${String(decision)}" is not a valid decision.`)
    }
    if (REASON_REQUIRED.includes(decision) && notes.length < REASON_MIN_LENGTH) {
      throw new ApiError(400, `A ${decision.replace('_', ' ')} needs a written reason.`, {
        notes: `Give at least ${REASON_MIN_LENGTH} characters of reasoning.`,
      })
    }

    return requestWrite(() => {
      const data = demoStore.snapshot()
      const task = data.verificationTasks.find((entry) => entry.id === taskId)
      if (!task) throw notFound('Verification task', taskId)
      if (task.decision !== null) {
        throw new ApiError(409, 'This task already has a decision. Reopen it to change your mind.')
      }

      const decidedAt = new Date().toISOString()
      const updated = demoStore.mutate((draft) => {
        const draftTask = draft.verificationTasks.find((entry) => entry.id === taskId)
        if (!draftTask) throw notFound('Verification task', taskId)
        draftTask.decision = decision
        draftTask.decidedAt = decidedAt
        draftTask.notes = notes

        const draftFinding = draft.findings.find((entry) => entry.id === draftTask.findingId)
        if (!draftFinding) throw notFound('Finding', draftTask.findingId)
        draftFinding.status = DECISION_STATUS[decision]

        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: decidedAt,
          actor: input.actor,
          action: 'verification.decide',
          entity: 'verification_task',
          entityId: taskId,
          ipAddress: '198.51.100.24',
          outcome: 'success',
        })
      })

      const savedTask = updated.verificationTasks.find((entry) => entry.id === taskId)
      const savedFinding = updated.findings.find((entry) => entry.id === task.findingId)
      if (!savedTask || !savedFinding) throw notFound('Verification task', taskId)

      return { task: savedTask, finding: savedFinding }
    })
  },

  /** Undoes a decision and returns the finding to the queue. */
  async reopen(taskId: string, actor: string): Promise<{ task: VerificationTask; finding: Finding }> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const task = data.verificationTasks.find((entry) => entry.id === taskId)
      if (!task) throw notFound('Verification task', taskId)
      if (task.decision === null) {
        throw new ApiError(409, 'This task is still open, so there is nothing to reopen.')
      }

      const updated = demoStore.mutate((draft) => {
        const draftTask = draft.verificationTasks.find((entry) => entry.id === taskId)
        if (!draftTask) throw notFound('Verification task', taskId)
        draftTask.decision = null
        draftTask.decidedAt = null

        const draftFinding = draft.findings.find((entry) => entry.id === draftTask.findingId)
        if (!draftFinding) throw notFound('Finding', draftTask.findingId)
        draftFinding.status = 'potential'

        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: new Date().toISOString(),
          actor,
          action: 'verification.reopen',
          entity: 'verification_task',
          entityId: taskId,
          ipAddress: '198.51.100.24',
          outcome: 'success',
        })
      })

      const savedTask = updated.verificationTasks.find((entry) => entry.id === taskId)
      const savedFinding = updated.findings.find((entry) => entry.id === task.findingId)
      if (!savedTask || !savedFinding) throw notFound('Verification task', taskId)

      return { task: savedTask, finding: savedFinding }
    })
  },
}