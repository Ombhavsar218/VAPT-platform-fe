import type {
  Confidence,
  Finding,
  FindingStatus,
  ListParams,
  Paginated,
  Scan,
  ScanProfile,
  ScanProfileId,
  ScanStatus,
  ScannerModule,
  Severity,
  Target,
} from '@/types'
import { paddedId, SCAN_STAGE_DEFINITIONS } from '@/data'
import {
  emptySeverityCounts,
  isFindingOpen,
  isScanInFlight,
  severitySlices,
  SEVERITY_RANK,
  type SeveritySlice,
} from '@/utils/severity'

import { isScanTerminal, moduleRuns, simulatedTotalSeconds, SIMULATION_SPEED, type ModuleRun } from './scanSimulation'
import { demoStore } from './store'
import { nextAuditIndex, nextIndexFor } from '@/utils/ids'
import {
  ApiError,
  applySearch,
  filterIncludes,
  notFound,
  normalizeListParams,
  paginate,
  request,
  requestWrite,
  type NormalizedList,
} from './transport'

/**
 * Scans service: the register, a single run's live view, and the three writes
 * that change a run's fate — start, cancel and re-run.
 *
 * Reads never have to start a scan, because `demoStore.snapshot()` advances
 * anything in flight before this file sees it. What a read *does* have to do is
 * add the read model on top: names, severity slices, remaining time.
 */

export interface ScanRow extends Scan {
  targetName: string
  targetBaseUrl: string
  targetEnvironment: string
  projectName: string
  profileName: string
  profileIntensity: ScanProfile['intensity']
  initiatedByName: string
  /** Simulated seconds since the run started, or its final duration. */
  elapsedSeconds: number
  /** Simulated run length implied by the profile. */
  estimatedSeconds: number
  estimatedRemainingSeconds: number
  findingCount: number
  openFindingCount: number
  severityCounts: Record<Severity, number>
  hasFindings: boolean
}

export interface ScanAggregates {
  total: number
  inFlight: number
  queued: number
  completed: number
  failed: number
  cancelled: number
  /** Completed runs as a percentage of runs that reached a terminal state. */
  successRate: number
  findings: number
  requestsTested: number
  averageDurationSeconds: number
  lastRunAt: string | null
}

export interface ScanRegister extends Paginated<ScanRow> {
  aggregates: ScanAggregates
}

/** Input the wizard hands over on submit. */
export interface StartScanInput {
  projectId: string
  targetId: string
  profileId: ScanProfileId
  moduleIds: string[]
  initiatedBy: string
}

/** Profile behind a run. Shared with the report preview's methodology section. */
export function profileFor(scan: Scan): ScanProfile | undefined {
  return demoStore.snapshot().scanProfiles.find((profile) => profile.id === scan.profileId)
}

/** Severity distribution of the findings a run produced. */
function severityCountsFor(scanId: string): Record<Severity, number> {
  const counts = emptySeverityCounts()
  for (const finding of demoStore.indexes.findingsByScan.get(scanId) ?? []) {
    counts[finding.severity] += 1
  }
  return counts
}

export function summariseScan(scan: Scan): ScanRow {
  const { indexes } = demoStore
  const target = indexes.targetById.get(scan.targetId)
  const project = indexes.projectById.get(scan.projectId)
  const profile = profileFor(scan)
  const user = indexes.userById.get(scan.initiatedBy)

  const findings = indexes.findingsByScan.get(scan.id) ?? []
  const openFindings = findings.filter((finding) => isFindingOpen(finding.status))
  const severityCounts = severityCountsFor(scan.id)

  const estimatedSeconds = profile
    ? simulatedTotalSeconds(profile, scan.id)
    : Math.max(60, scan.durationSeconds)

  return {
    ...scan,
    targetName: target?.name ?? 'Unknown target',
    targetBaseUrl: target?.baseUrl ?? '',
    targetEnvironment: target?.environment ?? 'lab',
    projectName: project?.name ?? 'Unassigned',
    profileName: profile?.name ?? scan.profileId,
    profileIntensity: profile?.intensity ?? 'balanced',
    initiatedByName: user?.name ?? 'Unknown analyst',
    elapsedSeconds: scan.durationSeconds,
    estimatedSeconds,
    estimatedRemainingSeconds: isScanTerminal(scan.status)
      ? 0
      : Math.max(0, estimatedSeconds - scan.durationSeconds),
    findingCount: findings.length,
    openFindingCount: openFindings.length,
    severityCounts,
    hasFindings: findings.length > 0,
  }
}

