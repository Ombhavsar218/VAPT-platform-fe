import type {
  Confidence,
  Endpoint,
  Evidence,
  Finding,
  FindingStatus,
  HttpMethod,
  Scan,
  Severity,
  Target,
  VerificationTask,
} from '@/types'
import { SEVERITY_RANK, severityFromRank } from '@/utils/severity'

import { VULN_TEMPLATES, type EvidenceContext, type VulnTemplate } from './catalog'
import { addSeconds, chance, isoAgo, NOW, paddedId, pick, pickWeighted, randomInt, type Rng } from './seed'

/**
 * The vulnerability register.
 *
 * Findings are attached to the scan that produced them, so the register, the
 * scan detail counters and the comparison view all stay consistent with one
 * another. Each finding reuses a catalogue template for its analyst copy and
 * evidence, which keeps the wording identical to how a real scanner reports the
 * same class of issue.
 */

/** Probe markers that appear verbatim in the templated evidence. */
const PROBE_VALUES: Record<string, string> = {
  'vt-xss-reflected': '"><img src=x onerror=alert(document.domain)>',
  'vt-xss-stored': '<img src=x onerror=alert(document.domain)>',
  'vt-sqli-error': "'",
  'vt-sqli-blind': " AND (SELECT SLEEP(5))",
  'vt-idor': '40211',
  'vt-bac-missing': '',
  'vt-path-traversal': '../../../../etc/passwd',
  'vt-ssrf': 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
  'vt-csrf': 'attacker-controlled@evil.example',
  'vt-headers-missing': '',
  'vt-cors': '',
  'vt-info-disclosure': '',
  'vt-error-verbose': 'not-a-valid-id',
  'vt-cookie-flags': '',
  'vt-jwt-weak': '',
  'vt-outdated-component': '',
  'vt-logging-missing': '',
  'vt-file-upload': 'invoice.php.png',
  'vt-privilege-escalation': 'admin',
  'vt-open-redirect': 'https://evil.example/signin-capture',
  'vt-clickjacking': '',
  'vt-mass-assignment': '0.01',
  'vt-host-header': 'attacker.example',
  'vt-rate-limiting': 'attacker@evil.example',
  'vt-subdomain-takeover': 'legacy-preview',
  'vt-xxe': '<?xml version="1.0"?>',
  'vt-click-order-enforcement': 'STAFF100',
  'vt-tls-weak': '',
}

const TEMPLATE_WEIGHTS: Record<string, number> = {
  'vt-headers-missing': 5,
  'vt-cookie-flags': 4,
  'vt-cors': 2,
  'vt-outdated-component': 3,
  'vt-tls-weak': 2,
  'vt-subdomain-takeover': 1,
  'vt-clickjacking': 2,
  'vt-info-disclosure': 2,
  'vt-error-verbose': 2,
  'vt-sqli-error': 1,
  'vt-sqli-blind': 1,
  'vt-idor': 3,
  'vt-xss-reflected': 3,
  'vt-xss-stored': 2,
  'vt-access-control': 3,
  'vt-bac-missing': 2,
  'vt-path-traversal': 2,
  'vt-ssrf': 2,
  'vt-csrf': 2,
  'vt-file-upload': 1,
  'vt-mass-assignment': 2,
  'vt-privilege-escalation': 1,
  'vt-open-redirect': 2,
  'vt-host-header': 1,
  'vt-rate-limiting': 2,
  'vt-logging-missing': 1,
  'vt-xxe': 1,
  'vt-click-order-enforcement': 1,
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** `/api/orders/{id}` → `/api/orders`, so path prefixes can be compared. */
function pathStem(path: string): string {
  const withoutParam = path.replace(/\{[^}]+\}/g, '')
  const segments = withoutParam.split('/').filter(Boolean)
  return `/${segments.slice(0, 2).join('/')}`.replace(/\/$/, '') || '/'
}

