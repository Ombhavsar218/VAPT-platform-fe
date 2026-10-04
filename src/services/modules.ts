import type {
  ListParams,
  ModuleDeployment,
  ModuleStatus,
  Paginated,
  ScanProfile,
  ScannerModule,
  Severity,
  VulnerabilityType,
  WorkerHost,
} from '@/types'
import { MODULE_STATUSES, WORKER_HOSTS } from '@/types'
import type { Dataset } from '@/data'
import { OWASP_2025_ORDER, OWASP_CATEGORIES } from '@/data'

import { severityCountsOf, type SeverityCounts } from '@/utils/severity'
import { nextAuditIndex } from '@/utils/ids'

import { findingsForModule, typeIdsForModule } from './coverage'
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
 * Detection modules: the analyst-facing register at `/modules`.
 *
 * A module is a detection capability, not a job. The question this screen
 * answers is "what will actually run if I start a scan right now", which is why
 * every row carries its test count and the OWASP categories it feeds into
 * coverage — an analyst deciding whether a result is trustworthy needs to know
 * which detections were even in play.
 *
 * Deployment lives in the admin service. Keeping it out of here is deliberate:
 * whether a detection *should* run and whether the worker fleet *has* it are
 * separate concerns, and merging them makes both harder to read.
 */

export interface ModuleRow {
  id: string
  name: string
  slug: string
  description: string
  category: string
  status: ModuleStatus
  version: string
  testCount: number
  owaspCategories: string[]
  updatedAt: string
  /** Profiles that ship this module enabled. */
  includedInProfiles: string[]
  /** Findings ever attributed to this module's vulnerability types. */
  findingCount: number
  severityCounts: SeverityCounts
}

export interface ModuleAggregates {
  total: number
  byStatus: Record<ModuleStatus, number>
  totalTests: number
  /** Findings attributable to any enabled module. */
  findingsFromEnabled: number
  categories: string[]
}

export interface ModuleDetail {
  module: ModuleRow
  /** Vulnerability types the module can raise, with live finding counts. */
  vulnerabilityTypes: {
    id: string
    name: string
    severity: Severity
    owaspId: string
    findingCount: number
  }[]
  deployments: ModuleDeployment[]
  /** Scans in this workspace that ran the module. */
  recentScans: {
    id: string
    targetName: string
    status: string
    startedAt: string | null
    completedAt: string | null
  }[]
}

export const EMPTY_MODULE_AGGREGATES: ModuleAggregates = {
  total: 0,
  byStatus: { enabled: 0, disabled: 0, experimental: 0 },
  totalTests: 0,
  findingsFromEnabled: 0,
  categories: [],
}

function toRow(data: Dataset, module: ScannerModule): ModuleRow {
  const findings = findingsForModule(data, module)

  return {
    id: module.id,
    name: module.name,
    slug: module.slug,
    description: module.description,
    category: module.category,
    status: module.status,
    version: module.version,
    testCount: module.testCount,
    owaspCategories: module.owaspCategories,
    updatedAt: module.updatedAt,
    includedInProfiles: data.scanProfiles
      .filter((profile) => profile.moduleIds.includes(module.id))
      .map((profile) => profile.name),
    findingCount: findings.length,
    severityCounts: severityCountsOf(findings),
  }
}

const SELECTORS: ListSelectors<ModuleRow> = {
  searchText: (row) => `${row.name} ${row.slug} ${row.category} ${row.description}`,
  sortValue: (row, key) => {
    switch (key) {
      case 'name':
        return row.name.toLowerCase()
      case 'status':
        return row.status
      case 'category':
        return row.category.toLowerCase()
      case 'version':
        return row.version
      case 'testCount':
        return row.testCount
      case 'findingCount':
        return row.findingCount
      case 'updatedAt':
        return row.updatedAt
      default:
        return undefined
    }
  },
}

function matches(data: Dataset, row: ModuleRow, filters: Record<string, string[]>): boolean {
  if (!filterIncludes(filters, 'status', row.status)) return false
  if (!filterIncludes(filters, 'category', row.category)) return false
  const owasp = filters['owasp']
  if (owasp && owasp.length > 0) {
    if (!owasp.some((id) => row.owaspCategories.includes(id))) return false
  }
  const profile = filters['profile']
  if (profile && profile.length > 0) {
    const profiles = data.scanProfiles.filter((entry) => profile.includes(entry.id))
    if (!profiles.some((entry) => entry.moduleIds.includes(row.id))) return false
  }
  return true
}

