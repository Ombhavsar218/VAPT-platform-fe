import type { Project, Scan, ScanCounters, ScanLogEntry, ScanProfile, ScanStage, ScanStatus, Target } from '@/types'
import {
  addSeconds,
  chance,
  isoAgo,
  NOW,
  paddedId,
  pick,
  pickMany,
  pickWeighted,
  randomInt,
  secondsBetween,
  type Rng,
} from './seed'

/**
 * Scan history.
 *
 * A small number of scans are deliberately left in flight so the dashboard, the
 * navigation badge and the worker list all have live work to render. The rest
 * cover a five-month window so the trend charts and scan comparison have real
 * depth behind them.
 */

export interface StageDefinition {
  name: string
  /** Share of total scan progress this stage accounts for. */
  weight: number
}

export const SCAN_STAGE_DEFINITIONS: StageDefinition[] = [
  { name: 'Reconnaissance', weight: 8 },
  { name: 'Endpoint discovery', weight: 22 },
  { name: 'Vulnerability analysis', weight: 40 },
  { name: 'Exploitation validation', weight: 15 },
  { name: 'Deduplication and scoring', weight: 8 },
  { name: 'Report assembly', weight: 7 },
]

/**
 * Stage timeline for a given overall progress.
 *
 * Exported because the Stage 3 simulator re-derives stages for in-flight scans:
 * a live scan has no pre-baked timeline, so this is the single place that knows
 * how 62% of overall progress maps onto individual stages.
 */
export function buildStages(
  progress: number,
  status: ScanStatus,
  startedAt: string,
  totalSeconds: number,
  rng: Rng,
): ScanStage[] {
  let consumed = 0

  const at = (percent: number) => addSeconds(startedAt, Math.round((percent / 100) * totalSeconds))

  return SCAN_STAGE_DEFINITIONS.map((definition, index) => {
    const start = consumed * 100
    consumed += definition.weight
    const end = consumed * 100

    let state: ScanStage['state'] = 'pending'
    let stageProgress = 0
    let stageStartedAt: string | null = null
    let stageCompletedAt: string | null = null

    if (status === 'completed') {
      state = 'done'
      stageProgress = 100
      stageStartedAt = at(start)
      stageCompletedAt = at(end)
    } else if (status === 'failed' || status === 'cancelled') {
      const failingStage = 3
      if (index < failingStage) {
        state = 'done'
        stageProgress = 100
        stageStartedAt = at(start)
        stageCompletedAt = at(end)
      } else if (index === failingStage) {
        state = status === 'failed' ? 'failed' : 'skipped'
        stageProgress = status === 'failed' ? randomInt(rng, 15, 60) : 0
        stageStartedAt = at(start)
        stageCompletedAt = status === 'failed' ? at(start + (end - start) * 0.5) : null
      } else {
        state = 'skipped'
      }
    } else if (progress >= end) {
      state = 'done'
      stageProgress = 100
      stageStartedAt = at(start)
      stageCompletedAt = at(end)
    } else if (progress > start) {
      state = 'active'
      stageProgress = Math.round(((progress - start) / definition.weight) * 100)
      stageStartedAt = at(start)
    } else {
      state = 'pending'
    }

    return {
      id: `stg-${index + 1}`,
      name: definition.name,
      state,
      progress: Math.max(0, Math.min(100, stageProgress)),
      startedAt: stageStartedAt,
      completedAt: stageCompletedAt,
    }
  })
}

/**
 * The scanner's activity log vocabulary, in pipeline order.
 *
 * Exported for the Stage 3 simulator: a live scan emits a growing prefix of this
 * list as it progresses, so the messages a user watches arrive are the same ones
 * the seeded history is made of.
 */
export const SCAN_LOG_TEMPLATES: Array<{ level: ScanLogEntry['level']; order: number; message: string }> = [
  { level: 'info', order: 1, message: 'Authorisation scope validated for {host} — 1 host, {paths} path rules' },
  { level: 'success', order: 2, message: 'DNS resolution complete — {ips} addresses, TLS 1.3 negotiated' },
  { level: 'info', order: 3, message: 'Crawler initialised with 24 concurrent workers, politeness delay 150ms' },
  { level: 'info', order: 4, message: 'Technology fingerprint confirmed: {tech}' },
  { level: 'success', order: 5, message: 'Discovered {endpoints} endpoints and {params} parameters' },
  { level: 'info', order: 6, message: 'Injecting probe set: {tests} tests across {endpoints} endpoints' },
  { level: 'warning', order: 7, message: 'Rate limit response (HTTP 429) received — request rate reduced to 4/s' },
  { level: 'info', order: 8, message: 'Blind timing differential observed on a parameterised endpoint, running confirmation samples' },
  { level: 'success', order: 9, message: 'Confirmed issue on {endpoint} — evidence captured ({size} bytes)' },
  { level: 'info', order: 10, message: 'Access control probe returned a record outside the test account scope' },
  { level: 'warning', order: 11, message: 'Response header audit completed with {issues} absent headers' },
  { level: 'error', order: 12, message: 'Connection reset by peer on {endpoint} after 3 retries — request skipped' },
  { level: 'info', order: 13, message: 'Deduplication pass complete — {raw} raw signals collapsed to {findings} findings' },
  { level: 'success', order: 14, message: 'Risk scoring complete, {critical} critical and {high} high findings recorded' },
]

