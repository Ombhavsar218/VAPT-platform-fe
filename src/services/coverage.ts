import type { Dataset } from '@/data'
import { OWASP_2025_ORDER, OWASP_CATEGORIES } from '@/data'
import type { Finding, ScannerModule } from '@/types'
import { demoStore } from './store'
import { request } from './transport'
import { isFindingOpen } from '@/utils/severity'

/**
 * One OWASP category's coverage.
 *
 * "Tests available" and "test executions" are deliberately different numbers:
 * a category can have many tests available and few executions because the
 * engagements that ran never included the relevant module, and vice versa. The
 * headline percentage is catalogue-based - how many of the vulnerability types
 * we support for this category have actually surfaced something.
 */
export interface CoverageRow {
  owaspId: string
  title: string
  summary: string
  /** Distinct checks the enabled modules can run for this category. */
  testsAvailable: number
  /** Test executions that produced a signal, summed across every scan. */
  testExecutions: number
  /** Catalogue vulnerability types mapped to this category. */
  typesAvailable: number
  /** Of those, how many have produced at least one finding. */
  typesWithFindings: number
  findings: number
  /** `typesWithFindings / typesAvailable`, as a percentage. */
  coveragePercent: number
}

/**
 * Builds the matrix, optionally scoped to one project.
 *
 * Scoping narrows the *observed* side - executions, signals and which types have
 * produced a finding - while the catalogue and test counts stay workspace-wide,
 * because what the scanner is capable of does not change per project. That is
 * what makes a project with low coverage readable as "we did not test this
 * here" rather than "we do not support this".
 */
