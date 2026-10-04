import type {
  Confidence,
  Environment,
  Project,
  Scan,
  ScopeConfig,
  Severity,
  TargetType,
} from '@/types'
import {
  emptySeverityCounts,
  isFindingOpen,
  isScanInFlight,
  riskScoreFrom,
  severitySlices,
  SEVERITY_RANK,
  type SeveritySlice,
} from '@/utils/severity'

import { demoStore } from './store'
import { buildCoverageMatrix, type CoverageRow } from './coverage'
import { notFound, request } from './transport'

/**
 * Cross-entity read models: the dashboard overview, navigation counts, project
 * and target detail aggregates, and OWASP coverage.
 *
 * These are the queries a real backend would expose as `/dashboard/summary`,
 * `/projects/{id}/summary` and so on. Keeping them separate from the entity
 * services means the dashboard does not have to download the whole register to
 * draw four tiles.
 */

export type { SeveritySlice }
export interface TrendPoint {
  /** `YYYY-MM-DD` */
  date: string
  label: string
  opened: number
  closed: number
  total: number
}

export interface ActiveScanSummary {
  scan: Scan
  targetName: string
  targetBaseUrl: string
  projectName: string
  projectId: string
  elapsedSeconds: number
}

export interface WorkspaceCounts {
  openFindings: number
  pendingVerification: number
  runningScans: number
  criticalOpen: number
  highOpen: number
  unassignedTargets: number
  reportsReady: number
}

export interface DashboardOverview {
  generatedAt: string
  counts: WorkspaceCounts
  severity: SeveritySlice[]
  /** Open findings grouped by the vulnerability class that produced them. */
  topVulnerabilityTypes: Array<{ name: string; vulnerabilityTypeId: string; count: number; severity: Severity }>
  trend: TrendPoint[]
  recentScans: Array<{ scan: Scan; targetName: string; projectName: string }>
  activeScans: ActiveScanSummary[]
  recentFindings: Array<{
    findingId: string
    title: string
    severity: Severity
    status: string
    targetName: string
    detectedAt: string
  }>
  projectRisk: Array<{ projectId: string; name: string; client: string; riskScore: number; openFindings: number }>
  verificationBacklog: number
  /** Weakest OWASP categories by catalogue coverage, for the dashboard panel. */
  coverageTopGaps: CoverageRow[]
}

/* -------------------------------------------------------------------------- */
/* Aggregation helpers                                                         */
/* -------------------------------------------------------------------------- */

export function workspaceCounts(): WorkspaceCounts {
  const data = demoStore.snapshot()
  const findings = data.findings
  const open = findings.filter((finding) => isFindingOpen(finding.status))

  return {
    openFindings: open.length,
    pendingVerification: data.verificationTasks.filter((task) => task.decision === null).length,
    runningScans: data.scans.filter((scan) => isScanInFlight(scan.status)).length,
    criticalOpen: open.filter((finding) => finding.severity === 'critical').length,
    highOpen: open.filter((finding) => finding.severity === 'high').length,
    unassignedTargets: data.targets.filter((target) => target.projectId === null).length,
    reportsReady: data.reports.filter((report) => report.status === 'ready').length,
  }
}

