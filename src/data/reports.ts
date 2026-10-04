import type {
  AuditLogEntry,
  Finding,
  FindingStatus,
  Job,
  JobStatus,
  Project,
  Report,
  ReportFormat,
  Scan,
  ScanQueue,
  Target,
} from '@/types'
import { chance, isoAgo, paddedId, pick, pickWeighted, randomInt, type Rng } from './seed'

/**
 * Generated deliverables.
 *
 * A report is always tied to a project, and optionally to the exact target and
 * scan it was produced from. `outdated` reports are the interesting case: a
 * newer scan of the same target has landed since the report was produced, which
 * is what the "regenerate" affordance on the reports list exists to handle.
 */

/**
 * Statuses a client-facing report may quote.
 *
 * `potential` findings are deliberately excluded: an unverified signal does not
 * belong in a deliverable, and `fixed` ones are only relevant to a retest report
 * as history. `needs_retest` is included because the remediation claim is still
 * outstanding, which is exactly what the client needs to see.
 */
export const REPORTABLE_FINDING_STATUSES: readonly FindingStatus[] = [
  'confirmed',
  'open',
  'needs_retest',
]

/**
 * How far apart two scans must be before the later one makes a report stale.
 *
 * A rescan the next morning is a rerun, not new ground; a report from it is
 * still the best description of the estate. Three days is the line where we are
 * willing to tell a client their report no longer reflects the target.
 */
export const MATERIAL_NEWER_SCAN_GAP_DAYS = 3

const NAME_TEMPLATES = [
  'VAPT Assessment Report',
  'Penetration Test Report',
  'Web Application Security Assessment',
  'API Security Assessment Report',
  'Retest and Verification Report',
  'Red Team Exercise Report',
  'OWASP Coverage and Findings Report',
] as const

const SUFFIXES = [
  'Initial Report',
  'Draft for Review',
  'Final Report',
  'Remediation Verification',
  'Management Summary',
  'Technical Findings Appendix',
] as const

const FORMATS: ReportFormat[] = ['pdf', 'pdf', 'pdf', 'html', 'docx', 'markdown']

export function createReports(
  projects: readonly Project[],
  targets: readonly Target[],
  scans: readonly Scan[],
  findings: readonly Finding[],
  rng: Rng,
): Report[] {
  const targetById = new Map(targets.map((target) => [target.id, target]))
  const completedScans = scans.filter((scan) => scan.status === 'completed')
  if (completedScans.length === 0) return []

  const reports: Report[] = []
  const count = 24
  let index = 1

  for (let i = 0; i < count; i += 1) {
    const scan = pick(rng, completedScans)
    const target = targetById.get(scan.targetId)
    if (!target) continue

    const project = projects.find((entry) => entry.id === scan.projectId)
        const generatedAt = scan.completedAt ?? scan.startedAt

    // Some reports cover the whole project rather than a single target.
    const projectWide = chance(rng, 0.3)
    const format = pick(rng, FORMATS)

    // A report is only "outdated" when a materially newer scan of the same
    // target has landed since it was produced.
    const newerScanGapDays = completedScans
      .filter((other) => other.targetId === target.id)
      .map((other) => (new Date(other.startedAt).getTime() - new Date(generatedAt).getTime()) / 86_400_000)
      .filter((gap) => gap > MATERIAL_NEWER_SCAN_GAP_DAYS)
      .sort((a, b) => a - b)[0]

    const status: Report['status'] = chance(rng, 0.05)
      ? 'failed'
      : chance(rng, 0.04)
        ? 'generating'
        : newerScanGapDays !== undefined && chance(rng, 0.32)
          ? 'outdated'
          : 'ready'

    const includedTargets = projectWide
      ? targets.filter((entry) => entry.projectId === scan.projectId)
      : [target]

    const reportFindings = findings.filter((finding) =>
      includedTargets.some((entry) => entry.id === finding.targetId),
    )
    const reportable = reportFindings.filter((finding) =>
      REPORTABLE_FINDING_STATUSES.includes(finding.status),
    )

    const projectLabel = project ? project.client.replace(/\s+(Group|Group)$/, '') : 'Client'

    reports.push({
      id: paddedId('rpt', index, 3),
      name: `${projectLabel} — ${pick(rng, NAME_TEMPLATES)}${chance(rng, 0.5) ? ` — ${pick(rng, SUFFIXES)}` : ''}`,
      projectId: scan.projectId,
      targetId: projectWide ? null : target.id,
      scanId: projectWide ? null : scan.id,
      format,
      status,
      generatedAt: status === 'generating' ? null : generatedAt,
      // Same rule the service applies, so the register never contradicts the
      // preview: a target report counts what is reportable on that target now.
      findingCount: reportable.length,
      createdBy: pick(rng, ['usr-001', 'usr-002', 'usr-003']),
      version: randomInt(rng, 1, 3),
    })
    index += 1
  }

  return reports
}

