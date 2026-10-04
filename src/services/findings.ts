import type {
  Confidence,
  Environment,
  Finding,
  FindingStatus,
  HttpMethod,
  ListParams,
  Paginated,
  ProjectStatus,
  ScanStatus,
  Severity,
  TargetType,
  VerificationTask,
  VulnerabilityType,
} from '@/types'
import { SEVERITIES } from '@/types'
import { paddedId, type Dataset } from '@/data'
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
import { isFindingOpen, SEVERITY_RANK } from '@/utils/severity'
import { nextAuditIndex } from '@/utils/ids'

/**
 * Findings register (`/findings`), detail (`/findings/{id}`) and triage writes.
 *
 * Status transitions are deliberately not a free-form dropdown: the three
 * decision-derived statuses are owned by the verification workflow so that a
 * finding can never claim to be "confirmed" while its verification task is
 * still sitting undecided in the queue.
 */

const DECISION_STATUSES: readonly FindingStatus[] = ['confirmed', 'false_positive', 'needs_retest']

/* -------------------------------------------------------------------------- */
/* Register                                                                    */
/* -------------------------------------------------------------------------- */

export interface FindingRow {
  id: string
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
  occurrenceCount: number
  assignee: string | null
  assigneeName: string | null
  firstDetected: string
  lastDetected: string
  requiresManualVerification: boolean
}

export interface FindingAggregates {
  total: number
  open: number
  confirmed: number
  falsePositive: number
  needsRetest: number
  fixed: number
  bySeverity: Record<Severity, number>
  /** Open findings still awaiting a manual verification decision. */
  awaitingVerification: number
  unassigned: number
  assignedToMe: number
  averageAgeDays: number
}

export interface FindingRegister extends Paginated<FindingRow> {
  aggregates: FindingAggregates
}

/** Shown before the first response so the tiles do not flash empty. */
export const EMPTY_FINDING_AGGREGATES: FindingAggregates = {
  total: 0,
  open: 0,
  confirmed: 0,
  falsePositive: 0,
  needsRetest: 0,
  fixed: 0,
  bySeverity: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
  awaitingVerification: 0,
  unassigned: 0,
  assignedToMe: 0,
  averageAgeDays: 0,
}

/**
 * `mutate` clones before handing out a draft, so the row a write returns has to
 * be re-read from the committed dataset rather than reused from a snapshot.
 */
function requireFinding(data: Dataset, findingId: string): Finding {
  const finding = data.findings.find((entry) => entry.id === findingId)
  if (!finding) throw notFound('Finding', findingId)
  return finding
}

function toRow(finding: Finding): FindingRow {
  const { indexes } = demoStore
  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    status: finding.status,
    endpoint: finding.endpoint,
    httpMethod: finding.httpMethod,
    parameter: finding.parameter,
    cweId: finding.cweId,
    owaspId: finding.owaspId,
    targetId: finding.targetId,
    targetName: indexes.targetById.get(finding.targetId)?.name ?? 'Unknown target',
    projectId: finding.projectId,
    projectName: indexes.projectById.get(finding.projectId)?.name ?? 'Unassigned',
    scanId: finding.scanId,
    occurrenceCount: finding.occurrenceCount,
    assignee: finding.assignee,
    assigneeName: finding.assignee ? (indexes.userById.get(finding.assignee)?.name ?? null) : null,
    firstDetected: finding.firstDetected,
    lastDetected: finding.lastDetected,
    requiresManualVerification: finding.requiresManualVerification,
  }
}

function applyFindingFilters(
  rows: FindingRow[],
  filters: Record<string, string[]>,
): FindingRow[] {
  const assignee = filters.assigned ?? []
  const openOnly = filters.open?.includes('true') === true

  return rows.filter((row) => {
    if (!filterIncludes(filters, 'severity', row.severity)) return false
    if (!filterIncludes(filters, 'status', row.status)) return false
    if (!filterIncludes(filters, 'confidence', row.confidence)) return false
    if (!filterIncludes(filters, 'project', row.projectId)) return false
    if (!filterIncludes(filters, 'target', row.targetId)) return false
    if (!filterIncludes(filters, 'owasp', row.owaspId)) return false
    if (assignee.includes('unassigned') && row.assignee !== null) return false
    if (assignee.includes('me') && row.assignee !== 'usr-001') return false
    if (openOnly && !isFindingOpen(row.status)) return false
    return true
  })
}

