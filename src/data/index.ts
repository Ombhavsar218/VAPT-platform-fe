import type {
  AuditLogEntry,
  Endpoint,
  Finding,
  Job,
  ModuleDeployment,
  Organization,
  Project,
  Report,
  Scan,
  ScanProfile,
  ScannerModule,
  Target,
  Technology,
  User,
  VerificationTask,
  VulnerabilityType,
  WorkspaceSettings,
} from '@/types'

import { VULN_CATALOGUE } from './catalog'
import { createFindings, createVerificationTasks } from './findings'
import { createProjects } from './projects'
import { createAuditLog, createJobs, createReports } from './reports'
import { createModules, createScanProfiles } from './scanner'
import { createScans } from './scans'
import { createRng } from './seed'
import { createEndpoints, createTargets, createTechnologies } from './targets'
import { createUsers, ORGANIZATIONS } from './users'
import { createModuleDeployments, createWorkspaceSettings } from './workspace'

/**
 * Assembles the complete demo dataset.
 *
 * Generation order is part of the contract: the RNG is seeded once and consumed
 * in a fixed sequence, so any change to an earlier generator shifts everything
 * after it. The store caches the result in `localStorage` and only regenerates
 * when `SEED_VERSION` changes or the user resets the workspace.
 */

/**
 * Bumped to 2 in Stage 2: `ScannerModule` gained `owaspCategories` and the
 * catalogue added A06/A08 templates, so a v1 payload persisted in a browser
 * would otherwise survive with the old shape and the old evidence bodies.
 *
 * Bumped to 3 in Stage 3: `Scan` gained `moduleIds`, so the wizard's module
 * selection and "re-run" have something to read back.
 *
 * Bumped to 4 in Stage 6: added `moduleDeployments` and `workspaceSettings`.
 * Both are generated *after* every existing generator so the RNG sequence — and
 * therefore every project, target, scan and finding — is byte-identical to v3.
 */
export const SEED_VERSION = 4
export const DEMO_SEED = 20260926

export interface Dataset {
  organizations: Organization[]
  users: User[]
  projects: Project[]
  targets: Target[]
  /** Technology fingerprint keyed by target id. */
  technologies: Record<string, Technology[]>
  endpoints: Endpoint[]
  scanProfiles: ScanProfile[]
  modules: ScannerModule[]
  vulnerabilityTypes: VulnerabilityType[]
  scans: Scan[]
  findings: Finding[]
  verificationTasks: VerificationTask[]
  reports: Report[]
  jobs: Job[]
  auditLog: AuditLogEntry[]
  /** Per-host install state for each detection module. */
  moduleDeployments: ModuleDeployment[]
  workspaceSettings: WorkspaceSettings
}

export function createSeedData(seed: number = DEMO_SEED): Dataset {
  const rng = createRng(seed)

  const users = createUsers()
  const projects = createProjects()
  const projectIds = projects.map((project) => project.id)

  const targets = createTargets(projectIds, rng)
  const technologies = createTechnologies(targets, rng)
  const endpoints = createEndpoints(targets, rng)

  const modules = createModules()
  const scanProfiles = createScanProfiles(modules)

  const endpointCountByTarget = new Map<string, number>()
  for (const endpoint of endpoints) {
    endpointCountByTarget.set(endpoint.targetId, (endpointCountByTarget.get(endpoint.targetId) ?? 0) + 1)
  }

  const scans = createScans(projects, targets, scanProfiles, endpointCountByTarget, rng)
  const findings = createFindings(scans, targets, endpoints, rng)

  // Keep the scan counters honest: the register is the source of truth.
  const findingsByScan = new Map<string, number>()
  for (const finding of findings) {
    findingsByScan.set(finding.scanId, (findingsByScan.get(finding.scanId) ?? 0) + 1)
  }
  for (const scan of scans) {
    scan.findingCount = findingsByScan.get(scan.id) ?? 0
    scan.counters.potentialFindings = scan.findingCount
  }

  const verificationTasks = createVerificationTasks(findings, rng)
  const reports = createReports(projects, targets, scans, findings, rng)
  const jobs = createJobs(scans, rng)
  const auditLog = createAuditLog(projects, targets, scans, findings, reports, rng)

  // Stage 6 additions come last so the generators above keep their exact RNG
  // sequence: bumping the seed version must not reshuffle earlier data.
  const moduleDeployments = createModuleDeployments(modules, rng)
  const workspaceSettings = createWorkspaceSettings(ORGANIZATIONS[0]?.id ?? 'org-001')

  return {
    organizations: ORGANIZATIONS,
    users,
    projects,
    targets,
    technologies,
    endpoints,
    scanProfiles,
    modules,
    vulnerabilityTypes: VULN_CATALOGUE,
    scans,
    findings,
    verificationTasks,
    reports,
    jobs,
    auditLog,
    moduleDeployments,
    workspaceSettings,
  }
}

export * from './catalog'
export * from './findings'
export * from './owasp'
export * from './projects'
export * from './reports'
export * from './scanner'
export * from './scans'
export * from './seed'
export * from './targets'
export * from './users'
export * from './workspace'
