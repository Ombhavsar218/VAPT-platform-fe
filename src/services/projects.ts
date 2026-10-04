import type { AssessmentType, ListParams, Paginated, Project, ProjectStatus, User } from '@/types'
import { NOW, paddedId } from '@/data'

import { demoStore } from './store'
import { ApiError, applySearch, filterIncludes, notFound, normalizeListParams, paginate, request, requestWrite, type NormalizedList } from './transport'

/**
 * Projects service.
 *
 * `summary()` is the aggregate the dashboard and the project list both need; it
 * is computed in one place so a project's risk score can never disagree with
 * its own detail page.
 */

export interface ProjectSummary {
  project: Project
  targetCount: number
  scanCount: number
  runningScanCount: number
  findingCount: number
  openFindingCount: number
  confirmedFindingCount: number
  potentialFindingCount: number
  criticalCount: number
  highCount: number
  reportCount: number
  lastScanAt: string | null
  lastFindingAt: string | null
  /** 0–100, weighting confirmed issues far more heavily than raw counts. */
  riskScore: number
  status: ProjectStatus
}

const OPEN_STATUSES = new Set(['open', 'potential', 'needs_retest', 'reopened'])

function computeRiskScore(input: {
  critical: number
  high: number
  medium: number
  low: number
  informational: number
}): number {
  const weighted =
    input.critical * 22 + input.high * 12 + input.medium * 5 + input.low * 1.5 + input.informational * 0.4
  // Saturating curve: 10 criticals is effectively "as bad as it gets".
  return Math.round(100 * (1 - Math.exp(-weighted / 90)))
}

export function summariseProject(project: Project): ProjectSummary {
  const { indexes } = demoStore
  const data = demoStore.snapshot()

  const targets = data.targets.filter((target) => target.projectId === project.id)
  const scans = indexes.scansByProject.get(project.id) ?? []
  const findings = indexes.findingsByProject.get(project.id) ?? []
  const reports = data.reports.filter((report) => report.projectId === project.id)

  const counts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
  let openFindingCount = 0
  let confirmedFindingCount = 0
  let potentialFindingCount = 0
  let lastFindingAt: string | null = null

  for (const finding of findings) {
    if (OPEN_STATUSES.has(finding.status)) {
      openFindingCount += 1
      if (finding.status === 'confirmed') confirmedFindingCount += 1
      if (finding.status === 'potential') potentialFindingCount += 1
      counts[finding.severity] += 1
    }
    if (lastFindingAt === null || finding.lastDetected > lastFindingAt) {
      lastFindingAt = finding.lastDetected
    }
  }

  const lastScanAt = scans.reduce<string | null>(
    (latest, scan) => (latest === null || scan.startedAt > latest ? scan.startedAt : latest),
    null,
  )

  return {
    project,
    targetCount: targets.length,
    scanCount: scans.length,
    runningScanCount: scans.filter(
      (scan) => scan.status === 'queued' || scan.status === 'running' || scan.status === 'analyzing' || scan.status === 'initializing',
    ).length,
    findingCount: findings.length,
    openFindingCount,
    confirmedFindingCount,
    potentialFindingCount,
    criticalCount: counts.critical,
    highCount: counts.high,
    reportCount: reports.length,
    lastScanAt,
    lastFindingAt,
    riskScore: computeRiskScore(counts),
    status: project.status,
  }
}

/** The project list is the summary shape; the alias documents the intent. */
export type ProjectListRow = ProjectSummary

/** Workspace-wide project totals, for the register's stat tiles. */
export interface ProjectAggregates {
  total: number
  active: number
  openFindings: number
  criticalHigh: number
  runningScans: number
}

/** One page of the register plus the totals behind its stat tiles. */
export interface ProjectRegister extends Paginated<ProjectListRow> {
  aggregates: ProjectAggregates
  /**
   * Every owner of any project in the workspace, not just those on this page.
   *
   * The owner filter has to be able to name every owner or it silently hides
   * engagements the analyst is looking for.
   */
  ownerIds: string[]
}

function searchText(row: ProjectListRow): string {
  return [row.project.name, row.project.client, row.project.description, row.project.owner].join(' ')
}

/** Rows matching the filters *and* the search text, counted before pagination. */
function selectMatchingRows(query: NormalizedList): ProjectListRow[] {
  const filtered = demoStore.snapshot().projects.map(summariseProject).filter((summary) => {
    if (!filterIncludes(query.filters, 'status', summary.project.status)) return false
    if (!filterIncludes(query.filters, 'assessmentType', summary.project.assessmentType)) return false
    if (!filterIncludes(query.filters, 'owner', summary.project.owner)) return false
    return true
  })

  return applySearch(filtered, query, { searchText, sortValue: () => undefined })
}