/* -------------------------------------------------------------------------- */
/* Background jobs                                                             */
/* -------------------------------------------------------------------------- */

const WORKERS = ['scanner-01', 'scanner-02', 'scanner-03', 'analyst-01', 'report-01'] as const

const JOB_KINDS: ReadonlyArray<{ kind: string; queue: ScanQueue; scanLinked: boolean }> = [
  { kind: 'crawl', queue: 'scans', scanLinked: true },
  { kind: 'fingerprint', queue: 'scans', scanLinked: true },
  { kind: 'vulnerability_analysis', queue: 'scans', scanLinked: true },
  { kind: 'evidence_capture', queue: 'scans', scanLinked: true },
  { kind: 'finding_deduplication', queue: 'analysis', scanLinked: true },
  { kind: 'coverage_recalculation', queue: 'analysis', scanLinked: true },
  { kind: 'report_render', queue: 'reporting', scanLinked: false },
  { kind: 'report_render', queue: 'reporting', scanLinked: false },
  { kind: 'owasp_rollup', queue: 'reporting', scanLinked: false },
  { kind: 'webhook_delivery', queue: 'notifications', scanLinked: false },
  { kind: 'artifact_cleanup', queue: 'maintenance', scanLinked: false },
]

export function createJobs(scans: readonly Scan[], rng: Rng): Job[] {
  const scannable = scans.filter((scan) => scan.status !== 'queued')
  const jobs: Job[] = []
  const count = 30
  let index = 1

  for (let i = 0; i < count; i += 1) {
    const spec = pick(rng, JOB_KINDS)
    const scan = spec.scanLinked && scannable.length > 0 ? pick(rng, scannable) : undefined

    const roll = rng()
    const status: JobStatus =
      roll < 0.1
        ? 'queued'
        : roll < 0.2
          ? 'running'
          : roll < 0.28
            ? 'failed'
            : roll < 0.32
              ? 'cancelled'
              : 'succeeded'

    const startedAt =
      status === 'queued'
        ? null
        : isoAgo(randomInt(rng, 0, 12), randomInt(rng, 0, 23), randomInt(rng, 0, 59))

    jobs.push({
      id: paddedId('job', index, 4),
      kind: spec.kind,
      queue: spec.queue,
      status,
      scanId: spec.scanLinked ? (scan?.id ?? null) : null,
      startedAt,
      durationSeconds: startedAt ? (status === 'running' ? randomInt(rng, 20, 300) : randomInt(rng, 4, 1500)) : 0,
      worker: pickWeightedWorker(rng),
    })
    index += 1
  }

  return jobs
}

