import type {
  Finding,
  ListParams,
  Paginated,
  Project,
  Report,
  ReportFormat,
  ReportStatus,
  Scan,
  Severity,
  Target,
} from '@/types'
import { REPORT_FORMATS, SEVERITIES } from '@/types'
import type { Dataset } from '@/data'
import {
  MATERIAL_NEWER_SCAN_GAP_DAYS,
  OWASP_CATEGORIES,
  paddedId,
  REPORTABLE_FINDING_STATUSES,
} from '@/data'
import {
  isFindingOpen,
  riskScoreFrom,
  SEVERITY_RANK,
  severityCountsOf,
  severitySlices,
  type SeveritySlice,
} from '@/utils/severity'
import { nextAuditIndex, nextIndexFor } from '@/utils/ids'

import { profileFor } from './scans'
import { demoStore } from './store'
import {
  ApiError,
  applySearch,
  filterIncludes,
  notFound,
  normalizeListParams,
  paginate,
  request,
  requestWrite,
  type ListSelectors,
} from './transport'

/**
 * Reports service: the deliverables register (`/reports`) and the preview read
 * model behind `/reports/{id}`.
 *
 * There is no renderer in the demo, so "generating" a report means composing
 * its sections from the live dataset rather than uploading an artefact. That is
 * the honest version of the feature: every number in the preview is recomputed
 * from the store on each read, which is exactly what a client challenges you on
 * when they dispute a count.
 *
 * Two things are derived rather than stored. `outdated` is recomputed from the
 * scans that landed since the report was produced, so it repairs itself once the
 * newer scan is the one the report was regenerated from. And a report is only
 * downloadable while `ready`, which is what stops a client receiving the failed
 * or still-rendering file the register is otherwise advertising.
 */

/* -------------------------------------------------------------------------- */
/* Derived state                                                               */
/* -------------------------------------------------------------------------- */