function searchText(row: ScanRow): string {
  return [row.id, row.targetName, row.targetBaseUrl, row.projectName, row.profileName, row.initiatedByName].join(' ')
}

/**
 * Rows matching the filters and the search text.
 *
 * The stat tiles and the table have to describe the same set, so the search is
 * applied here once rather than inside `paginate`, where the tiles cannot see it.
 */
function selectMatchingRows(query: NormalizedList): ScanRow[] {
  const inFlightOnly = query.filters.inFlight?.includes('true') === true
  const windowDays = Number.parseInt(query.filters.window?.[0] ?? '', 10)

  const filtered = demoStore.snapshot().scans.map(summariseScan).filter((row) => {
    if (!filterIncludes(query.filters, 'status', row.status)) return false
    if (!filterIncludes(query.filters, 'project', row.projectId)) return false
    if (!filterIncludes(query.filters, 'target', row.targetId)) return false
    if (!filterIncludes(query.filters, 'profile', row.profileId)) return false
    if (inFlightOnly && !isScanInFlight(row.status)) return false
    if (Number.isFinite(windowDays) && windowDays > 0) {
      const ageDays = (Date.now() - new Date(row.startedAt).getTime()) / 86_400_000
      if (ageDays > windowDays) return false
    }
    return true
  })

  return applySearch(filtered, query, { searchText, sortValue: () => undefined })
}

function summariseAggregates(rows: ScanRow[]): ScanAggregates {
  const terminal = rows.filter((row) => isScanTerminal(row.status))
  const completed = rows.filter((row) => row.status === 'completed')
  const durations = completed.map((row) => row.durationSeconds).filter((value) => value > 0)

  return {
    total: rows.length,
    inFlight: rows.filter((row) => isScanInFlight(row.status)).length,
    queued: rows.filter((row) => row.status === 'queued').length,
    completed: completed.length,
    failed: rows.filter((row) => row.status === 'failed').length,
    cancelled: rows.filter((row) => row.status === 'cancelled').length,
    successRate: terminal.length === 0 ? 0 : Math.round((completed.length / terminal.length) * 100),
    findings: rows.reduce((sum, row) => sum + row.findingCount, 0),
    requestsTested: rows.reduce((sum, row) => sum + row.counters.requestsTested, 0),
    averageDurationSeconds:
      durations.length === 0
        ? 0
        : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    lastRunAt: rows.reduce<string | null>(
      (latest, row) => (latest === null || row.startedAt > latest ? row.startedAt : latest),
      null,
    ),
  }
}

const EMPTY_AGGREGATES: ScanAggregates = {
  total: 0,
  inFlight: 0,
  queued: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  successRate: 0,
  findings: 0,
  requestsTested: 0,
  averageDurationSeconds: 0,
  lastRunAt: null,
}

export { EMPTY_AGGREGATES as EMPTY_SCAN_AGGREGATES }

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

export interface ScanFindingRow {
  id: string
  title: string
  severity: Severity
  confidence: Confidence
  status: FindingStatus
  endpoint: string
  httpMethod: string
  parameter: string | null
  cweId: string
  owaspId: string
  occurrenceCount: number
  requiresManualVerification: boolean
  detectedAt: string
}

export interface ScanDetailData {
  scan: Scan
  row: ScanRow
  target: {
    id: string
    name: string
    baseUrl: string
    type: Target['type']
    environment: Target['environment']
    tags: string[]
    authorised: boolean
    authorisationNote: string
  }
  project: { id: string; name: string; client: string; status: string }
  profile: ScanProfile
  moduleRuns: ModuleRun[]
  findings: ScanFindingRow[]
  severity: SeveritySlice[]
  endpointCount: number
  technologyCount: number
  /** The run to compare against: the target's previous completed scan. */
  comparisonScanId: string | null
  previousScanId: string | null
  nextScanId: string | null
  canCancel: boolean
  canRerun: boolean
}

function toFindingRow(finding: Finding): ScanFindingRow {
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
    occurrenceCount: finding.occurrenceCount,
    requiresManualVerification: finding.requiresManualVerification,
    detectedAt: finding.lastDetected,
  }
}

/* -------------------------------------------------------------------------- */
/* Estimation                                                                  */
/* -------------------------------------------------------------------------- */

export interface ScanEstimate {
  /** Simulated run length. */
  estimatedSeconds: number
  /** The same run at the speed it will actually be shown at. */
  realSeconds: number
  testCount: number
  requestCount: number
  moduleCount: number
  endpointCount: number
  /** Things an analyst should know before committing the run. */
  notes: string[]
}

