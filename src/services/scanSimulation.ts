import type {
  AuditLogEntry,
  Finding,
  Job,
  Scan,
  ScanLogEntry,
  ScanProfile,
  ScanStatus,
  ScannerModule,
  Target,
  VerificationTask,
} from '@/types'
import {
  addSeconds,
  buildScanCounters,
  buildStages,
  createFindingsForScan,
  createRng,
  createVerificationTasks,
  DEMO_SEED,
  interpolateLogTemplate,
  paddedId,
  SCAN_ENDPOINT_SNIPPETS,
  SCAN_LOG_TEMPLATES,
  scanFingerprint,
  type Dataset,
  type Rng,
} from '@/data'
import { WORKER_HOSTS } from '@/types'
import { hostnameOf } from '@/utils/format'
import { nextAuditIndex } from '@/utils/ids'

/**
 * Scan simulation.
 *
 * A run's state is a pure function of elapsed time rather than of a background
 * timer: progress is `elapsed / total`, and elapsed comes from a persisted anchor
 * the moment the scan was first observed. That buys three things a ticking
 * interval cannot: a reload resumes mid-scan instead of restarting it, two tabs
 * agree on the same progress, and closing the app does not abandon a queued run.
 *
 * Nothing in this file touches the store. It plans changes against a dataset and
 * hands them back, so the persistence and indexing rules stay in one place.
 */

/**
 * Simulated seconds per real second.
 *
 * The profiles are sized like real engagements — 12, 38 and 96 minutes — which
 * nobody is going to sit and watch. At 12x a quick scan takes about a minute to
 * run, which is long enough to watch the pipeline walk its stages and short
 * enough that starting one is not a commitment.
 */
export const SIMULATION_SPEED = 12

/**
 * Status bands, chosen so the seeded in-flight scans keep the status they were
 * seeded with: 0% queued, 4% initializing, 23/46% running, 78% analyzing.
 */
const STATUS_BANDS: Array<{ upTo: number; status: ScanStatus }> = [
  { upTo: 0, status: 'queued' },
  { upTo: 6, status: 'initializing' },
  { upTo: 60, status: 'running' },
  { upTo: 99, status: 'analyzing' },
]

export function statusForProgress(progress: number): ScanStatus {
  for (const band of STATUS_BANDS) {
    if (progress <= band.upTo) return band.status
  }
  return 'completed'
}