/** Completed scans of the same target that finished materially after `report`. */
function newerScansFor(report: Report, scans: readonly Scan[]): Scan[] {
  if (report.generatedAt === null || report.targetId === null) return []
  const generated = new Date(report.generatedAt).getTime()
  return scans
    .filter(
      (scan) =>
        scan.targetId === report.targetId &&
        scan.status === 'completed' &&
        (new Date(scan.completedAt ?? scan.startedAt).getTime() - generated) / 86_400_000 >
          MATERIAL_NEWER_SCAN_GAP_DAYS,
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/**
 * The report's effective status, which is not always its stored one.
 *
 * A `ready` report whose target has been rescanned since reads as `outdated`
 * even though nothing wrote to the row. A `failed` report stays failed whatever
 * else has happened, because nothing later can make a broken render work.
 */
export function reportState(report: Report, scans: readonly Scan[]): ReportStatus {
  if (report.status === 'ready' && newerScansFor(report, scans).length > 0) return 'outdated'
  return report.status
}

/** Why a report is no longer current, phrased for whoever has to act on it. */
function outdatedReason(report: Report, scans: readonly Scan[], targetName: string): string {
  const newer = newerScansFor(report, scans)[0]
  if (!newer) return `${targetName} has been rescanned since this report was generated.`
  return `Scan ${newer.id} of ${targetName} completed after this report was generated.`
}

/* -------------------------------------------------------------------------- */
/* Register                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReportRow {
  report: Report
  state: ReportStatus
  projectName: string
  client: string
  /** The single target's name, or how many targets a project-wide report covers. */
  scopeLabel: string
  authorName: string
  /** Newest completed scan of the report's target, if any. */
  latestScanAt: string | null
  downloadable: boolean
}

export interface ReportAggregates {
  total: number
  ready: number
  outdated: number
  generating: number
  failed: number
  /** Findings quoted across the reports currently in view. */
  findingsCovered: number
  /** Reports that have been regenerated at least once. */
  regenerated: number
}

export interface GenerateOption {
  id: string
  label: string
  projectId: string
  targetId: string
  targetName: string
  completedAt: string | null
  findingCount: number
}

export interface ReportRegister extends Paginated<ReportRow> {
  aggregates: ReportAggregates
  projects: Array<{ id: string; name: string }>
  formats: readonly ReportFormat[]
  /** Completed scans the generate form may target. */
  generateOptions: GenerateOption[]
}

/** Shown before the first response so the tiles do not flash empty. */
export const EMPTY_REPORT_AGGREGATES: ReportAggregates = {
  total: 0,
  ready: 0,
  outdated: 0,
  generating: 0,
  failed: 0,
  findingsCovered: 0,
  regenerated: 0,
}

const SELECTORS: ListSelectors<ReportRow> = {
  searchText: (row) => `${row.report.name} ${row.projectName} ${row.client} ${row.scopeLabel}`,
  sortValue: (row, key) => {
    if (key === 'name') return row.report.name
    if (key === 'project') return row.projectName
    if (key === 'format') return row.report.format
    if (key === 'state') return row.state
    if (key === 'findings') return row.report.findingCount
    if (key === 'version') return row.report.version
    // Ungenerated reports have no timestamp; sorting them as empty keeps them
    // at the end of a `-generatedAt` list instead of pretending they are old.
    if (key === 'generatedAt') return row.report.generatedAt ?? ''
    return undefined
  },
}

function scopeLabelFor(report: Report, target: Target | undefined, targetCount: number): string {
  if (report.targetId === null) return targetCount === 1 ? '1 target' : `${targetCount} targets`
  return target?.name ?? 'Unknown target'
}

function toRow(report: Report): ReportRow {
  const data = demoStore.snapshot()
  const project = demoStore.indexes.projectById.get(report.projectId)
  const target = report.targetId ? demoStore.indexes.targetById.get(report.targetId) : undefined
  const targetCount = data.targets.filter((entry) => entry.projectId === report.projectId).length
  const state = reportState(report, data.scans)

  const latest = report.targetId
    ? data.scans
        .filter((scan) => scan.targetId === report.targetId && scan.status === 'completed')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    : undefined

  return {
    report,
    state,
    projectName: project?.name ?? 'Unassigned',
    client: project?.client ?? 'Unknown client',
    scopeLabel: scopeLabelFor(report, target, targetCount),
    authorName: demoStore.indexes.userById.get(report.createdBy)?.name ?? 'Unknown analyst',
    latestScanAt: latest?.completedAt ?? latest?.startedAt ?? null,
    downloadable: state === 'ready',
  }
}

export const reportService = {
/** Register page plus the totals behind its stat tiles. */
  async register(params: ListParams = {}): Promise<ReportRegister> {
    return request(() => {
      const query = normalizeListParams(params)
      const data = demoStore.snapshot()

      const rows = data.reports
        // Status filtering happens on the derived state, not the stored one, so
        // "outdated" catches reports that went stale without a write.
        .filter((report) => filterIncludes(query.filters, 'status', reportState(report, data.scans)))
        .filter((report) => filterIncludes(query.filters, 'format', report.format))
        .filter((report) => filterIncludes(query.filters, 'project', report.projectId))
        .map(toRow)

      const searched = applySearch(rows, query, SELECTORS)
      const countBy = (state: ReportStatus) => searched.filter((row) => row.state === state).length

      return {
        ...paginate(rows, query, SELECTORS),
        aggregates: {
          total: searched.length,
          ready: countBy('ready'),
          outdated: countBy('outdated'),
          generating: countBy('generating'),
          failed: countBy('failed'),
          findingsCovered: searched.reduce((total, row) => total + row.report.findingCount, 0),
          regenerated: searched.filter((row) => row.report.version > 1).length,
        },
        projects: data.projects.map((project) => ({ id: project.id, name: project.name })),
        formats: REPORT_FORMATS,
        generateOptions: data.scans
          .filter((scan) => scan.status === 'completed')
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .slice(0, 40)
          .map((scan) => {
            const targetName = demoStore.indexes.targetById.get(scan.targetId)?.name ?? 'Unknown target'
            return {
              id: scan.id,
              label: `${scan.id} · ${targetName}`,
              projectId: scan.projectId,
              targetId: scan.targetId,
              targetName,
              completedAt: scan.completedAt,
              findingCount: (demoStore.indexes.findingsByScan.get(scan.id) ?? []).length,
            }
          }),
      }
    })
  },

  /** Everything the preview needs, recomputed from the live dataset. */
  async detail(reportId: string): Promise<ReportDetailData> {
    return request(() => buildReportDetail(reportId))
  },

  /**
   * Produces, or re-produces, a report.
   *
   * Regenerating the same scan and format bumps that report's version instead of
   * adding a second row: someone who asked for the report again wants the newer
   * version of the same document, not another document to choose between.
   */
  async generate(input: GenerateReportInput, actor: string): Promise<ReportRow> {
    return requestWrite(() => {
      const fields: Record<string, string> = {}
      if (input.name.trim().length < 4) {
        fields.name = 'Give the report a recognisable name of at least 4 characters.'
      }
      if (!REPORT_FORMATS.includes(input.format)) {
        fields.format = 'Unsupported report format.'
      }
      if (Object.keys(fields).length > 0) {
        throw new ApiError(400, 'The report could not be generated.', fields)
      }

      const data = demoStore.snapshot()
      const scan = data.scans.find((entry) => entry.id === input.scanId)
      if (!scan) throw notFound('Scan', input.scanId)
      if (scan.status !== 'completed') {
        throw new ApiError(409, `Scan ${scan.id} is ${scan.status}; only a completed scan can be reported on.`)
      }
      if (input.targetId !== undefined && input.targetId !== null && input.targetId !== scan.targetId) {
        throw new ApiError(400, 'A report can only cover the target its scan ran against.')
      }

const existing = data.reports.find(
        (report) => report.scanId === scan.id && report.format === input.format,
      )
      const name = input.name.trim()

      // Captured inside the mutation because only the draft knows the id it
      // minted for a new row; the pre-mutation snapshot cannot.
      let reportId = existing?.id ?? ''

      const updated = demoStore.mutate((draft) => {
        const current = existing ? draft.reports.find((entry) => entry.id === existing.id) : undefined
        reportId = current?.id ?? paddedId('rpt', nextIndexFor('rpt', draft.reports.map((row) => row.id)), 3)

        const findingCount = reportableCount(draft, current?.targetId ?? scan.targetId)

        if (current) {
          current.name = name
          current.version += 1
          current.status = 'ready'
          current.generatedAt = new Date().toISOString()
          current.findingCount = findingCount
        } else {
          draft.reports.unshift({
            id: reportId,
            name,
            projectId: scan.projectId,
            targetId: scan.targetId,
            scanId: scan.id,
            format: input.format,
            status: 'ready',
            generatedAt: new Date().toISOString(),
            findingCount,
            createdBy: actor,
            version: 1,
          })
        }

        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: new Date().toISOString(),
          actor,
          action: 'report.generate',
          entity: 'report',
          entityId: reportId,
          ipAddress: '198.51.100.24',
          outcome: 'success',
        })
      })

      return toRow(requireReport(updated, reportId))
    })
  },

  /** Records a download. Rejects anything that is not currently deliverable. */
  async download(reportId: string, actor: string): Promise<{ format: ReportFormat; version: number }> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const report = data.reports.find((entry) => entry.id === reportId)
      if (!report) throw notFound('Report', reportId)

      const state = reportState(report, data.scans)
      if (state !== 'ready') {
        throw new ApiError(
          409,
          state === 'generating'
            ? 'This report is still being generated.'
            : state === 'failed'
              ? 'This report failed to generate and cannot be downloaded.'
              : 'This report is out of date. Regenerate it before sharing it.',
        )
      }

      demoStore.mutate((draft) => {
        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: new Date().toISOString(),
          actor,
          action: 'report.download',
          entity: 'report',
          entityId: reportId,
          ipAddress: '198.51.100.24',
          outcome: 'success',
        })
      })

      return { format: report.format, version: report.version }
    })
  },
}