const REQUESTS_PER_ENDPOINT: Record<ScanProfile['intensity'], number> = {
  low: 42,
  balanced: 96,
  thorough: 190,
}

/**
 * What a run is going to cost before it is started.
 *
 * Deliberately a plain function rather than a service call: the wizard re-runs
 * it every time a module is toggled, and a 300 ms round trip per checkbox would
 * make the review step feel broken. The arithmetic is identical to what
 * `start()` will do, because both read the same profile.
 */
export function estimateScan(options: {
  profile: ScanProfile
  target: Target
  modules: readonly ScannerModule[]
  moduleIds: readonly string[]
  endpointCount: number
  technologyCount: number
}): ScanEstimate {
  const { profile, target, modules, moduleIds, endpointCount, technologyCount } = options
  const selected = modules.filter((module) => moduleIds.includes(module.id))
  const testCount = selected.reduce((sum, module) => sum + module.testCount, 0)
  const estimatedSeconds = Math.round(profile.estimatedMinutes * 60)
  const requestCount = Math.round(endpointCount * REQUESTS_PER_ENDPOINT[profile.intensity])

  const notes: string[] = []
  if (endpointCount === 0) {
    notes.push('No endpoints are recorded for this target yet; the crawler will have to discover its own surface.')
  }
  if (target.scope.excludedPaths.length > 2) {
    notes.push(`${target.scope.excludedPaths.length} excluded path rules will be skipped at every request.`)
  }
  if (technologyCount === 0) {
    notes.push('No technology fingerprint is on file, so version-specific checks cannot be narrowed.')
  }
  if (selected.some((module) => module.status === 'experimental')) {
    notes.push('At least one selected module is experimental and may produce unverified results.')
  }
  if (target.environment === 'production') {
    notes.push('Production target: keep the request rate conservative to avoid degrading live service.')
  }

  return {
    estimatedSeconds,
    realSeconds: Math.max(1, Math.round(estimatedSeconds / SIMULATION_SPEED)),
    testCount,
    requestCount,
    moduleCount: selected.length,
    endpointCount,
    notes,
  }
}

/* -------------------------------------------------------------------------- */
/* Service                                                                     */
/* -------------------------------------------------------------------------- */