/** Daily opened/closed counts over the trailing window, oldest first. */
function buildTrend(days: number, findings: ReturnType<typeof demoStore.snapshot>['findings']): TrendPoint[] {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const buckets: TrendPoint[] = Array.from({ length: days }, (_unused, index) => {
    const date = new Date(today.getTime() - (days - 1 - index) * 86_400_000)
    return {
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
      opened: 0,
      closed: 0,
      total: 0,
    }
  })

  const indexFor = (iso: string): number => {
    const timestamp = new Date(iso).getTime()
    const start = new Date(today.getTime() - (days - 1) * 86_400_000).getTime()
    if (timestamp < start) return -1
    const index = Math.floor((timestamp - start) / 86_400_000)
    return index >= 0 && index < buckets.length ? index : -1
  }

  for (const finding of findings) {
    const opened = indexFor(finding.firstDetected)
    if (opened >= 0) {
      const bucket = buckets[opened]
      if (bucket) bucket.opened += 1
    }
    if (finding.status === 'fixed') {
      const closed = indexFor(finding.lastDetected)
      if (closed >= 0) {
        const bucket = buckets[closed]
        if (bucket) bucket.closed += 1
      }
    }
  }

  let running = 0
  for (const bucket of buckets) {
    running += bucket.opened - bucket.closed
    bucket.total = Math.max(0, running)
  }

  return buckets
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export const dashboardService = {
  async overview(): Promise<DashboardOverview> {
    return request(() => {
      const data = demoStore.snapshot()
      const { indexes } = demoStore

      const openFindings = data.findings.filter((finding) => isFindingOpen(finding.status))
      const counts = emptySeverityCounts()
      for (const finding of openFindings) counts[finding.severity] += 1

      const typeCounts = new Map<string, { count: number; severity: Severity }>()
      for (const finding of openFindings) {
        const entry = typeCounts.get(finding.vulnerabilityTypeId) ?? { count: 0, severity: finding.severity }
        entry.count += 1
        typeCounts.set(finding.vulnerabilityTypeId, entry)
      }
      const typeName = new Map(data.vulnerabilityTypes.map((type) => [type.id, type.name]))

      const activeScans: ActiveScanSummary[] = data.scans
        .filter((scan) => isScanInFlight(scan.status))
        .sort((a, b) => b.progress - a.progress)
        .map((scan) => {
          const target = indexes.targetById.get(scan.targetId)
          const project = indexes.projectById.get(scan.projectId)
          return {
            scan,
            targetName: target?.name ?? 'Unknown target',
            targetBaseUrl: target?.baseUrl ?? '',
            projectName: project?.name ?? 'Unassigned',
            projectId: scan.projectId,
            elapsedSeconds: Math.max(
              0,
              Math.round((Date.now() - new Date(scan.startedAt).getTime()) / 1000),
            ),
          }
        })

      const projectRisk = data.projects
        .map((project) => {
          const findings = indexes.findingsByProject.get(project.id) ?? []
          const open = findings.filter((finding) => isFindingOpen(finding.status))
          const severityCounts = emptySeverityCounts()
          for (const finding of open) severityCounts[finding.severity] += 1
          return {
            projectId: project.id,
            name: project.name,
            client: project.client,
            riskScore: riskScoreFrom(severityCounts),
            openFindings: open.length,
          }
        })
        .filter((row) => row.openFindings > 0)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 6)

      const recentScans = [...data.scans]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 6)
        .map((scan) => ({
          scan,
          targetName: indexes.targetById.get(scan.targetId)?.name ?? 'Unknown target',
          projectName: indexes.projectById.get(scan.projectId)?.name ?? 'Unassigned',
        }))

      const recentFindings = [...openFindings]
        .sort((a, b) => b.lastDetected.localeCompare(a.lastDetected))
        .slice(0, 7)
        .map((finding) => ({
          findingId: finding.id,
          title: finding.title,
          severity: finding.severity,
          status: finding.status,
          targetName: indexes.targetById.get(finding.targetId)?.name ?? 'Unknown target',
          detectedAt: finding.lastDetected,
        }))

      return {
        generatedAt: new Date().toISOString(),
        counts: workspaceCounts(),
        severity: severitySlices(counts),
        topVulnerabilityTypes: [...typeCounts.entries()]
          .map(([vulnerabilityTypeId, entry]) => ({
            vulnerabilityTypeId,
            name: typeName.get(vulnerabilityTypeId) ?? vulnerabilityTypeId,
            count: entry.count,
            severity: entry.severity,
          }))
          .sort((a, b) => b.count - a.count || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
          .slice(0, 7),
        trend: buildTrend(30, data.findings),
        recentScans,
        activeScans,
        recentFindings,
        projectRisk,
        verificationBacklog: data.verificationTasks.filter((task) => task.decision === null).length,
        coverageTopGaps: buildCoverageMatrix()
          .slice()
          .sort((a, b) => a.coveragePercent - b.coveragePercent || a.owaspId.localeCompare(b.owaspId))
          .slice(0, 4),
      }
    })
  },

  async counts(): Promise<WorkspaceCounts> {
    return request(() => workspaceCounts(), { minMs: 80, maxMs: 200 })
  },
}

/* -------------------------------------------------------------------------- */
/* Project and target detail                                                   */
/* -------------------------------------------------------------------------- */