/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReportSection {
  /** `F-01`, `F-02`, ... in the order the client will read them. */
  reference: string
  findingId: string
  title: string
  severity: Severity
  status: Finding['status']
  confidence: Finding['confidence']
  cweId: string
  owaspId: string
  owaspTitle: string
  endpoint: string
  httpMethod: string
  parameter: string | null
  description: string
  impact: string
  remediation: string
  references: Finding['references']
  occurrences: number
  firstDetected: string
  lastDetected: string
}

export interface ReportSeverityGroup {
  severity: Severity
  count: number
  findings: ReportSection[]
}

export interface ReportMethodology {
  profileName: string
  profileIntensity: string
  moduleIds: string[]
  moduleNames: string[]
  testCount: number
  authorisationConfirmed: boolean
  scanWindow: { startedAt: string; completedAt: string | null; durationSeconds: number } | null
  scopeLines: string[]
}

export interface ReportSummary {
  riskScore: number
  severity: SeveritySlice[]
  totalFindings: number
  openCount: number
  confirmedCount: number
  outstandingRetestCount: number
  criticalOrHigh: number
  distinctVulnerabilityTypes: number
  owaspCategoriesHit: number
  firstDetected: string | null
  lastDetected: string | null
  endpointsTested: number
  requestsTested: number
  testsCompleted: number
}