export const scanService = {
  /**
   * The register page plus the totals behind its stat tiles.
   *
   * The tiles want totals for the whole filtered set, so they are computed here
   * and returned with the page rather than issued as a second request that could
   * race the rows it is supposed to describe.
   */
  async register(params: ListParams = {}): Promise<ScanRegister> {
    const query = normalizeListParams(params)

    return request(() => {
      const matching = selectMatchingRows(query)

      const page = paginate(matching, query, {
        searchText,
        sortValue: (row, key) => {
          switch (key) {
            case 'id':
              return row.id
            case 'target':
              return row.targetName
            case 'project':
              return row.projectName
            case 'profile':
              return row.profileName
            case 'status':
              return row.status
            case 'progress':
              return row.progress
            case 'startedAt':
              return row.startedAt
            case 'durationSeconds':
              return row.durationSeconds
            case 'findingCount':
              return row.findingCount
            case 'openFindingCount':
              return row.openFindingCount
            default:
              return undefined
          }
        },
      })

      return { ...page, aggregates: summariseAggregates(matching) }
    })
  },

  async list(params: ListParams = {}): Promise<Paginated<ScanRow>> {
    const { aggregates: _aggregates, ...page } = await this.register(params)
    return page
  },

  async detail(scanId: string): Promise<ScanDetailData> {
    return request(() => {
      const scan = demoStore.indexes.scanById.get(scanId)
      if (!scan) throw notFound('Scan', scanId)

      const target = demoStore.indexes.targetById.get(scan.targetId)
      if (!target) throw notFound('Target', scan.targetId)
      const project = demoStore.indexes.projectById.get(scan.projectId)
      const profile = profileFor(scan)
      if (!profile) throw notFound('Scan profile', scan.profileId)

      const data = demoStore.snapshot()
      const findings = (demoStore.indexes.findingsByScan.get(scanId) ?? [])
        .slice()
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

      // Sibling runs in the same target's history, for the previous/next links.
      const siblings = (demoStore.indexes.scansByTarget.get(scan.targetId) ?? [])
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
      const position = siblings.findIndex((entry) => entry.id === scanId)

      const comparison =
        siblings
          .filter((entry) => entry.id !== scanId && entry.status === 'completed')
          .sort((a, b) => b.sequence - a.sequence)[0] ?? null

      return {
        scan,
        row: summariseScan(scan),
        target: {
          id: target.id,
          name: target.name,
          baseUrl: target.baseUrl,
          type: target.type,
          environment: target.environment,
          tags: target.tags,
          authorised: target.scope.authorizationConfirmed,
          authorisationNote: target.scope.authorizationNote,
        },
        project: {
          id: scan.projectId,
          name: project?.name ?? 'Unassigned',
          client: project?.client ?? 'Internal',
          status: project?.status ?? 'planning',
        },
        profile,
        moduleRuns: moduleRuns(scan.moduleIds, data.modules, scan.progress, scan.status),
        findings: findings.map(toFindingRow),
        severity: severitySlices(severityCountsFor(scanId)),
        endpointCount: (demoStore.indexes.endpointsByTarget.get(target.id) ?? []).length,
        technologyCount: (demoStore.indexes.technologiesByTarget.get(target.id) ?? []).length,
        comparisonScanId: comparison?.id ?? null,
        previousScanId: position > 0 ? (siblings[position - 1]?.id ?? null) : null,
        nextScanId: position >= 0 && position < siblings.length - 1 ? (siblings[position + 1]?.id ?? null) : null,
        canCancel: isScanInFlight(scan.status),
        canRerun: !isScanInFlight(scan.status),
      }
    })
  },

  /** Targets that may legally be scanned, for the wizard's target step. */
  async scannableTargets(projectId?: string): Promise<
    Array<{
      id: string
      name: string
      baseUrl: string
      projectId: string | null
      environment: Target['environment']
      authorised: boolean
      inFlight: boolean
      endpointCount: number
    }>
  > {
    return request(() => {
      const { indexes } = demoStore
      return demoStore
        .snapshot()
        .targets.filter((target) => (projectId ? target.projectId === projectId : true))
        .map((target) => ({
          id: target.id,
          name: target.name,
          baseUrl: target.baseUrl,
          projectId: target.projectId,
          environment: target.environment,
          authorised: target.scope.authorizationConfirmed,
          inFlight: (indexes.scansByTarget.get(target.id) ?? []).some((scan) => isScanInFlight(scan.status)),
          endpointCount: (indexes.endpointsByTarget.get(target.id) ?? []).length,
        }))
        .sort((a, b) => Number(b.authorised) - Number(a.authorised) || a.name.localeCompare(b.name))
    })
  },

  /**
   * Queues a run.
   *
   * Refuses what a real backend would refuse: an unauthorised target, a target
   * that already has a run in flight, and a module selection the profile does not
   * contain. The authorisation check is the point of the whole exercise — it is
   * the difference between a scanner and a vulnerability generator.
   */
  async start(input: StartScanInput): Promise<Scan> {
    return requestWrite(() => {
      const { indexes } = demoStore
      const data = demoStore.snapshot()
      const fields: Record<string, string> = {}

      const project = indexes.projectById.get(input.projectId)
      if (!project) fields.projectId = 'Choose a project.'

      const target = indexes.targetById.get(input.targetId)
      if (!target) fields.targetId = 'Choose a target.'
      else if (!target.scope.authorizationConfirmed) {
        fields.targetId = 'This target has no recorded written authorisation.'
      } else if (target.projectId !== input.projectId) {
        fields.targetId = 'That target does not belong to the selected project.'
      }

      const profile = data.scanProfiles.find((entry) => entry.id === input.profileId)
      if (!profile) fields.profileId = 'Choose a scan profile.'

      const selected = input.moduleIds.filter((id) => profile?.moduleIds.includes(id))
      if (selected.length === 0) fields.moduleIds = 'Select at least one module to run.'

      const inFlight = target
        ? (indexes.scansByTarget.get(target.id) ?? []).filter((scan) => isScanInFlight(scan.status))
        : []
      if (inFlight.length > 0) {
        fields.targetId = `A run is already in progress for this target (${inFlight[0]?.id}).`
      }

      if (Object.values(fields).some((message) => message !== '')) {
        throw new ApiError(400, 'This scan cannot be started yet.', fields)
      }

      // Unreachable given the guard above; present so the types narrow.
      if (!target || !profile) {
        throw new ApiError(400, 'Choose a project, a target and a profile.')
      }

      const startedAt = new Date().toISOString()
      const existingForTarget = indexes.scansByTarget.get(target.id) ?? []
      const sequence = existingForTarget.reduce((max, scan) => Math.max(max, scan.sequence), 0) + 1

      const scan: Scan = {
        id: paddedId('scn', nextIndexFor('scn', data.scans.map((row) => row.id)), 4),
        sequence,
        projectId: input.projectId,
        targetId: target.id,
        profileId: profile.id,
        moduleIds: selected,
        initiatedBy: input.initiatedBy,
        status: 'queued',
        progress: 0,
        startedAt,
        completedAt: null,
        durationSeconds: 0,
        stages: SCAN_STAGE_DEFINITIONS.map((definition, index) => ({
          id: `stg-${index + 1}`,
          name: definition.name,
          state: 'pending' as const,
          progress: 0,
          startedAt: null,
          completedAt: null,
        })),
        counters: {
          endpointsDiscovered: 0,
          parametersDiscovered: 0,
          requestsTested: 0,
          testsCompleted: 0,
          potentialFindings: 0,
        },
        logs: [],
        findingCount: 0,
      }

      demoStore.mutate((draft) => {
        draft.scans.push(scan)
        draft.jobs.push({
          id: paddedId('job', nextIndexFor('job', draft.jobs.map((row) => row.id)), 4),
          kind: 'vulnerability_analysis',
          queue: 'scans',
          status: 'queued',
          scanId: scan.id,
          startedAt: null,
          durationSeconds: 0,
          worker: 'scanner-01',
        })
        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: startedAt,
          actor: input.initiatedBy,
          action: 'scan.started',
          entity: 'scan',
          entityId: scan.id,
          ipAddress: '10.20.4.18',
          outcome: 'success',
        })
      })

      return scan
    })
  },

  /** Stops an in-flight run. Terminal runs are left alone. */
  async cancel(scanId: string): Promise<Scan> {
    return requestWrite(() => {
      const existing = demoStore.indexes.scanById.get(scanId)
      if (!existing) throw notFound('Scan', scanId)
      if (!isScanInFlight(existing.status)) {
        throw new ApiError(409, 'This scan has already finished, so there is nothing to cancel.')
      }

      const cancelledAt = new Date().toISOString()
      const elapsed = Math.max(0, Math.round((Date.now() - new Date(existing.startedAt).getTime()) / 1000))

      const updated: Scan = {
        ...existing,
        status: 'cancelled',
        completedAt: cancelledAt,
        durationSeconds: elapsed,
        stages: existing.stages.map((stage) =>
          stage.state === 'active'
            ? { ...stage, state: 'skipped' as const, completedAt: cancelledAt }
            : stage,
        ),
        logs: [
          ...existing.logs,
          {
            id: paddedId('log', nextIndexFor('log', existing.logs.map((row) => row.id)), 3),
            timestamp: cancelledAt,
            level: 'warning' as const,
            message: 'Cancellation requested by operator — in-flight request batch aborted, partial results retained',
          },
        ],
      }

      demoStore.mutate((draft) => {
        const position = draft.scans.findIndex((entry) => entry.id === scanId)
        if (position >= 0) draft.scans[position] = updated

        for (const job of draft.jobs) {
          if (job.scanId === scanId) {
            job.status = 'cancelled'
            job.durationSeconds = elapsed
          }
        }

        draft.auditLog.push({
          id: paddedId('aud', nextAuditIndex(draft.auditLog), 5),
          timestamp: cancelledAt,
          actor: existing.initiatedBy,
          action: 'scan.cancelled',
          entity: 'scan',
          entityId: scanId,
          ipAddress: '10.20.4.18',
          outcome: 'success',
        })
      })

      return updated
    })
  },

  /** Queues a fresh run with the same target, profile and module selection. */
  async rerun(scanId: string, initiatedBy: string): Promise<Scan> {
    const existing = demoStore.indexes.scanById.get(scanId)
    if (!existing) throw notFound('Scan', scanId)
    if (isScanInFlight(existing.status)) {
      throw new ApiError(409, 'This scan is still running, so it cannot be re-run yet.')
    }
    return this.start({
      projectId: existing.projectId,
      targetId: existing.targetId,
      profileId: existing.profileId,
      moduleIds: existing.moduleIds,
      initiatedBy,
    })
  },
}

/* -------------------------------------------------------------------------- */

/** Convenience for the register's status filter. */
export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  queued: 'Queued',
  initializing: 'Initialising',
  running: 'Running',
  analyzing: 'Analysing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
