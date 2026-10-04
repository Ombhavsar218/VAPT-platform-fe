import type {
  Endpoint,
  Environment,
  ListParams,
  Paginated,
  Scan,
  ScanProfile,
  ScannerModule,
  Target,
  TargetType,
  Technology,
  VulnerabilityType,
} from '@/types'
import { NOW, paddedId } from '@/data'
import { isFindingOpen, isScanInFlight } from '@/utils/severity'

import { demoStore } from './store'
import { ApiError, applySearch, filterIncludes, notFound, normalizeListParams, paginate, request, requestWrite, type NormalizedList } from './transport'

/**
 * Targets service, plus the small reference endpoints the filter bars need.
 */

export interface TargetRow extends Target {
  projectName: string | null
  client: string | null
  endpointCount: number
  scanCount: number
  runningScanCount: number
  findingCount: number
  openFindingCount: number
  criticalCount: number
  highCount: number
  lastScanAt: string | null
  /** Days since the target was last scanned, or `null` when never scanned. */
  daysSinceScan: number | null
}

function projectLabel(target: Target): { projectName: string | null; client: string | null } {
  if (!target.projectId) return { projectName: null, client: null }
  const project = demoStore.indexes.projectById.get(target.projectId)
  if (!project) return { projectName: null, client: null }
  return { projectName: project.name, client: project.client }
}

export function summariseTarget(target: Target): TargetRow {
  const scans = demoStore.indexes.scansByTarget.get(target.id) ?? []
  const findings = demoStore.indexes.findingsByTarget.get(target.id) ?? []
  const { projectName, client } = projectLabel(target)

  const openFindings = findings.filter((finding) => isFindingOpen(finding.status))
  const lastScanAt = scans.reduce<string | null>(
    (latest, scan) => (latest === null || scan.startedAt > latest ? scan.startedAt : latest),
    null,
  )

  return {
    ...target,
    projectName,
    client,
    endpointCount: (demoStore.indexes.endpointsByTarget.get(target.id) ?? []).length,
    scanCount: scans.length,
    runningScanCount: scans.filter((scan) => isScanInFlight(scan.status)).length,
    findingCount: findings.length,
    openFindingCount: openFindings.length,
    criticalCount: openFindings.filter((finding) => finding.severity === 'critical').length,
    highCount: openFindings.filter((finding) => finding.severity === 'high').length,
    lastScanAt,
    daysSinceScan: lastScanAt
      ? Math.floor((Date.now() - new Date(lastScanAt).getTime()) / 86_400_000)
      : null,
  }
}

export interface TargetDetail extends TargetRow {
  technologies: Technology[]
  latestScan: Scan | null
  openFindingsBySeverity: Record<string, number>
}

/** Workspace-wide target totals, for the stat tiles above the register. */
export interface TargetAggregates {
  total: number
  production: number
  unauthorised: number
  endpoints: number
  openFindings: number
  neverScanned: number
}

/** The row's haystack for the register's free-text search. */
function searchText(row: TargetRow): string {
  return [row.name, row.baseUrl, row.client ?? '', row.projectName ?? '', row.tags.join(' ')].join(' ')
}

/**
 * Rows matching the filters *and* the search text.
 *
 * The stat tiles and the table have to describe the same set, so the search is
 * applied here once rather than inside `paginate` where the tiles cannot see it.
 */
function selectMatchingRows(query: NormalizedList): TargetRow[] {
  const unassignedOnly = query.filters.unassignedOnly?.includes('true') === true
  const authorised = query.filters.authorized ?? []

  const filtered = demoStore.snapshot().targets.map(summariseTarget).filter((row) => {
    if (!filterIncludes(query.filters, 'type', row.type)) return false
    if (!filterIncludes(query.filters, 'environment', row.environment)) return false
    if (!filterIncludes(query.filters, 'project', row.projectId ?? 'unassigned')) return false
    if (unassignedOnly && row.projectId !== null) return false
    if (authorised.length > 0 && !authorised.includes(String(row.scope.authorizationConfirmed))) {
      return false
    }
    return true
  })

  return applySearch(filtered, query, { searchText, sortValue: () => undefined })
}

/** One page of the register plus the totals behind its stat tiles. */
export interface TargetRegister extends Paginated<TargetRow> {
  aggregates: TargetAggregates
}

/** Totals over the matching set, counted before pagination. */
function summariseAggregates(rows: TargetRow[]): TargetAggregates {
  return {
    total: rows.length,
    production: rows.filter((row) => row.environment === 'production').length,
    unauthorised: rows.filter((row) => !row.scope.authorizationConfirmed).length,
    endpoints: rows.reduce((sum, row) => sum + row.endpointCount, 0),
    openFindings: rows.reduce((sum, row) => sum + row.openFindingCount, 0),
    neverScanned: rows.filter((row) => row.lastScanAt === null).length,
  }
}

