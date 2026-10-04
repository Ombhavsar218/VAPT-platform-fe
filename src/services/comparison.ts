import type {
  ComparisonPoint,
  ComparisonSeverityBucket,
  Finding,
  Scan,
  ScanComparison,
  Severity,
} from '@/types'
import { SEVERITIES } from '@/types'
import { isFindingOpen, riskScoreFrom, severityCountsOf } from '@/utils/severity'

import { demoStore } from './store'
import { ApiError, notFound, request } from './transport'

/**
 * Scan comparison (`/scans/compare`).
 *
 * Answers the only question a rescan is run for: did anything get better? The
 * two runs are matched on a fingerprint rather than on ids, because every scan
 * produces fresh finding rows - `fnd-0412` in the March run has no relationship
 * to `fnd-1187` in the June one except that they describe the same flaw at the
 * same place. Without the fingerprint every comparison would report every
 * finding as new.
 *
 * A fingerprint of vulnerability type + endpoint + method + parameter is
 * deliberately coarse in one respect: it treats a repeated occurrence of the
 * same flaw as the same finding, which is what a client means when they ask
 * "is the SQL injection still there".
 */

/* -------------------------------------------------------------------------- */
/* Fingerprints                                                                */
/* -------------------------------------------------------------------------- */

function fingerprint(finding: Finding): string {
  return [
    finding.vulnerabilityTypeId,
    finding.endpoint,
    finding.httpMethod,
    finding.parameter ?? '',
  ].join('|')
}

function indexByFingerprint(findings: readonly Finding[]): Map<string, Finding> {
  // First wins, so a duplicate occurrence inside one scan is counted once.
  const index = new Map<string, Finding>()
  for (const finding of findings) {
    const key = fingerprint(finding)
    if (!index.has(key)) index.set(key, finding)
  }
  return index
}

/**
 * A finding is closed when a human has ruled on it and it did not survive.
 * `fixed` is the remediation case; `false_positive` is the case where the tool
 * was wrong, which is why a later detection of the same fingerprint is a
 * *reopen* rather than a new issue.
 */
function isClosed(finding: Finding): boolean {
  return finding.status === 'fixed' || finding.status === 'false_positive'
}

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

export interface CompareTargetOption {
  targetId: string
  targetName: string
  baseUrl: string
  /** Completed runs in order, oldest first, so the picker reads chronologically. */
  scans: Array<{
    id: string
    sequence: number
    label: string
    completedAt: string | null
    findingCount: number
    openFindings: number
  }>
}

export interface CompareScanOption {
  id: string
  targetId: string
  targetName: string
  label: string
  sequence: number
  completedAt: string | null
  findingCount: number
}

export interface ScanComparisonSummary {
  id: string
  sequence: number
  label: string
  profileName: string
  completedAt: string | null
  startedAt: string
  moduleCount: number
  findingCount: number
  openFindings: number
  riskScore: number
}

/* -------------------------------------------------------------------------- */
/* Read model                                                                  */
/* -------------------------------------------------------------------------- */

export interface ComparedFinding {
  findingId: string
  title: string
  severity: Severity
  status: Finding['status']
  owaspId: string
  cweId: string
  endpoint: string
  httpMethod: string
  parameter: string | null
  /** The row from the run where the finding is currently reported. */
  current: Finding
  /** The matching row from the earlier run, when there was one. */
  previous: Finding | null
  /** Severity the earlier run gave it; null when it is genuinely new. */
  previousSeverity: Severity | null
}

export interface ScanComparisonData {
  previous: ScanComparisonSummary
  current: ScanComparisonSummary
  comparison: ScanComparison
  /** Fingerprints the newer run reports that the earlier one did not. */
  introduced: ComparedFinding[]
  /** Fingerprints the newer run no longer reports. */
  resolved: ComparedFinding[]
  /** Still reported and still open. */
  persisting: ComparedFinding[]
  /** Previously closed, reported again. */
  reopened: ComparedFinding[]
  /** Severity movement between the two runs, for the headline tiles. */
  deltas: Array<{ severity: Severity; previous: number; current: number; delta: number }>
  /** Net movement in reportable findings. */
  netChange: number
}