/** Fills `{placeholder}` tokens in a log template. */
export function interpolateLogTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

function buildLogs(
  scan: Pick<Scan, 'status' | 'progress' | 'targetId'>,
  target: Target,
  counters: ScanCounters,
  startedAt: string,
  totalSeconds: number,
  endpointCount: number,
  rng: Rng,
): ScanLogEntry[] {
  const host = hostOf(target.baseUrl)
  const technologies = fingerprintFor(target)
  const count = scan.status === 'completed' ? randomInt(rng, 9, 14) : randomInt(rng, 3, 6)

  // A real scanner emits events in pipeline order, and never repeats itself, so
  // the selection is drawn without replacement and sorted back into sequence.
  const selected = pickMany(rng, SCAN_LOG_TEMPLATES, count).sort((a, b) => a.order - b.order)

  return selected.map((template, index) => {
    const message = interpolateLogTemplate(template.message, {
      host,
      paths: target.scope.allowedPaths.length,
      ips: randomInt(rng, 1, 4),
      tech: technologies,
      endpoints: endpointCount,
      params: counters.parametersDiscovered,
      tests: counters.testsCompleted,
      endpoint: pick(rng, ENDPOINT_SNIPPETS),
      issues: randomInt(rng, 3, 7),
      size: `${randomInt(rng, 2, 48)}k`,
      raw: counters.potentialFindings + randomInt(rng, 4, 22),
      findings: counters.potentialFindings,
      critical: Math.max(0, Math.round(counters.potentialFindings * 0.08)),
      high: Math.max(0, Math.round(counters.potentialFindings * 0.27)),
    })

    const fraction = (index + 1) / selected.length
    return {
      id: paddedId('log', index + 1, 3),
      timestamp: addSeconds(startedAt, Math.round(fraction * totalSeconds * 0.94)),
      level: template.level,
      message,
    }
  })
}

const ENDPOINT_SNIPPETS = [
  '/api/orders?id=15',
  '/api/user/profile',
  '/api/import/url',
  '/search?q=widget',
  '/api/files/download?path=invoice.pdf',
  '/api/admin/users',
  '/api/checkout',
  '/api/documents/8812',
]

/** Exported so a live scan logs the same stack fingerprint as a seeded one. */
export const SCAN_ENDPOINT_SNIPPETS: string[] = ENDPOINT_SNIPPETS

const FINGERPRINTS: Record<string, string> = {
  'web_application': 'nginx, React 18.3.1, Express 4.17.3',
  api: 'nginx, Spring Boot 2.7.18, PostgreSQL 14.15',
  web_service: 'nginx, Keycloak 24.0.4, Kubernetes 1.29.6',
}

export function scanFingerprint(target: Target): string {
  return FINGERPRINTS[target.type] ?? 'nginx, unknown application stack'
}