function summariseAggregates(rows: ProjectListRow[]): ProjectAggregates {
  return {
    total: rows.length,
    // "Active" here means still live work, not the literal `active` status:
    // planning and paused engagements are not finished either.
    active: rows.filter((row) => row.project.status !== 'completed').length,
    openFindings: rows.reduce((sum, row) => sum + row.openFindingCount, 0),
    criticalHigh: rows.reduce((sum, row) => sum + row.criticalCount + row.highCount, 0),
    runningScans: rows.reduce((sum, row) => sum + row.runningScanCount, 0),
  }
}

export const projectService = {
  /**
   * The register page.
   *
   * Totals are returned with the page rather than fetched separately: the tiles
   * describe the same set as the rows, so they cannot drift apart mid-render.
   */
  async register(params: ListParams = {}): Promise<ProjectRegister> {
    const query = normalizeListParams(params)

    return request(() => {
      const allProjects = demoStore.snapshot().projects
      const matching = selectMatchingRows(query)

      const page = paginate(matching, query, {
        searchText,
        sortValue: (row, key) => {
          switch (key) {
            case 'name':
              return row.project.name
            case 'client':
              return row.project.client
            case 'status':
              return row.project.status
            case 'riskScore':
              return row.riskScore
            case 'targetCount':
              return row.targetCount
            case 'openFindingCount':
              return row.openFindingCount
            case 'lastScanAt':
              return row.lastScanAt ?? ''
            case 'createdAt':
              return row.project.createdAt
            case 'startDate':
              return row.project.startDate
            default:
              return undefined
          }
        },
      })

      return {
        ...page,
        aggregates: summariseAggregates(matching),
        ownerIds: [...new Set(allProjects.map((project) => project.owner))].sort(),
      }
    })
  },

  async list(params: ListParams = {}): Promise<Paginated<ProjectListRow>> {
    const { aggregates: _aggregates, ownerIds: _ownerIds, ...page } = await this.register(params)
    return page
  },

  async detail(projectId: string): Promise<ProjectSummary> {
    return request(() => {
      const project = demoStore.indexes.projectById.get(projectId)
      if (!project) throw notFound('Project', projectId)
      return summariseProject(project)
    })
  },

  async options(): Promise<Pick<Project, 'id' | 'name' | 'client' | 'status' | 'assessmentType'>[]> {
    return request(() => demoStore.snapshot().projects.map(({ id, name, client, status, assessmentType }) => ({
      id,
      name,
      client,
      status,
      assessmentType,
    })))
  },

  async create(input: {
    name: string
    client: string
    description: string
    assessmentType: AssessmentType
    status: ProjectStatus
    startDate: string
    endDate: string
    owner: string
  }): Promise<Project> {
    return requestWrite(() => {
      const fields: Record<string, string> = {}
      if (input.name.trim().length < 3) fields.name = 'Use at least 3 characters.'
      if (input.client.trim().length < 2) fields.client = 'Client name is required.'
      if (input.endDate < input.startDate) fields.endDate = 'End date cannot precede the start date.'
      if (Object.keys(fields).length > 0) {
        throw new ApiError(400, 'Please correct the highlighted fields.', fields)
      }

      const project: Project = {
        id: paddedId('prj', demoStore.snapshot().projects.length + 1, 3),
        name: input.name.trim(),
        client: input.client.trim(),
        description: input.description.trim(),
        assessmentType: input.assessmentType,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
        owner: input.owner,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }

      demoStore.mutate((draft) => {
        draft.projects.push(project)
      })

      return project
    })
  },

  async update(projectId: string, patch: Partial<Project>): Promise<Project> {
    return requestWrite(() => {
      const existing = demoStore.indexes.projectById.get(projectId)
      if (!existing) throw notFound('Project', projectId)

      const updated: Project = { ...existing, ...patch, updatedAt: NOW.toISOString() }
      demoStore.mutate((draft) => {
        const position = draft.projects.findIndex((entry) => entry.id === projectId)
        if (position >= 0) draft.projects[position] = updated
      })
      return updated
    })
  },
}

/** All workspace members, used by owner and assignee pickers. */
export const userService = {
  async list(): Promise<User[]> {
    return request(() => demoStore.snapshot().users)
  },
}