function summarise(scan: Scan, findings: readonly Finding[]): ScanComparisonSummary {
  const { indexes } = demoStore
  const target = indexes.targetById.get(scan.targetId)

  return {
    id: scan.id,
    sequence: scan.sequence,
    label: `${scan.id} · ${target?.name ?? 'Unknown target'}`,
    profileName: scan.profileId,
    completedAt: scan.completedAt,
    startedAt: scan.startedAt,
    moduleCount: scan.moduleIds.length,
    findingCount: findings.length,
    openFindings: findings.filter((finding) => isFindingOpen(finding.status)).length,
    riskScore: riskScoreFrom(severityCountsOf(findings)),
  }
}

function toCompared(current: Finding, previous: Finding | null): ComparedFinding {
  return {
    findingId: current.id,
    title: current.title,
    severity: current.severity,
    status: current.status,
    owaspId: current.owaspId,
    cweId: current.cweId,
    endpoint: current.endpoint,
    httpMethod: current.httpMethod,
    parameter: current.parameter,
    current,
    previous,
    previousSeverity: previous?.severity ?? null,
  }
}

/**
 * Per-severity breakdown of the four movements.
 *
 * `fixed` and `reopened` are counted against the *earlier* run's severity,
 * because that is the severity the client was told about when they accepted the
 * previous report.
 */
function severityBuckets(buckets: {
  resolved: ComparedFinding[]
  introduced: ComparedFinding[]
  persisting: ComparedFinding[]
  reopened: ComparedFinding[]
}): ComparisonSeverityBucket[] {
  const zero = () => ({ fixed: 0, newIssues: 0, stillOpen: 0, reopened: 0 })

  return SEVERITIES.map((severity) => {
    const bucket = zero()
    for (const finding of buckets.resolved) {
      if (finding.previousSeverity === severity) bucket.fixed += 1
    }
    for (const finding of buckets.introduced) {
      if (finding.severity === severity) bucket.newIssues += 1
    }
    for (const finding of buckets.persisting) {
      if (finding.severity === severity) bucket.stillOpen += 1
    }
    for (const finding of buckets.reopened) {
      if (finding.previousSeverity === severity) bucket.reopened += 1
    }
    return { severity, ...bucket }
  })
}

/**
 * Severity counts across the target's completed runs, up to the compared one.
 *
 * Ordered and cut off by date rather than by run sequence: the timeline feeds a
 * time axis, and a rerun of an older sequence lands with a later date, which
 * would draw a chart that doubles back on itself.
 */
function timelineFor(scans: readonly Scan[], currentScan: Scan): ComparisonPoint[] {
  const cutoff = new Date(currentScan.completedAt ?? currentScan.startedAt).getTime()

  return scans
    .filter((scan) => scan.status === 'completed')
    .filter((scan) => new Date(scan.completedAt ?? scan.startedAt).getTime() <= cutoff)
    .sort(
      (a, b) =>
        new Date(a.completedAt ?? a.startedAt).getTime() - new Date(b.completedAt ?? b.startedAt).getTime(),
    )
    .map((scan) => ({
      scanId: scan.id,
      label: `Run ${scan.sequence}`,
      date: scan.completedAt ?? scan.startedAt,
      ...severityCountsOf(demoStore.indexes.findingsByScan.get(scan.id) ?? []),
    }))
}