export const targetService = {
  /**
   * The register page.
   *
   * The tiles above the table want totals for the whole filtered set, so they are
   * computed here and returned alongside the page rather than issued as a second
   * request that could race the rows it is supposed to describe.
   */
  async register(params: ListParams = {}): Promise<TargetRegister> {
    const query = normalizeListParams(params)

    return request(() => {
      const matching = selectMatchingRows(query)

      const page = paginate(matching, query, {
        searchText,
        sortValue: (row, key) => {
          switch (key) {
            case 'name':
              return row.name
            case 'baseUrl':
              return row.baseUrl
            case 'type':
              return row.type
            case 'environment':
              return row.environment
            case 'project':
              return row.projectName ?? 'zzz-unassigned'
            case 'endpointCount':
              return row.endpointCount
            case 'openFindingCount':
              return row.openFindingCount
            case 'lastScanAt':
              return row.lastScanAt ?? ''
            case 'createdAt':
              return row.createdAt
            default:
              return undefined
          }
        },
      })

      return { ...page, aggregates: summariseAggregates(matching) }
    })
  },

  async list(params: ListParams = {}): Promise<Paginated<TargetRow>> {
    const { aggregates: _aggregates, ...page } = await this.register(params)
    return page
  },

  async detail(targetId: string): Promise<TargetDetail> {
    return request(() => {
      const target = demoStore.indexes.targetById.get(targetId)
      if (!target) throw notFound('Target', targetId)

      const findings = (demoStore.indexes.findingsByTarget.get(targetId) ?? []).filter((finding) =>
        isFindingOpen(finding.status),
      )
      const openFindingsBySeverity: Record<string, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        informational: 0,
      }
      for (const finding of findings) openFindingsBySeverity[finding.severity] = (openFindingsBySeverity[finding.severity] ?? 0) + 1

      const scans = demoStore.indexes.scansByTarget.get(targetId) ?? []
      const latestScan =
        scans.reduce<Scan | null>((latest, scan) => (latest === null || scan.startedAt > latest.startedAt ? scan : latest), null) ??
        null

      return {
        ...summariseTarget(target),
        technologies: demoStore.indexes.technologiesByTarget.get(targetId) ?? [],
        latestScan,
        openFindingsBySeverity,
      }
    })
  },

  async endpoints(targetId: string): Promise<Endpoint[]> {
    return request(() => {
      const target = demoStore.indexes.targetById.get(targetId)
      if (!target) throw notFound('Target', targetId)
      const endpoints = demoStore.indexes.endpointsByTarget.get(targetId) ?? []
      return [...endpoints].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
    })
  },

  async technologies(targetId: string): Promise<Technology[]> {
    return request(() => {
      const target = demoStore.indexes.targetById.get(targetId)
      if (!target) throw notFound('Target', targetId)
      return demoStore.indexes.technologiesByTarget.get(targetId) ?? []
    })
  },

  async options(): Promise<Pick<Target, 'id' | 'name' | 'baseUrl' | 'projectId' | 'environment'>[]> {
    return request(() =>
      demoStore.snapshot().targets.map(({ id, name, baseUrl, projectId, environment }) => ({
        id,
        name,
        baseUrl,
        projectId,
        environment,
      })),
    )
  },

  async create(input: {
    name: string
    baseUrl: string
    type: TargetType
    environment: Environment
    projectId: string | null
    description: string
    tags: string[]
    allowedPaths: string[]
    excludedPaths: string[]
    authorizationConfirmed: boolean
    authorizationNote: string
  }): Promise<Target> {
    return requestWrite(() => {
      const fields: Record<string, string> = {}
      if (input.name.trim().length < 3) fields.name = 'Use at least 3 characters.'
      if (!/^https?:\/\/[^\s]+$/i.test(input.baseUrl.trim())) {
        fields.baseUrl = 'Enter a full URL including http:// or https://.'
      }
      if (!input.authorizationConfirmed) {
        fields.authorizationConfirmed = 'Written client authorisation is required before a target can be scanned.'
      }
      if (input.allowedPaths.length === 0) fields.allowedPaths = 'At least one allowed path is required.'
      if (Object.keys(fields).length > 0) {
        throw new ApiError(400, 'Please correct the highlighted fields.', fields)
      }

      let host: string
      try {
        host = new URL(input.baseUrl.trim()).host
      } catch {
        host = input.baseUrl.trim()
      }

      const target: Target = {
        id: paddedId('tgt', demoStore.snapshot().targets.length + 1, 3),
        projectId: input.projectId,
        name: input.name.trim(),
        baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
        type: input.type,
        environment: input.environment,
        description: input.description.trim(),
        scope: {
          allowedPaths: input.allowedPaths,
          excludedPaths: input.excludedPaths,
          allowedDomains: [host],
          excludedDomains: [],
          authorizationConfirmed: input.authorizationConfirmed,
          authorizationNote: input.authorizationNote.trim(),
        },
        tags: input.tags,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }

      demoStore.mutate((draft) => {
        draft.targets.push(target)
        draft.technologies[target.id] = []
      })

      return target
    })
  },

  async updateScope(
    targetId: string,
    scope: Partial<Target['scope']>,
  ): Promise<Target> {
    return requestWrite(() => {
      const existing = demoStore.indexes.targetById.get(targetId)
      if (!existing) throw notFound('Target', targetId)
      if (scope.authorizationConfirmed === false) {
        throw new ApiError(400, 'Authorisation cannot be withdrawn from this screen.', {
          authorizationConfirmed: 'Re-issue the authorisation note instead of removing the confirmation.',
        })
      }

      const updated: Target = {
        ...existing,
        scope: { ...existing.scope, ...scope },
        updatedAt: NOW.toISOString(),
      }

      demoStore.mutate((draft) => {
        const position = draft.targets.findIndex((entry) => entry.id === targetId)
        if (position >= 0) draft.targets[position] = updated
      })

      return updated
    })
  },
}

/* -------------------------------------------------------------------------- */
/* Reference data                                                              */
/* -------------------------------------------------------------------------- */

export const referenceService = {
  async scanProfiles(): Promise<ScanProfile[]> {
    return request(() => demoStore.snapshot().scanProfiles)
  },
  async modules(): Promise<ScannerModule[]> {
    return request(() => demoStore.snapshot().modules)
  },
  async vulnerabilityTypes(): Promise<VulnerabilityType[]> {
    return request(() => demoStore.snapshot().vulnerabilityTypes)
  },
}