export interface ReportDetailData {
  report: Report
  state: ReportStatus
  downloadable: boolean
  /** Why a report is not current, phrased for whoever has to act on it. */
  outdatedReason: string | null
  project: Project | null
  client: string
  targets: Array<{ id: string; name: string; baseUrl: string; environment: string }>
  scan: Scan | null
  authorName: string
  scopeLabel: string
  summary: ReportSummary
  groups: ReportSeverityGroup[]
  methodology: ReportMethodology
  activity: Array<{
    id: string
    timestamp: string
    actor: string
    action: string
    outcome: string
  }>
}

export function buildReportDetail(reportId: string): ReportDetailData {
  const data = demoStore.snapshot()
  const { indexes } = demoStore

  const report = indexes.reportById.get(reportId)
  if (!report) throw notFound('Report', reportId)

  const project = indexes.projectById.get(report.projectId) ?? null
  const scan = report.scanId ? indexes.scanById.get(report.scanId) ?? null : null

  // A report with no scan pinned to it covers the project as it stood when it
  // was generated, which here means every reportable finding across its targets
  // rather than one run's output.
  const targets: Target[] = report.targetId
    ? [indexes.targetById.get(report.targetId)].filter((entry): entry is Target => entry !== undefined)
    : data.targets.filter((entry) => entry.projectId === report.projectId)

  const targetIds = new Set(targets.map((target) => target.id))
  const inScope = data.findings.filter(
    (finding) => targetIds.has(finding.targetId) && REPORTABLE_FINDING_STATUSES.includes(finding.status),
  )

  const counts = severityCountsOf(inScope)

  // Client-facing order: severity first, then location, so the numbering in the
  // preview matches the order someone reads the document in.
  const ordered = [...inScope].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.endpoint.localeCompare(b.endpoint) ||
      a.title.localeCompare(b.title),
  )

  const sections: ReportSection[] = ordered.map((finding, index) => ({
    reference: `F-${String(index + 1).padStart(2, '0')}`,
    findingId: finding.id,
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    confidence: finding.confidence,
    cweId: finding.cweId,
    owaspId: finding.owaspId,
    owaspTitle: OWASP_CATEGORIES[finding.owaspId]?.title ?? finding.owaspId,
    endpoint: finding.endpoint,
    httpMethod: finding.httpMethod,
    parameter: finding.parameter,
    description: finding.description,
    impact: finding.impact,
    remediation: finding.remediation,
    references: finding.references,
    occurrences: finding.occurrenceCount,
    firstDetected: finding.firstDetected,
    lastDetected: finding.lastDetected,
  }))

  const groups: ReportSeverityGroup[] = SEVERITIES.map((severity) => ({
    severity,
    count: counts[severity],
    findings: sections.filter((section) => section.severity === severity),
  })).filter((group) => group.count > 0)

  const profile = scan ? profileFor(scan) : undefined
  const modules = scan ? data.modules.filter((module) => scan.moduleIds.includes(module.id)) : []
  const detectionDates = inScope.map((finding) => finding.firstDetected).sort()

  const state = reportState(report, data.scans)

  return {
    report,
    state,
    downloadable: state === 'ready',
    outdatedReason:
      state === 'outdated'
        ? outdatedReason(report, data.scans, targets[0]?.name ?? 'The target')
        : null,
    project,
    client: project?.client ?? 'Unknown client',
    targets: targets.map((target) => ({
      id: target.id,
      name: target.name,
      baseUrl: target.baseUrl,
      environment: target.environment,
    })),
    scan,
    authorName: indexes.userById.get(report.createdBy)?.name ?? 'Unknown analyst',
    scopeLabel: scopeLabelFor(report, targets[0], targets.length),
    summary: {
      riskScore: riskScoreFrom(counts),
      severity: severitySlices(counts),
      totalFindings: inScope.length,
      openCount: inScope.filter((finding) => isFindingOpen(finding.status)).length,
      confirmedCount: inScope.filter((finding) => finding.status === 'confirmed').length,
      outstandingRetestCount: inScope.filter((finding) => finding.status === 'needs_retest').length,
      criticalOrHigh: counts.critical + counts.high,
      distinctVulnerabilityTypes: new Set(inScope.map((finding) => finding.vulnerabilityTypeId)).size,
      owaspCategoriesHit: new Set(inScope.map((finding) => finding.owaspId)).size,
      firstDetected: detectionDates[0] ?? null,
      lastDetected: inScope.map((finding) => finding.lastDetected).sort().at(-1) ?? null,
      endpointsTested: scan?.counters.endpointsDiscovered ?? 0,
      requestsTested: scan?.counters.requestsTested ?? 0,
      testsCompleted: scan?.counters.testsCompleted ?? 0,
    },
    groups,
    methodology: {
      profileName: profile?.name ?? scan?.profileId ?? 'Not recorded',
      profileIntensity: profile?.intensity ?? 'unknown',
      moduleIds: scan?.moduleIds ?? [],
      moduleNames: modules.map((module) => module.name),
      testCount: modules.reduce((total, module) => total + module.testCount, 0),
      authorisationConfirmed: targets.every((target) => target.scope.authorizationConfirmed),
      scanWindow: scan
        ? { startedAt: scan.startedAt, completedAt: scan.completedAt, durationSeconds: scan.durationSeconds }
        : null,
      scopeLines: targets.map((target) => `${target.name} — ${target.baseUrl}`),
    },
    activity: data.auditLog
      .filter((entry) => entry.entity === 'report' && entry.entityId === report.id)
      .map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        actor: indexes.userById.get(entry.actor)?.name ?? entry.actor,
        action: entry.action,
        outcome: entry.outcome,
      }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How many findings a report for `targetId` would quote.
 *
 * The seed applies the same rule when it writes the register, so a generated
 * report and a seeded one cannot disagree about their own finding count.
 */
function reportableCount(draft: Dataset, targetId: string): number {
  return draft.findings.filter(
    (finding) => finding.targetId === targetId && REPORTABLE_FINDING_STATUSES.includes(finding.status),
  ).length
}

function requireReport(data: Dataset, reportId: string): Report {
  const report = data.reports.find((entry) => entry.id === reportId)
  if (!report) throw notFound('Report', reportId)
  return report
}

export interface GenerateReportInput {
  name: string
  scanId: string
  format: ReportFormat
  /** Narrow to one target even when the scan's project holds several. */
  targetId?: string | null
}