function sortValueFor(row: FindingRow, key: string): string | number | undefined {
  switch (key) {
    case 'title':
      return row.title
    case 'severity':
      return SEVERITY_RANK[row.severity]
    case 'status':
      return row.status
    case 'target':
      return row.targetName
    case 'project':
      return row.projectName
    case 'lastDetected':
      return row.lastDetected
    case 'occurrenceCount':
      return row.occurrenceCount
    default:
      return undefined
  }
}

function searchTextFor(row: FindingRow): string {
  return [
    row.title,
    row.endpoint,
    row.cweId,
    row.owaspId,
    row.targetName,
    row.projectName,
    row.parameter ?? '',
  ].join(' ')
}

function aggregateFindings(rows: FindingRow[]): FindingAggregates {
  const bySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<
    Severity,
    number
  >
  let totalAgeDays = 0

  for (const row of rows) {
    bySeverity[row.severity] += 1
    totalAgeDays += Math.max(0, Math.floor((Date.now() - new Date(row.firstDetected).getTime()) / 86_400_000))
  }

  return {
    total: rows.length,
    open: rows.filter((row) => isFindingOpen(row.status)).length,
    confirmed: rows.filter((row) => row.status === 'confirmed').length,
    falsePositive: rows.filter((row) => row.status === 'false_positive').length,
    needsRetest: rows.filter((row) => row.status === 'needs_retest').length,
    fixed: rows.filter((row) => row.status === 'fixed').length,
    bySeverity,
    awaitingVerification: rows.filter(
      (row) => row.requiresManualVerification && (row.status === 'potential' || row.status === 'open'),
    ).length,
    unassigned: rows.filter((row) => row.assignee === null).length,
    assignedToMe: rows.filter((row) => row.assignee === 'usr-001').length,
    averageAgeDays: rows.length === 0 ? 0 : Math.round(totalAgeDays / rows.length),
  }
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

export interface FindingOccurrence {
  id: string
  endpoint: string
  httpMethod: HttpMethod
  parameter: string | null
  occurrenceCount: number
  status: FindingStatus
  firstDetected: string
  lastDetected: string
}

export interface FindingActivity {
  id: string
  timestamp: string
  actor: string
  action: string
  outcome: 'success' | 'failure'
}

export interface FindingDetailData {
  finding: Finding
  row: FindingRow
  vulnerabilityType: VulnerabilityType | null
  target: {
    id: string
    name: string
    baseUrl: string
    environment: Environment
    type: TargetType
  } | null
  project: {
    id: string
    name: string
    client: string
    status: ProjectStatus
  } | null
  scan: {
    id: string
    status: ScanStatus
    profileName: string
    startedAt: string
    completedAt: string | null
  } | null
  task: VerificationTask | null
  /** Same vulnerability type on the same target, including this finding. */
  occurrences: FindingOccurrence[]
  activity: FindingActivity[]
  canAssign: boolean
  canChangeStatus: boolean
  /** Set when a pending verification task blocks the requested status change. */
  blockedBy: VerificationTask | null
}

/* -------------------------------------------------------------------------- */
/* Service                                                                     */
/* -------------------------------------------------------------------------- */

export const findingService = {
  /** Shared list used by the register, the verification queue and target pages. */
  async list(params: ListParams = {}): Promise<Paginated<FindingRow>> {
    const query = normalizeListParams(params)

    return request(() => {
      const data = demoStore.snapshot()
      const rows = data.findings.map(toRow)

      return paginate(applyFindingFilters(rows, query.filters), query, {
        searchText: searchTextFor,
        sortValue: sortValueFor,
      })
    })
  },

  async register(params: ListParams = {}): Promise<FindingRegister> {
    const query = normalizeListParams(params)

    return request(() => {
      const data = demoStore.snapshot()
      const rows = data.findings.map(toRow)
      const filtered = applyFindingFilters(rows, query.filters)

      return {
        ...paginate(filtered, query, {
          searchText: searchTextFor,
          sortValue: sortValueFor,
        }),
        aggregates: aggregateFindings(filtered),
      }
    })
  },

  async detail(findingId: string): Promise<FindingDetailData> {
    return request(() => {
      const data = demoStore.snapshot()
      const finding = data.findings.find((entry) => entry.id === findingId)
      if (!finding) throw notFound('Finding', findingId)

      const target = data.targets.find((entry) => entry.id === finding.targetId) ?? null
      const project = data.projects.find((entry) => entry.id === finding.projectId) ?? null
      const scan = data.scans.find((entry) => entry.id === finding.scanId) ?? null
      const vulnerabilityType =
        data.vulnerabilityTypes.find((entry) => entry.id === finding.vulnerabilityTypeId) ?? null
      const profile = data.scanProfiles.find((entry) => entry.id === scan?.profileId) ?? null
      const task = data.verificationTasks.find((entry) => entry.findingId === finding.id) ?? null

      const occurrences = data.findings
        .filter(
          (entry) =>
            entry.vulnerabilityTypeId === finding.vulnerabilityTypeId &&
            entry.targetId === finding.targetId,
        )
        .map((entry) => ({
          id: entry.id,
          endpoint: entry.endpoint,
          httpMethod: entry.httpMethod,
          parameter: entry.parameter,
          occurrenceCount: entry.occurrenceCount,
          status: entry.status,
          firstDetected: entry.firstDetected,
          lastDetected: entry.lastDetected,
        }))
        .sort(
          (a, b) => b.occurrenceCount - a.occurrenceCount || b.lastDetected.localeCompare(a.lastDetected),
        )

      const activity = data.auditLog
        .filter((entry) => entry.entity === 'finding' && entry.entityId === finding.id)
        .map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          actor: entry.actor,
          action: entry.action,
          outcome: entry.outcome,
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

      return {
        finding,
        row: toRow(finding),
        vulnerabilityType,
        target: target
          ? {
              id: target.id,
              name: target.name,
              baseUrl: target.baseUrl,
              environment: target.environment,
              type: target.type,
            }
          : null,
        project: project
          ? { id: project.id, name: project.name, client: project.client, status: project.status }
          : null,
        scan: scan
          ? {
              id: scan.id,
              status: scan.status,
              profileName: profile?.name ?? scan.profileId,
              startedAt: scan.startedAt,
              completedAt: scan.completedAt,
            }
          : null,
        task,
        occurrences,
        activity,
        canAssign: true,
        canChangeStatus: task === null || task.decision !== null,
        blockedBy: task !== null && task.decision === null ? task : null,
      }
    })
  },

  async assign(findingId: string, assignee: string | null, actor: string): Promise<FindingRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const finding = data.findings.find((entry) => entry.id === findingId)
      if (!finding) throw notFound('Finding', findingId)

      if (assignee !== null && !data.users.some((user) => user.id === assignee)) {
        throw new ApiError(400, `Unknown assignee "${assignee}".`)
      }

      const updated = demoStore.mutate((draft) => {
        const target = draft.findings.find((entry) => entry.id === findingId)
        if (!target) throw notFound('Finding', findingId)
        target.assignee = assignee

        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: new Date().toISOString(),
          actor,
          action: 'finding.assign',
          entity: 'finding',
          entityId: findingId,
          ipAddress: '198.51.100.24',
          outcome: 'success',
        })
      })

      return toRow(requireFinding(updated, findingId))
    })
  },

  /**
   * Manual status change for the statuses a reviewer owns directly
   * (open / fixed / reopened). Confirmed, false positive and needs-retest can
   * only be reached through a verification decision.
   */
  async setStatus(findingId: string, status: FindingStatus, actor: string): Promise<FindingRow> {
    if (DECISION_STATUSES.includes(status)) {
      throw new ApiError(
        409,
        `"${status}" is set by a verification decision, not directly. Resolve the verification task instead.`,
      )
    }

    return requestWrite(() => {
      const data = demoStore.snapshot()
      const finding = data.findings.find((entry) => entry.id === findingId)
      if (!finding) throw notFound('Finding', findingId)

      const task = data.verificationTasks.find((entry) => entry.findingId === finding.id) ?? null
      if (task && task.decision === null && finding.status === 'potential') {
        throw new ApiError(409, 'This finding still has an undecided verification task.')
      }

      const updated = demoStore.mutate((draft) => {
        const target = draft.findings.find((entry) => entry.id === findingId)
        if (!target) throw notFound('Finding', findingId)
        target.status = status

        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: new Date().toISOString(),
          actor,
          action: 'finding.status_change',
          entity: 'finding',
          entityId: findingId,
          ipAddress: '198.51.100.24',
          outcome: 'success',
        })
      })

      return toRow(requireFinding(updated, findingId))
    })
  },
}