/** How strongly a template applies to what was actually discovered. */
function applicability(template: VulnTemplate, endpointPaths: readonly string[]): number {
  if (template.candidatePaths.length === 0) return 0
  const stems = new Set(endpointPaths.map(pathStem))
  return template.candidatePaths.filter((candidate) => stems.has(pathStem(candidate))).length
}

interface Candidate {
  template: VulnTemplate
  weight: number
  endpoint: Endpoint
}

function resolveCandidate(
  rng: Rng,
  template: VulnTemplate,
  endpoints: readonly Endpoint[],
): Candidate {
  const methodAllowed = (endpoint: Endpoint) =>
    template.methods.length === 0 || template.methods.includes(endpoint.method)
  const pathPreferred = (endpoint: Endpoint) =>
    template.candidatePaths.some((candidate) => pathStem(candidate) === pathStem(endpoint.path))

  // Prefer an endpoint the template is actually about, then any method match,
  // and only fall back to the whole surface if the target is unusual.
  const preferred = endpoints.filter((endpoint) => methodAllowed(endpoint) && pathPreferred(endpoint))
  const methodMatch = endpoints.filter(methodAllowed)
  const pool = preferred.length > 0 ? preferred : methodMatch.length > 0 ? methodMatch : endpoints
  const endpoint = pool[Math.floor(rng() * pool.length)] ?? pool[0]

  if (!endpoint) {
    throw new Error('resolveCandidate() requires at least one endpoint')
  }

  return {
    template,
    weight: TEMPLATE_WEIGHTS[template.id] ?? 1,
    endpoint,
  }
}

function pickStatus(rng: Rng, ageDays: number): FindingStatus {
  if (ageDays <= 2) {
    return pickWeighted<FindingStatus>(rng, ['potential', 'potential', 'open', 'confirmed'], [55, 20, 15, 10])
  }
  if (ageDays <= 9) {
    return pickWeighted<FindingStatus>(
      rng,
      ['potential', 'open', 'confirmed', 'needs_retest', 'false_positive', 'fixed'],
      [30, 20, 22, 8, 12, 8],
    )
  }
  return pickWeighted<FindingStatus>(
    rng,
    ['confirmed', 'open', 'fixed', 'false_positive', 'reopened', 'needs_retest', 'potential'],
    [30, 16, 20, 14, 6, 6, 8],
  )
}

function pickConfidence(rng: Rng): Confidence {
  return pickWeighted<Confidence>(rng, ['high', 'medium', 'low'], [58, 32, 10])
}

/** Small, realistic severity drift so the register is not uniform per class. */
function driftSeverity(rng: Rng, severity: Severity): Severity {
  const roll = rng()
  const rank = SEVERITY_RANK[severity]
  if (roll < 0.09 && rank > 1) return severityFromRank(rank - 1)
  if (roll < 0.16 && rank < 5) return severityFromRank(rank + 1)
  return severity
}

function buildContext(
  target: Target,
  endpoint: Endpoint,
  template: VulnTemplate,
  parameter: string | null,
  rng: Rng,
): EvidenceContext {
  const value = PROBE_VALUES[template.id] ?? (parameter ? `vaptflow-probe-${randomInt(rng, 1000, 9999)}` : '')

  return {
    host: hostOf(target.baseUrl),
    path: endpoint.path,
    method: endpoint.method,
    parameter,
    value,
  }
}

function resolveParameter(rng: Rng, template: VulnTemplate, endpoint: Endpoint): string | null {
  if (template.parameters.length === 0) return null
  const shared = template.parameters.filter((parameter) => endpoint.parameters.includes(parameter))
  if (shared.length > 0) return pick(rng, shared)
  return pick(rng, template.parameters)
}

function buildTitle(template: VulnTemplate, endpoint: Endpoint): string {
  if (endpoint.path === '/') return template.name
  return `${template.name} in ${endpoint.path}`
}

const ANALYSTS = ['usr-001', 'usr-004', 'usr-005', 'usr-006', 'usr-007'] as const