export function buildComparison(previousScanId: string, currentScanId: string): ScanComparisonData {
  const { indexes } = demoStore

  const previousScan = indexes.scanById.get(previousScanId)
  if (!previousScan) throw notFound('Scan', previousScanId)

  const currentScan = indexes.scanById.get(currentScanId)
  if (!currentScan) throw notFound('Scan', currentScanId)

  if (previousScan.id === currentScan.id) {
    throw new ApiError(400, 'Choose two different scans to compare.')
  }
  if (previousScan.targetId !== currentScan.targetId) {
    throw new ApiError(
      400,
      'Scans of different targets cannot be compared; pick two runs against the same target.',
    )
  }

  const previousFindings = indexes.findingsByScan.get(previousScan.id) ?? []
  const currentFindings = indexes.findingsByScan.get(currentScan.id) ?? []

  const previousIndex = indexByFingerprint(previousFindings)
  const currentIndex = indexByFingerprint(currentFindings)

  const introduced: ComparedFinding[] = []
  const persisting: ComparedFinding[] = []
  const reopened: ComparedFinding[] = []
  const resolved: ComparedFinding[] = []

  for (const [key, current] of currentIndex) {
    const previous = previousIndex.get(key)
    if (!previous) {
      introduced.push(toCompared(current, null))
    } else if (isClosed(previous) && isFindingOpen(current.status)) {
      reopened.push(toCompared(current, previous))
    } else {
      persisting.push(toCompared(current, previous))
    }
  }

  for (const [key, previous] of previousIndex) {
    if (currentIndex.has(key)) continue
    // `current` here is the earlier run's row: the newer run has no row to show,
    // so the resolved card links back to what we last actually saw.
    resolved.push(toCompared(previous, previous))
  }

  const comparison: ScanComparison = {
    previousScanId: previousScan.id,
    currentScanId: currentScan.id,
    fixed: resolved.length,
    newIssues: introduced.length,
    stillOpen: persisting.length,
    reopened: reopened.length,
    timeline: timelineFor(indexes.scansByTarget.get(currentScan.targetId) ?? [], currentScan),
    bySeverity: severityBuckets({ resolved, introduced, persisting, reopened }),
  }

  const previousCounts = severityCountsOf(previousFindings)
  const currentCounts = severityCountsOf(currentFindings)

  const deltas = SEVERITIES.map((severity) => ({
    severity,
    previous: previousCounts[severity],
    current: currentCounts[severity],
    delta: currentCounts[severity] - previousCounts[severity],
  }))

  return {
    previous: summarise(previousScan, previousFindings),
    current: summarise(currentScan, currentFindings),
    comparison,
    introduced,
    resolved,
    persisting,
    reopened,
    deltas,
    netChange: currentFindings.length - previousFindings.length,
  }
}

export const comparisonService = {
  /**
   * Targets with at least two completed runs, for the compare picker.
   *
   * Ordered by how many completed runs they have so the richest history is the
   * first thing offered rather than something you have to go looking for.
   */
  async options(): Promise<CompareTargetOption[]> {
    return request(() => {
      const data = demoStore.snapshot()

      return data.targets
        .map((target) => {
          const scans = (demoStore.indexes.scansByTarget.get(target.id) ?? [])
            .filter((scan) => scan.status === 'completed')
            .sort((a, b) => a.sequence - b.sequence)
            .map((scan) => {
              const findings = demoStore.indexes.findingsByScan.get(scan.id) ?? []
              return {
                id: scan.id,
                sequence: scan.sequence,
                label: `Run ${scan.sequence} · ${scan.completedAt ? scan.completedAt.slice(0, 10) : 'incomplete'}`,
                completedAt: scan.completedAt,
                findingCount: findings.length,
                openFindings: findings.filter((finding) => isFindingOpen(finding.status)).length,
              }
            })

          return {
            targetId: target.id,
            targetName: target.name,
            baseUrl: target.baseUrl,
            scans,
          }
        })
        .filter((option) => option.scans.length >= 2)
        .sort((a, b) => b.scans.length - a.scans.length || a.targetName.localeCompare(b.targetName))
    })
  },

  /** Full comparison read model for two runs of the same target. */
  async compare(previousScanId: string, currentScanId: string): Promise<ScanComparisonData> {
    return request(() => buildComparison(previousScanId, currentScanId))
  },
}