function fingerprintFor(target: Target): string {
  return scanFingerprint(target)
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * Work counters implied by a given progress.
 *
 * Exported because the live scan page shows counters climbing while a run is in
 * progress; they have to scale the same way the seeded history does or the two
 * halves of the register would disagree about what a 40% scan has tested.
 */
export function buildScanCounters(
  profile: ScanProfile,
  endpointCount: number,
  status: ScanStatus,
  progress: number,
  rng: Rng,
): ScanCounters {
  const factor = status === 'completed' ? 1 : progress / 100
  const requestsPerEndpoint = profile.intensity === 'thorough' ? 190 : profile.intensity === 'balanced' ? 96 : 42

  const endpointsDiscovered = Math.round(endpointCount * factor)
  const parametersDiscovered = Math.round(endpointsDiscovered * randomFloat(rng, 1.8, 4.4))
  const requestsTested = Math.round(endpointsDiscovered * requestsPerEndpoint * randomFloat(rng, 0.85, 1.15))
  const testsCompleted = Math.round(requestsTested * randomFloat(rng, 0.42, 0.66))
  const potentialFindings = Math.round(testsCompleted * randomFloat(rng, 0.004, 0.018))

  return {
    endpointsDiscovered,
    parametersDiscovered,
    requestsTested,
    testsCompleted,
    potentialFindings,
  }
}

function randomFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** The in-flight scans, ordered so the workspace looks actively used. */
interface LivePlan {
  status: ScanStatus
  progress: number
  minutesAgo: number
}

const LIVE_PLAN: LivePlan[] = [
  { status: 'analyzing', progress: 78, minutesAgo: 41 },
  { status: 'running', progress: 46, minutesAgo: 9 },
  { status: 'running', progress: 23, minutesAgo: 3 },
  { status: 'initializing', progress: 4, minutesAgo: 1 },
  { status: 'queued', progress: 0, minutesAgo: 0 },
  { status: 'queued', progress: 0, minutesAgo: 0 },
]

const TERMINAL_STATUSES: ScanStatus[] = ['failed', 'failed', 'cancelled', 'cancelled']

export function createScans(
  projects: readonly Project[],
  targets: readonly Target[],
  profiles: readonly ScanProfile[],
  endpointCountByTarget: ReadonlyMap<string, number>,
  rng: Rng,
): Scan[] {
  // An unauthorised target has never been scanned, which is the whole point of
  // the authorisation gate: the history must not contradict it.
  const scannable = targets.filter(
    (target) => target.projectId !== null && target.scope.authorizationConfirmed,
  )
  if (scannable.length === 0) return []

  const byProject = new Map<string, Target[]>()
  for (const target of scannable) {
    const projectId = target.projectId
    if (!projectId) continue
    const bucket = byProject.get(projectId) ?? []
    bucket.push(target)
    byProject.set(projectId, bucket)
  }

  const projectById = new Map(projects.map((project) => [project.id, project]))
  const scans: Scan[] = []
  const sequenceByTarget = new Map<string, number>()
  let index = 1

  const pushScan = (
    target: Target,
    profile: ScanProfile,
    status: ScanStatus,
    progress: number,
    startedAt: string,
  ) => {
    const sequence = (sequenceByTarget.get(target.id) ?? 0) + 1
    sequenceByTarget.set(target.id, sequence)

    const endpointCount = endpointCountByTarget.get(target.id) ?? 8
    const counters = buildScanCounters(profile, endpointCount, status, progress, rng)
    const totalSeconds = Math.round(profile.estimatedMinutes * 60 * randomFloat(rng, 0.8, 1.35))

    // A run may drop individual modules, so the record of what executed is not
    // simply the profile's default list.
    const moduleIds =
      chance(rng, 0.35) && profile.moduleIds.length > 2
        ? pickMany(rng, profile.moduleIds, profile.moduleIds.length - randomInt(rng, 1, 3))
        : [...profile.moduleIds]

    const isTerminal = status === 'completed' || status === 'failed'
    const completedAt = isTerminal ? addSeconds(startedAt, totalSeconds) : null
    const durationSeconds = isTerminal ? totalSeconds : secondsBetween(startedAt, NOW.toISOString())

    scans.push({
      id: paddedId('scn', index, 4),
      sequence,
      projectId: target.projectId ?? '',
      targetId: target.id,
      profileId: profile.id,
      moduleIds: [...moduleIds].sort(),
      initiatedBy: pick(rng, ['usr-001', 'usr-002', 'usr-003', 'usr-004', 'usr-006']),
      status,
      progress,
      startedAt,
      completedAt,
      durationSeconds,
      stages: buildStages(progress, status, startedAt, totalSeconds, rng),
      counters,
      logs: buildLogs(
        { status, progress, targetId: target.id },
        target,
        counters,
        startedAt,
        totalSeconds,
        endpointCount,
        rng,
      ),
      findingCount: 0,
    })
    index += 1
  }

  // Historical scans, spread across the five-month window.
  const historicalStatuses: ScanStatus[] = Array.from({ length: 54 }, () => 'completed' as ScanStatus)
  historicalStatuses.push(...TERMINAL_STATUSES)

  for (const status of historicalStatuses) {
    const target = pick(rng, scannable)
    const project = projectById.get(target.projectId ?? '')
    const profile = pickWeighted(
      rng,
      profiles,
      profiles.map((entry) => (entry.id === 'standard' ? 5 : entry.id === 'full' ? 2 : 2)),
    )

    // Recent engagements get a recent scan history; older ones spread further back.
    const maxAgeDays = project?.status === 'completed' ? randomInt(rng, 70, 160) : randomInt(rng, 1, 60)
    const startedAt = isoAgo(maxAgeDays, randomInt(rng, 0, 23), randomInt(rng, 0, 59), 0, rng)

    const progress =
      status === 'completed' ? 100 : status === 'failed' ? randomInt(rng, 45, 88) : randomInt(rng, 20, 70)
    pushScan(target, profile, status, progress, startedAt)
  }

  // Live scans, placed on targets from the most recently active projects.
  const activeProjectIds = new Set(
    projects.filter((project) => project.status === 'active').map((project) => project.id),
  )
  const livePool = scannable.filter((target) => target.projectId && activeProjectIds.has(target.projectId))

  for (const plan of LIVE_PLAN) {
    const target = pick(rng, livePool.length > 0 ? livePool : scannable)
    const profile = pickWeighted(rng, profiles, [2, 5, 3])
    const startedAt = isoAgo(0, 0, plan.minutesAgo)
    pushScan(target, profile, plan.status, plan.progress, startedAt)
  }

  return scans
}