export function createFindings(
  scans: readonly Scan[],
  targets: readonly Target[],
  endpoints: readonly Endpoint[],
  rng: Rng,
): Finding[] {
  const targetById = new Map(targets.map((target) => [target.id, target]))
  const endpointsByTarget = new Map<string, Endpoint[]>()
  for (const endpoint of endpoints) {
    const bucket = endpointsByTarget.get(endpoint.targetId) ?? []
    bucket.push(endpoint)
    endpointsByTarget.set(endpoint.targetId, bucket)
  }

  const findings: Finding[] = []
  let nextIndex = 1

  for (const scan of scans) {
    if (scan.status === 'cancelled' || scan.status === 'queued') continue

    const target = targetById.get(scan.targetId)
    if (!target) continue
    const targetEndpoints = endpointsByTarget.get(target.id) ?? []
    if (targetEndpoints.length === 0) continue

    const produced = createFindingsForScan(scan, target, targetEndpoints, rng, {
      startIndex: nextIndex,
      ageDays: Math.max(
        0,
        Math.round((NOW.getTime() - new Date(scan.startedAt).getTime()) / 86_400_000),
      ),
    })

    nextIndex += produced.length
    findings.push(...produced)
  }

  return findings
}

/**
 * Findings for a single scan, drawn from the same catalogue the history uses.
 *
 * Shared with the Stage 3 simulator so a scan started in the browser produces
 * evidence written the same way as a seeded one: a real template, real probe
 * evidence and the severity drift, rather than a placeholder row.
 */
export function createFindingsForScan(
  scan: Scan,
  target: Target,
  targetEndpoints: readonly Endpoint[],
  rng: Rng,
  options: { startIndex?: number; ageDays?: number; count?: number } = {},
): Finding[] {
  if (targetEndpoints.length === 0) return []

  const startIndex = options.startIndex ?? 1
  const endpointPaths = targetEndpoints.map((endpoint) => endpoint.path)
  const applicable = VULN_TEMPLATES.map((template) => ({
    template,
    matches: applicability(template, endpointPaths),
  })).filter((entry) => entry.matches > 0)

  const pool = (applicable.length > 0 ? applicable : VULN_TEMPLATES.map((template) => ({ template, matches: 0 })))
    .map((entry) => resolveCandidate(rng, entry.template, targetEndpoints))

  const base = Math.max(1, Math.round(scan.counters.potentialFindings / 4))
  const count = Math.min(
    pool.length,
    6,
    options.count ?? Math.max(1, base + randomInt(rng, -1, 2)),
  )

  const ageDays = options.ageDays ?? 0
  const findings: Finding[] = []
  const usedTemplates = new Set<string>()

  for (let i = 0; i < count; i += 1) {
    const fresh = pool.filter((candidate) => !usedTemplates.has(candidate.template.id))
    const candidates = fresh.length > 0 ? fresh : pool
    const chosen = pickWeighted(
      rng,
      candidates,
      candidates.map((candidate) => candidate.weight),
    )
    if (!chosen) break
    usedTemplates.add(chosen.template.id)

    const { template, endpoint } = chosen
    const parameter = resolveParameter(rng, template, endpoint)
    const context = buildContext(target, endpoint, template, parameter, rng)
    const confidence = pickConfidence(rng)
    const lastDetected =
      chance(rng, 0.35) && scan.completedAt
        ? addSeconds(scan.completedAt, randomInt(rng, 0, 60 * 24 * 3))
        : scan.startedAt

    const evidence: Evidence = {
      ...template.buildEvidence(context),
      observedAt: lastDetected,
    }

    findings.push({
      id: paddedId('fnd', startIndex + i, 4),
      title: buildTitle(template, endpoint),
      vulnerabilityTypeId: template.id,
      severity: driftSeverity(rng, template.severity),
      confidence,
      status: pickStatus(rng, ageDays),
      targetId: target.id,
      projectId: scan.projectId,
      scanId: scan.id,
      endpoint: endpoint.path,
      httpMethod: endpoint.method as HttpMethod,
      parameter,
      cweId: template.cweId,
      owaspId: template.owaspId,
      description: template.description,
      detectionReason: template.detectionReason,
      impact: template.impact,
      remediation: template.remediation,
      references: template.references,
      evidence,
      firstDetected: scan.startedAt,
      lastDetected,
      occurrenceCount: randomInt(rng, 1, 12),
      requiresManualVerification: confidence === 'high' ? chance(rng, 0.25) : true,
      assignee: chance(rng, 0.85) ? pick(rng, ANALYSTS) : null,
    })
  }

  return findings
}