function pickWeightedWorker(rng: Rng): string {
  const roll = rng()
  if (roll < 0.3) return WORKERS[0] ?? 'scanner-01'
  if (roll < 0.5) return WORKERS[1] ?? 'scanner-02'
  if (roll < 0.65) return WORKERS[2] ?? 'scanner-03'
  if (roll < 0.85) return WORKERS[3] ?? 'analyst-01'
  return WORKERS[4] ?? 'report-01'
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                   */
/* -------------------------------------------------------------------------- */

interface AuditSeed {
  action: string
  entity: string
  outcome: 'success' | 'failure'
}

const AUDIT_SEEDS: AuditSeed[] = [
  { action: 'auth.login', entity: 'session', outcome: 'success' },
  { action: 'auth.login', entity: 'session', outcome: 'success' },
  { action: 'auth.login', entity: 'session', outcome: 'failure' },
  { action: 'auth.logout', entity: 'session', outcome: 'success' },
  { action: 'auth.mfa_challenge', entity: 'session', outcome: 'success' },
  { action: 'project.create', entity: 'project', outcome: 'success' },
  { action: 'project.update', entity: 'project', outcome: 'success' },
  { action: 'project.archive', entity: 'project', outcome: 'success' },
  { action: 'target.create', entity: 'target', outcome: 'success' },
  { action: 'target.update_scope', entity: 'target', outcome: 'success' },
  { action: 'target.authorisation_confirmed', entity: 'target', outcome: 'success' },
  { action: 'scan.initiate', entity: 'scan', outcome: 'success' },
  { action: 'scan.cancel', entity: 'scan', outcome: 'success' },
  { action: 'scan.complete', entity: 'scan', outcome: 'success' },
  { action: 'scan.fail', entity: 'scan', outcome: 'failure' },
  { action: 'finding.status_change', entity: 'finding', outcome: 'success' },
  { action: 'finding.assign', entity: 'finding', outcome: 'success' },
  { action: 'finding.bulk_update', entity: 'finding', outcome: 'success' },
  { action: 'verification.decide', entity: 'verification_task', outcome: 'success' },
  { action: 'verification.reopen', entity: 'verification_task', outcome: 'success' },
  { action: 'report.generate', entity: 'report', outcome: 'success' },
  { action: 'report.download', entity: 'report', outcome: 'success' },
  { action: 'report.failed', entity: 'report', outcome: 'failure' },
  { action: 'module.toggle', entity: 'module', outcome: 'success' },
  { action: 'user.invite', entity: 'user', outcome: 'success' },
  { action: 'user.role_change', entity: 'user', outcome: 'success' },
  { action: 'settings.update', entity: 'workspace', outcome: 'success' },
  { action: 'api_key.rotate', entity: 'credential', outcome: 'success' },
  { action: 'webhook.test', entity: 'webhook', outcome: 'failure' },
]

const SOURCE_IPS = [
  '10.42.8.17',
  '10.42.8.24',
  '10.42.9.6',
  '203.0.113.41',
  '198.51.100.87',
  '198.51.100.92',
  '192.0.2.55',
] as const

const ACTORS = ['usr-001', 'usr-002', 'usr-003', 'usr-004', 'usr-005', 'usr-006', 'usr-007'] as const

export function createAuditLog(
  projects: readonly Project[],
  targets: readonly Target[],
  scans: readonly Scan[],
  findings: readonly Finding[],
  reports: readonly Report[],
  rng: Rng,
): AuditLogEntry[] {
  const entries: AuditLogEntry[] = []
  const count = 60

  const idsFor = (entity: string): string => {
    switch (entity) {
      case 'project':
        return projects[randomInt(rng, 0, Math.max(0, projects.length - 1))]?.id ?? 'prj-001'
      case 'target':
        return targets[randomInt(rng, 0, Math.max(0, targets.length - 1))]?.id ?? 'tgt-001'
      case 'scan':
        return scans[randomInt(rng, 0, Math.max(0, scans.length - 1))]?.id ?? 'scn-0001'
      case 'finding':
        return findings[randomInt(rng, 0, Math.max(0, findings.length - 1))]?.id ?? 'fnd-0001'
      case 'report':
        return reports[randomInt(rng, 0, Math.max(0, reports.length - 1))]?.id ?? 'rpt-001'
      case 'user':
        return `usr-${String(randomInt(rng, 1, 9)).padStart(3, '0')}`
      case 'verification_task':
        return `ver-${String(randomInt(rng, 1, 12)).padStart(3, '0')}`
      case 'module':
        return `mod-${String(randomInt(rng, 1, 14)).padStart(3, '0')}`
      default:
        return 'org-001'
    }
  }

  for (let i = 0; i < count; i += 1) {
    const seed = pickWeighted(
      rng,
      AUDIT_SEEDS,
      AUDIT_SEEDS.map((entry) => {
        switch (entry.action) {
          case 'auth.login':
            return entry.outcome === 'failure' ? 2 : 8
          case 'scan.initiate':
            return 7
          case 'finding.status_change':
          case 'finding.assign':
            return 6
          case 'report.generate':
          case 'report.download':
            return 4
          case 'scan.complete':
            return 5
          default:
            return 2
        }
      }),
    )

    entries.push({
      id: paddedId('aud', i + 1, 4),
      timestamp: isoAgo(
        randomInt(rng, 0, 21),
        randomInt(rng, 0, 23),
        randomInt(rng, 0, 59),
        18,
        rng,
      ),
      actor: pick(rng, ACTORS),
      action: seed.action,
      entity: seed.entity,
      entityId: idsFor(seed.entity),
      ipAddress: pick(rng, SOURCE_IPS),
      outcome: seed.outcome,
    })
  }

  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return entries
}