export function isScanTerminal(status: ScanStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

/**
 * Deterministic generator for a scan.
 *
 * Every derived value — jittered duration, counters, log noise, which catalogue
 * templates fire — is drawn from a generator seeded by the scan id, so polling
 * the same scan twice with the same progress yields identical output instead of
 * numbers that twitch on every refresh.
 */
function rngForScan(scanId: string): Rng {
  let hash = DEMO_SEED >>> 0
  for (let index = 0; index < scanId.length; index += 1) {
    hash = Math.imul(hash ^ scanId.charCodeAt(index), 0x0100_0193) >>> 0
  }
  return createRng(hash)
}

function jitter(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Wall-clock-independent run length, in simulated seconds. */
export function simulatedTotalSeconds(profile: ScanProfile, scanId: string): number {
  return Math.round(profile.estimatedMinutes * 60 * jitter(rngForScan(scanId), 0.8, 1.35))
}

/* -------------------------------------------------------------------------- */
/* Activity log                                                                */
/* -------------------------------------------------------------------------- */

/** How far through a run each log line appears, as a fraction of 0–100. */
function logReleasePoint(order: number): number {
  return (order / SCAN_LOG_TEMPLATES.length) * 96
}

/**
 * The activity log a run has emitted so far.
 *
 * A growing prefix of the shared template list rather than a fresh sample, so
 * lines only ever appear and never change — which is what a real log tail does.
 */
function buildLiveLogs(
  scan: Scan,
  target: Target,
  progress: number,
  elapsedSeconds: number,
  endpointCount: number,
  rng: Rng,
): ScanLogEntry[] {
  const emitted = SCAN_LOG_TEMPLATES.filter((template) => progress >= logReleasePoint(template.order))

  const values = {
    host: hostnameOf(target.baseUrl),
    paths: target.scope.allowedPaths.length,
    ips: 1 + Math.floor(rng() * 3),
    tech: scanFingerprint(target),
    endpoints: Math.round(endpointCount * (progress / 100)),
    params: Math.round(endpointCount * (progress / 100) * 3),
    tests: scan.counters.testsCompleted,
    endpoint: SCAN_ENDPOINT_SNIPPETS[Math.floor(rng() * SCAN_ENDPOINT_SNIPPETS.length)] ?? '/',
    issues: 3 + Math.floor(rng() * 4),
    size: `${2 + Math.floor(rng() * 46)}k`,
    raw: scan.counters.potentialFindings + 4 + Math.floor(rng() * 18),
    findings: scan.counters.potentialFindings,
    critical: Math.round(scan.counters.potentialFindings * 0.08),
    high: Math.round(scan.counters.potentialFindings * 0.27),
  }

  return emitted.map((template, index) => {
    // Spread the released lines across the run so timestamps keep the order the
    // lines appear in, rather than bunching at the current instant.
    const releasedAt = logReleasePoint(template.order)
    const at =
      releasedAt >= progress
        ? elapsedSeconds
        : Math.round((releasedAt / Math.max(1, progress)) * elapsedSeconds)

    return {
      id: paddedId('log', index + 1, 3),
      timestamp: addSeconds(scan.startedAt, Math.max(0, at)),
      level: template.level,
      message: interpolateLogTemplate(template.message, values),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                    */
/* -------------------------------------------------------------------------- */

export interface ScanSimulationContext {
  data: Dataset
  now: Date
  /**
   * Wall-clock milliseconds at which a scan's simulated timeline began.
   *
   * `realElapsedSeconds` is how many *real* seconds into the run the scan already
   * was when it was first observed, so the store can infer an anchor that
   * preserves seeded progress instead of fast-forwarding to the end on first
   * read. Real rather than simulated, because the anchor lives on the wall clock
   * and the store has no business knowing how fast time is being faked.
   */
  anchorFor: (scanId: string, realElapsedSeconds: number) => number
}

export interface ScanSimulationUpdate {
  /** Updated scans, keyed by id. Scans absent from the map are unchanged. */
  scans: Map<string, Scan>
  findings: Finding[]
  verificationTasks: VerificationTask[]
  jobs: Job[]
  auditLog: AuditLogEntry[]
  /** Ids of the scans that reached a terminal state on this tick. */
  finished: string[]
}

function nextFindingIndex(findings: readonly Finding[]): number {
  let highest = 0
  for (const finding of findings) {
    const parsed = Number.parseInt(finding.id.replace(/\D/g, ''), 10)
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed
  }
  return highest + 1
}

function nextVerificationIndex(tasks: readonly VerificationTask[]): number {
  let highest = 0
  for (const task of tasks) {
    const parsed = Number.parseInt(task.id.replace(/\D/g, ''), 10)
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed
  }
  return highest + 1
}

function nextJobIndex(jobs: readonly Job[]): number {
  let highest = 0
  for (const job of jobs) {
    const parsed = Number.parseInt(job.id.replace(/\D/g, ''), 10)
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed
  }
  return highest + 1
}

/** The single job row a scan owns, when it has one. */
function jobForScan(jobs: readonly Job[], scanId: string): Job | undefined {
  return jobs.find((job) => job.scanId === scanId)
}

/**
 * Scanner hosts a simulated run can land on.
 *
 * Derived from `WORKER_HOSTS` rather than written out, because a worker that is
 * not in the fleet is invisible to the admin job register's worker filter and
 * cannot be reassigned to. The report host is excluded: it renders, it does not
 * scan.
 */
const WORKER_POOL = WORKER_HOSTS.filter((host) => host.startsWith('scanner-'))

/**
 * Advances every in-flight scan to where the wall clock says it should be.
 *
 * Returns `null` when nothing moved, which is the common case: a scan only
 * changes on the second boundary, so a poll that lands in the same second costs
 * a handful of comparisons and no clone.
 */
export function planScanUpdates(context: ScanSimulationContext): ScanSimulationUpdate | null {
  const { data, now } = context
  const targetById = new Map(data.targets.map((target) => [target.id, target]))
  const profileById = new Map(data.scanProfiles.map((profile) => [profile.id, profile]))
  const endpointsByTarget = new Map<string, number>()
  for (const endpoint of data.endpoints) {
    endpointsByTarget.set(endpoint.targetId, (endpointsByTarget.get(endpoint.targetId) ?? 0) + 1)
  }
  const findingsByScan = new Map<string, number>()
  for (const finding of data.findings) {
    findingsByScan.set(finding.scanId, (findingsByScan.get(finding.scanId) ?? 0) + 1)
  }

  const update: ScanSimulationUpdate = {
    scans: new Map(),
    findings: [],
    verificationTasks: [],
    jobs: [],
    auditLog: [],
    finished: [],
  }

  let findingIndex = nextFindingIndex(data.findings)
  let verificationIndex = nextVerificationIndex(data.verificationTasks)
  let jobIndex = nextJobIndex(data.jobs)
  let auditIndex = nextAuditIndex(data.auditLog)

  for (const scan of data.scans) {
    if (isScanTerminal(scan.status)) continue

    const target = targetById.get(scan.targetId)
    const profile = profileById.get(scan.profileId)
    if (!target || !profile) continue

    const totalSeconds = simulatedTotalSeconds(profile, scan.id)
    const endpointCount = endpointsByTarget.get(scan.targetId) ?? 8

    // The anchor is only consulted on the first observation of this scan, and
    // infers its start point from the progress the scan already had.
    const anchorMs = context.anchorFor(
      scan.id,
      ((scan.progress / 100) * totalSeconds) / SIMULATION_SPEED,
    )
    const elapsedSeconds = Math.max(
      0,
      Math.round(((now.getTime() - anchorMs) / 1000) * SIMULATION_SPEED),
    )

    const fraction = elapsedSeconds / totalSeconds
    const progress = Math.max(0, Math.min(100, Math.round(fraction * 100)))
    // Completion is decided in exactly one place. Deriving `finished` from the
    // fraction as well used to let a run report `completed` with a null
    // `completedAt`, because 99.6% rounds up to 100% but is not yet a full run.
    const status = statusForProgress(progress)
    const finished = status === 'completed'

    // Duration is derived from progress rather than measured separately, so a
    // scan record only changes when the progress percentage does. Without this
    // every read of the store would count as a change and rewrite the dataset.
    const durationSeconds = finished ? totalSeconds : Math.round((progress / 100) * totalSeconds)

    // Nothing observable changed on this tick.
    if (
      scan.status === status &&
      scan.progress === progress &&
      scan.durationSeconds === durationSeconds
    ) {
      continue
    }

    const rng = rngForScan(scan.id)
    const crossedAnalysis = status === 'analyzing' && scan.status !== 'analyzing'

    const counters = buildScanCounters(profile, endpointCount, status, progress, rng)
    const completedAt = finished ? addSeconds(scan.startedAt, totalSeconds) : scan.completedAt

    // Analysis produces the findings, once. The guard is the scan's own
    // finding count rather than the status transition, so a scan that is already
    // analyzing when first observed — a seeded one — does not duplicate the
    // findings the seed gave it.
    const existingFindings = findingsByScan.get(scan.id) ?? 0
    let findingCount = existingFindings
    if (crossedAnalysis && existingFindings === 0 && scan.moduleIds.length > 0) {
      const endpoints = data.endpoints.filter((endpoint) => endpoint.targetId === scan.targetId)
      const produced = createFindingsForScan(
        { ...scan, status, progress, completedAt, counters },
        target,
        endpoints,
        rng,
        { startIndex: findingIndex, ageDays: 0 },
      )

      if (produced.length > 0) {
        findingIndex += produced.length
        findingCount = produced.length
        counters.potentialFindings = produced.length
        update.findings.push(...produced)
        update.verificationTasks.push(
          ...createVerificationTasks(produced, rng, { startIndex: verificationIndex }),
        )
        verificationIndex += produced.length
        findingsByScan.set(scan.id, produced.length)
      }
    }

    const next: Scan = {
      ...scan,
      status,
      progress,
      completedAt,
      durationSeconds,
      stages: buildStages(progress, status, scan.startedAt, totalSeconds, rng),
      counters: { ...counters, potentialFindings: Math.max(counters.potentialFindings, findingCount) },
      logs: [],
      findingCount,
    }
    next.logs = buildLiveLogs(next, target, progress, elapsedSeconds, endpointCount, rng)

    update.scans.set(scan.id, next)

    // Keep the job row in step so the Stage 6 worker list never contradicts the
    // register it is describing.
    const job = jobForScan(data.jobs, scan.id)
    if (job) {
      update.jobs.push({
        ...job,
        status: finished ? 'succeeded' : 'running',
        startedAt: job.startedAt ?? scan.startedAt,
        durationSeconds,
      })
    } else if (scan.status === 'queued') {
      update.jobs.push({
        id: paddedId('job', jobIndex, 4),
        kind: 'vulnerability_analysis',
        queue: 'scans',
        status: finished ? 'succeeded' : 'running',
        scanId: scan.id,
        startedAt: scan.startedAt,
        durationSeconds,
        worker: WORKER_POOL[jobIndex % WORKER_POOL.length] ?? 'scanner-01',
      })
      jobIndex += 1
    }

    if (finished) {
      update.finished.push(scan.id)
      update.auditLog.push({
        id: paddedId('aud', auditIndex, 5),
        timestamp: completedAt ?? now.toISOString(),
        actor: scan.initiatedBy,
        action: 'scan.completed',
        entity: 'scan',
        entityId: scan.id,
        ipAddress: '10.20.4.18',
        outcome: 'success',
      })
      auditIndex += 1
    }
  }

  if (
    update.scans.size === 0 &&
    update.findings.length === 0 &&
    update.jobs.length === 0 &&
    update.auditLog.length === 0
  ) {
    return null
  }

  return update
}

/* -------------------------------------------------------------------------- */
/* Module execution                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Window of the run during which modules execute.
 *
 * Crawling and reporting bracket the testing work, so modules are laid across
 * the middle of the run rather than the whole thing.
 */
const MODULE_WINDOW = { start: 20, end: 95 }

export type ModuleRunState = 'pending' | 'running' | 'done'

export interface ModuleRun {
  id: string
  name: string
  slug: string
  category: string
  testCount: number
  owaspCategories: string[]
  state: ModuleRunState
  progress: number
  /** How far through its own test set the module is. */
  testsCompleted: number
}

/** Per-module progress for a run, derived from overall progress. */
export function moduleRuns(
  moduleIds: readonly string[],
  modules: readonly ScannerModule[],
  progress: number,
  status: ScanStatus,
): ModuleRun[] {
  const byId = new Map(modules.map((module) => [module.id, module]))
  const window = MODULE_WINDOW.end - MODULE_WINDOW.start
  const span = window / Math.max(1, moduleIds.length)

  return moduleIds.map((moduleId, index) => {
    const module = byId.get(moduleId)
    const start = MODULE_WINDOW.start + index * span
    const share = Math.max(0, Math.min(1, (progress - start) / span))
    const state: ModuleRunState =
      status === 'completed' || progress >= start + span
        ? 'done'
        : share > 0
          ? 'running'
          : 'pending'

    return {
      id: moduleId,
      name: module?.name ?? moduleId,
      slug: module?.slug ?? moduleId,
      category: module?.category ?? 'Unknown',
      testCount: module?.testCount ?? 0,
      owaspCategories: module?.owaspCategories ?? [],
      state,
      progress: state === 'done' ? 100 : Math.round(share * 100),
      testsCompleted: Math.round((module?.testCount ?? 0) * (state === 'done' ? 1 : share)),
    }
  })
}