/* -------------------------------------------------------------------------- */
/* Manual verification queue                                                   */
/* -------------------------------------------------------------------------- */

function suggestedSteps(rng: Rng, template: VulnTemplate, endpoint: Endpoint): string[] {
  const base = [
    `Reproduce the reported behaviour on ${endpoint.method} ${endpoint.path} using the recorded request in the evidence panel.`,
    `Confirm the finding is not a false positive by repeating the request with a benign control value and comparing responses.`,
    'Assess exploitability in context: what an attacker needs in order to reach this endpoint, and what they gain.',
  ]

  if (template.severity === 'critical' || template.severity === 'high') {
    base.push('Validate the finding against the client\'s agreed severity matrix before it enters the report.')
  }
  if (template.owaspId === 'A01:2025') {
    base.push('Re-test the same request with a second, differently privileged account to confirm the authorisation gap.')
  }
  if (template.owaspId === 'A05:2025') {
    base.push('Use a non-destructive probe to confirm interpreter behaviour; do not modify or exfiltrate data.')
  }
  base.push(
    chance(rng, 0.5)
      ? 'Record the decision with a short rationale and set the remediation owner before marking as confirmed.'
      : 'Mark as needs more testing if the environment blocks safe reproduction, and note the blocker in the record.',
  )

  return base
}

export function createVerificationTasks(
  findings: readonly Finding[],
  rng: Rng,
  options: { startIndex?: number } = {},
): VerificationTask[] {
  const queue = findings.filter((finding) => finding.status === 'potential')

  if (queue.length === 0) return []

  const ordered = [...queue].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    return rank !== 0 ? rank : a.firstDetected.localeCompare(b.firstDetected)
  })

  const count = Math.min(12, ordered.length)
  const startIndex = options.startIndex ?? 1
  const tasks: VerificationTask[] = []

  for (let index = 0; index < count; index += 1) {
    const finding = ordered[index]
    if (!finding) continue

    const template =
      VULN_TEMPLATES.find((entry) => entry.id === finding.vulnerabilityTypeId) ?? VULN_TEMPLATES[0]
    if (!template) continue

    const decided = index >= count - 4
    const decision = decided
      ? pickWeighted(rng, ['confirmed', 'false_positive', 'needs_retest'] as const, [55, 25, 20])
      : null

    tasks.push({
      id: paddedId('ver', startIndex + index, 3),
      findingId: finding.id,
      targetId: finding.targetId,
      projectId: finding.projectId,
      priority: finding.severity === 'critical' || finding.severity === 'high' ? 'high' : finding.severity === 'medium' ? 'medium' : 'low',
      assignedTo: finding.assignee,
      dueDate: chance(rng, 0.85) ? isoAgo(-randomInt(rng, 1, 9)).slice(0, 10) : null,
      createdAt: finding.lastDetected,
      scannerRationale: finding.detectionReason,
      observedBehaviour: template.summary,
      suggestedSteps: suggestedSteps(rng, template, {
        id: '',
        targetId: finding.targetId,
        method: finding.httpMethod,
        path: finding.endpoint,
        contentType: '',
        parameters: finding.parameter ? [finding.parameter] : [],
        discoveredAt: finding.firstDetected,
        authRequired: true,
      }),
      decision,
      decidedAt: decision ? isoAgo(0, randomInt(rng, 2, 40), randomInt(rng, 0, 59)) : null,
      notes: decision === 'false_positive' ? 'WAF responded before the payload reached the application; response was sanitised upstream.' : decision === 'confirmed' ? 'Reproduced manually on the staging tenant with the test account; response matches the recorded evidence.' : '',
    })
  }

  return tasks
}