export const modulesService = {
  /** Paginated register with aggregates computed over the whole catalogue. */
  async list(params: ListParams = {}): Promise<Paginated<ModuleRow> & { aggregates: ModuleAggregates }> {
    const query = normalizeListParams(params)

    return request(() => {
      const data = demoStore.snapshot()
      const rows = data.modules.map((module) => toRow(data, module))

      const enabledTypeIds = new Set<string>()
      for (const module of data.modules) {
        if (module.status !== 'enabled') continue
        for (const id of typeIdsForModule(data, module)) enabledTypeIds.add(id)
      }
      const findingsFromEnabled = data.findings.filter((finding) =>
        enabledTypeIds.has(finding.vulnerabilityTypeId),
      ).length

      const aggregates: ModuleAggregates = {
        total: rows.length,
        byStatus: rows.reduce<Record<ModuleStatus, number>>(
          (counts, row) => ({ ...counts, [row.status]: counts[row.status] + 1 }),
          { enabled: 0, disabled: 0, experimental: 0 },
        ),
        totalTests: rows.reduce((sum, row) => sum + row.testCount, 0),
        findingsFromEnabled,
        categories: [...new Set(rows.map((row) => row.category))].sort(),
      }

      const filtered = rows.filter((row) => matches(data, row, query.filters))
      const page = paginate(filtered, query, SELECTORS)

      return { ...page, aggregates }
    })
  },

  /** Filter options derived from the catalogue rather than hard-coded. */
  async options(): Promise<{
    categories: string[]
    statuses: ModuleStatus[]
    owaspCategories: { id: string; label: string }[]
    profiles: { id: string; name: string }[]
  }> {
    return request(() => {
      const data = demoStore.snapshot()

      return {
        categories: [...new Set(data.modules.map((module) => module.category))].sort(),
        statuses: [...MODULE_STATUSES],
        owaspCategories: OWASP_2025_ORDER.map((id) => ({
          id,
          label: `${id} · ${OWASP_CATEGORIES[id]?.title ?? 'Unknown category'}`,
        })),
        profiles: data.scanProfiles.map((profile) => ({ id: profile.id, name: profile.name })),
      }
    })
  },

  async detail(moduleId: string): Promise<ModuleDetail> {
    return request(() => {
      const data = demoStore.snapshot()
      const module = data.modules.find((entry) => entry.id === moduleId)
      if (!module) throw notFound('Module', moduleId)

      const typeIds = typeIdsForModule(data, module)
      const counts = new Map<string, number>()
      for (const finding of data.findings) {
        if (typeIds.has(finding.vulnerabilityTypeId)) {
          counts.set(finding.vulnerabilityTypeId, (counts.get(finding.vulnerabilityTypeId) ?? 0) + 1)
        }
      }

      const vulnerabilityTypes = (data.vulnerabilityTypes as readonly VulnerabilityType[])
        .filter((type) => typeIds.has(type.id))
        .map((type) => ({
          id: type.id,
          name: type.name,
          severity: type.severity,
          owaspId: type.owaspId,
          findingCount: counts.get(type.id) ?? 0,
        }))
        .sort((a, b) => b.findingCount - a.findingCount || a.name.localeCompare(b.name))

      const targetNameById = new Map(data.targets.map((target) => [target.id, target.name]))
      const recentScans = data.scans
        .filter((scan) => scan.moduleIds.includes(module.id))
        .slice()
        .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
        .slice(0, 8)
        .map((scan) => ({
          id: scan.id,
          targetName: targetNameById.get(scan.targetId) ?? 'Unknown target',
          status: scan.status,
          startedAt: scan.startedAt,
          completedAt: scan.completedAt,
        }))

      const deployments = data.moduleDeployments.filter(
        (entry) => entry.moduleId === module.id,
      )

      return {
        module: toRow(data, module),
        vulnerabilityTypes,
        deployments,
        recentScans,
      }
    })
  },

  /**
   * Change a module's editorial status.
   *
   * Guardrail worth stating: disabling a module that findings already exist for
   * does not retract those findings, and this method refuses to do it silently.
   * A detection that has already produced a record must stay in the record, so
   * the UI shows the module as disabled with its historical findings intact.
   */
  async setStatus(moduleId: string, status: ModuleStatus, actor: string): Promise<ModuleRow> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const module = data.modules.find((entry) => entry.id === moduleId)
      if (!module) throw notFound('Module', moduleId)
      if (!MODULE_STATUSES.includes(status)) {
        throw new ApiError(400, `Unknown module status "${status}".`, { status: 'Unknown status.' })
      }
      if (module.status === status) {
        throw new ApiError(409, `${module.name} is already ${status}.`)
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.modules.find((entry) => entry.id === moduleId)
        if (target) {
          target.status = status
          target.updatedAt = new Date().toISOString()
        }
        draft.auditLog.push({
          id: `aud-${String(nextAuditIndex(draft.auditLog)).padStart(5, '0')}`,
          timestamp: new Date().toISOString(),
          actor,
          action: 'module.status_change',
          entity: 'module',
          entityId: moduleId,
          ipAddress: '10.4.0.12',
          outcome: 'success',
        })
      })

      const updated = snapshot.modules.find((entry) => entry.id === moduleId)
      if (!updated) throw notFound('Module', moduleId)
      return toRow(snapshot, updated)
    })
  },

  /** Worker hosts, for the deployment matrix on the admin side. */
  workerHosts(): WorkerHost[] {
    return [...WORKER_HOSTS]
  },
}

export type { ScanProfile }