export function buildCoverageMatrix(projectId?: string): CoverageRow[] {
  const data = demoStore.snapshot()

  const available = new Map<string, number>()
  const executions = new Map<string, number>()
  const findingCounts = new Map<string, number>()
  const typesWithFindings = new Map<string, Set<string>>()
  const typesAvailable = new Map<string, Set<string>>()

  for (const id of OWASP_2025_ORDER) {
    available.set(id, 0)
    executions.set(id, 0)
    findingCounts.set(id, 0)
    typesWithFindings.set(id, new Set())
    typesAvailable.set(id, new Set())
  }

  for (const module of data.modules) {
    if (module.status === 'disabled') continue
    for (const category of module.owaspCategories) {
      available.set(category, (available.get(category) ?? 0) + module.testCount)
    }
  }

  for (const type of data.vulnerabilityTypes) {
    typesAvailable.get(type.owaspId)?.add(type.id)
  }

  const inScope =
    projectId === undefined
      ? data.findings
      : data.findings.filter((finding) => finding.projectId === projectId)

  for (const finding of inScope) {
    executions.set(finding.owaspId, (executions.get(finding.owaspId) ?? 0) + finding.occurrenceCount)
    findingCounts.set(finding.owaspId, (findingCounts.get(finding.owaspId) ?? 0) + 1)
    typesWithFindings.get(finding.owaspId)?.add(finding.vulnerabilityTypeId)
  }

  return OWASP_2025_ORDER.map((owaspId) => {
    const category = OWASP_CATEGORIES[owaspId]
    const availableTypes = typesAvailable.get(owaspId)?.size ?? 0
    const coveredTypes = typesWithFindings.get(owaspId)?.size ?? 0
    return {
      owaspId,
      title: category?.title ?? owaspId,
      summary: category?.summary ?? '',
      testsAvailable: available.get(owaspId) ?? 0,
      testExecutions: executions.get(owaspId) ?? 0,
      typesAvailable: availableTypes,
      typesWithFindings: coveredTypes,
      findings: findingCounts.get(owaspId) ?? 0,
      coveragePercent: availableTypes === 0 ? 0 : Math.round((coveredTypes / availableTypes) * 100),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Aggregates and module rollup                                                */
/* -------------------------------------------------------------------------- */

export interface CoverageAggregates {
  /** Mean of the per-category coverage percentages. */
  overallPercent: number
  categoriesFullyCovered: number
  categoriesPartiallyCovered: number
  categoriesUntested: number
  testsAvailable: number
  testExecutions: number
  findings: number
  weakestOwaspId: string | null
  weakestPercent: number
}

export interface ModuleCoverageRow {
  id: string
  name: string
  status: 'enabled' | 'disabled' | 'experimental'
  version: string
  testCount: number
  owaspCategories: string[]
  /** Executions attributed to this module, via the finding's vulnerability type. */
  findings: number
  openFindings: number
  /** `findings / testCount`, as a percentage. */
  signalPercent: number
  lastRunAt: string | null
  runCount: number
}

function aggregate(matrix: CoverageRow[]): CoverageAggregates {
  const covered = matrix.reduce((total, row) => total + row.coveragePercent, 0)
  const weakest = matrix.reduce<CoverageRow | null>(
    (worst, row) => (worst === null || row.coveragePercent < worst.coveragePercent ? row : worst),
    null,
  )

  return {
    overallPercent:
      matrix.length === 0 ? 0 : Math.round(covered / matrix.length),
    categoriesFullyCovered: matrix.filter((row) => row.typesAvailable > 0 && row.coveragePercent === 100)
      .length,
    categoriesPartiallyCovered: matrix.filter(
      (row) => row.typesAvailable > 0 && row.coveragePercent > 0 && row.coveragePercent < 100,
    ).length,
    categoriesUntested: matrix.filter((row) => row.testsAvailable === 0).length,
    testsAvailable: matrix.reduce((total, row) => total + row.testsAvailable, 0),
    testExecutions: matrix.reduce((total, row) => total + row.testExecutions, 0),
    findings: matrix.reduce((total, row) => total + row.findings, 0),
    weakestOwaspId: weakest?.owaspId ?? null,
    weakestPercent: weakest?.coveragePercent ?? 0,
  }
}

/**
 * The vulnerability types a module owns.
 *
 * Modules and vulnerability types share an id prefix, but a module can
 * contribute tests without owning every type in its categories, so an empty
 * prefix match falls back to the categories. Exported because the module
 * register has to attribute findings exactly the way coverage does — two
 * screens disagreeing about which detection produced a finding is worse than
 * either answer being coarse.
 */
export function typeIdsForModule(data: Dataset, module: ScannerModule): Set<string> {
  const byPrefix = data.vulnerabilityTypes
    .filter((type) => type.id.startsWith(module.id))
    .map((type) => type.id)

  if (byPrefix.length > 0) return new Set(byPrefix)

  const byCategory = new Set(module.owaspCategories)
  return new Set(
    data.vulnerabilityTypes.filter((type) => byCategory.has(type.owaspId)).map((type) => type.id),
  )
}

/** Findings attributable to a module, using {@link typeIdsForModule}. */
export function findingsForModule(data: Dataset, module: ScannerModule): Finding[] {
  const typeIds = typeIdsForModule(data, module)
  return data.findings.filter((finding) => typeIds.has(finding.vulnerabilityTypeId))
}

function moduleRollup(): ModuleCoverageRow[] {
  const data = demoStore.snapshot()

  return data.modules
    .map((module) => {
      const related = findingsForModule(data, module)
      const lastScan = data.scans
        .filter((scan) => scan.moduleIds.includes(module.id))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]

      return {
        id: module.id,
        name: module.name,
        status: module.status,
        version: module.version,
        testCount: module.testCount,
        owaspCategories: module.owaspCategories,
        findings: related.length,
        openFindings: related.filter((finding) => isFindingOpen(finding.status)).length,
        signalPercent:
          module.testCount === 0 ? 0 : Math.min(100, Math.round((related.length / module.testCount) * 100)),
        lastRunAt: lastScan?.startedAt ?? null,
        runCount: data.scans.filter((scan) => scan.moduleIds.includes(module.id)).length,
      }
    })
    .sort((a, b) => b.findings - a.findings || a.name.localeCompare(b.name))
}

export const coverageService = {
  /** Full OWASP Top 10:2025 coverage matrix. */
  async matrix(params: { projectId?: string } = {}): Promise<CoverageRow[]> {
    return request(() => buildCoverageMatrix(params.projectId))
  },

  /** Matrix plus the headline numbers and the module rollup the page needs. */
  async overview(params: { projectId?: string } = {}): Promise<{
    matrix: CoverageRow[]
    aggregates: CoverageAggregates
    modules: ModuleCoverageRow[]
    projects: Array<{ id: string; name: string }>
    /** Set when the view is scoped to one project rather than the workspace. */
    scopedToProject: string | null
  }> {
    return request(() => {
      const data = demoStore.snapshot()
      const projectId = params.projectId ?? null
      const scoped = projectId ? data.projects.find((entry) => entry.id === projectId) : null

      const matrix = buildCoverageMatrix(projectId ?? undefined)

      return {
        matrix,
        aggregates: aggregate(matrix),
        modules: moduleRollup(),
        projects: data.projects.map((project) => ({ id: project.id, name: project.name })),
        scopedToProject: scoped?.id ?? null,
      }
    })
  },
}