export interface ProjectDetailData {
  project: Project
  targets: Array<{
    id: string
    name: string
    baseUrl: string
    environment: Environment
    type: TargetType
    openFindings: number
    lastScanAt: string | null
  }>
  scans: Scan[]
  severity: SeveritySlice[]
  riskScore: number
  openFindingCount: number
  totalFindingCount: number
  reportCount: number
  owners: string[]
}

export const projectDetailService = {
  async load(projectId: string): Promise<ProjectDetailData> {
    return request(() => {
      const project = demoStore.indexes.projectById.get(projectId)
      if (!project) throw notFound('Project', projectId)

      const { indexes } = demoStore
      const data = demoStore.snapshot()
      const findings = indexes.findingsByProject.get(projectId) ?? []
      const openFindings = findings.filter((finding) => isFindingOpen(finding.status))

      const counts = emptySeverityCounts()
      for (const finding of openFindings) counts[finding.severity] += 1
      return {
        project,
        targets: data.targets
          .filter((target) => target.projectId === projectId)
          .map((target) => {
            const targetScans = indexes.scansByTarget.get(target.id) ?? []
            return {
              id: target.id,
              name: target.name,
              baseUrl: target.baseUrl,
              environment: target.environment,
              type: target.type,
              openFindings: (indexes.findingsByTarget.get(target.id) ?? []).filter((finding) =>
                isFindingOpen(finding.status),
              ).length,
              lastScanAt: targetScans.reduce<string | null>(
                (latest, scan) => (latest === null || scan.startedAt > latest ? scan.startedAt : latest),
                null,
              ),
            }
          }),
        scans: (indexes.scansByProject.get(projectId) ?? []).sort((a, b) =>
          b.startedAt.localeCompare(a.startedAt),
        ),
        severity: severitySlices(counts),
        riskScore: riskScoreFrom(counts),
        openFindingCount: openFindings.length,
        totalFindingCount: findings.length,
        reportCount: data.reports.filter((report) => report.projectId === projectId).length,
        owners: [project.owner],
      }
    })
  },
}

export interface TargetDetailData {
  target: {
    id: string
    name: string
    baseUrl: string
    type: TargetType
    environment: Environment
    description: string
    tags: string[]
    projectId: string | null
    projectName: string | null
    client: string | null
    createdAt: string
    updatedAt: string
  }
  scope: ScopeConfig
  technologies: Array<{
    name: string
    category: string
    version: string | null
    confidence: Confidence
  }>
  endpointCount: number
  scans: Scan[]
  openFindingCount: number
  findingCount: number
  severity: SeveritySlice[]
  lastScanAt: string | null
  daysSinceScan: number | null
}

export const targetDetailService = {
  async load(targetId: string): Promise<TargetDetailData> {
    return request(() => {
      const target = demoStore.indexes.targetById.get(targetId)
      if (!target) throw notFound('Target', targetId)

      const { indexes } = demoStore
      const findings = indexes.findingsByTarget.get(targetId) ?? []
      const openFindings = findings.filter((finding) => isFindingOpen(finding.status))
      const scans = (indexes.scansByTarget.get(targetId) ?? []).sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      )

      const counts = emptySeverityCounts()
      for (const finding of openFindings) counts[finding.severity] += 1

      const project = target.projectId ? indexes.projectById.get(target.projectId) : undefined
      const lastScanAt = scans.reduce<string | null>(
        (latest, scan) => (latest === null || scan.startedAt > latest ? scan.startedAt : latest),
        null,
      )

      return {
        target: {
          id: target.id,
          name: target.name,
          baseUrl: target.baseUrl,
          type: target.type,
          environment: target.environment,
          description: target.description,
          tags: target.tags,
          projectId: target.projectId,
          projectName: project?.name ?? null,
          client: project?.client ?? null,
          createdAt: target.createdAt,
          updatedAt: target.updatedAt,
        },
        scope: target.scope,
        technologies: (indexes.technologiesByTarget.get(targetId) ?? []).map((tech) => ({
          name: tech.name,
          category: tech.category,
          version: tech.version,
          confidence: tech.confidence,
        })),
        endpointCount: (indexes.endpointsByTarget.get(targetId) ?? []).length,
        scans,
        openFindingCount: openFindings.length,
        findingCount: findings.length,
        severity: severitySlices(counts),
        lastScanAt,
        daysSinceScan: lastScanAt
          ? Math.floor((Date.now() - new Date(lastScanAt).getTime()) / 86_400_000)
          : null,
      }
    })
  },
}
