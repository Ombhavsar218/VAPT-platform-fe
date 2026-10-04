import type { OwaspCategory, Severity } from '@/types'

/**
 * OWASP Top 10 taxonomy.
 *
 * Defaults to the 2025 release. Earlier editions are kept so historical
 * findings imported from an external scanner can still be mapped correctly.
 */
export const OWASP_CATEGORIES: Record<string, OwaspCategory> = {
  'A01:2025': {
    id: 'A01:2025',
    title: 'Broken Access Control',
    year: 2025,
    summary:
      'Restrictions on who can view, edit or delete data are not correctly enforced, including IDOR and privilege escalation.',
  },
  'A02:2025': {
    id: 'A02:2025',
    title: 'Security Misconfiguration',
    year: 2025,
    summary:
      'Insecure defaults, unnecessary features, exposed admin interfaces and missing hardening across the stack.',
  },
  'A03:2025': {
    id: 'A03:2025',
    title: 'Software Supply Chain Failures',
    year: 2025,
    summary:
      'Weaknesses in dependency management, build systems and distribution infrastructure that let untrusted code reach production.',
  },
  'A04:2025': {
    id: 'A04:2025',
    title: 'Cryptographic Failures',
    year: 2025,
    summary:
      'Missing, weak or misused cryptography results in exposure of sensitive data in transit or at rest.',
  },
  'A05:2025': {
    id: 'A05:2025',
    title: 'Injection',
    year: 2025,
    summary:
      'Untrusted input interpreted by a downstream interpreter, including SQL, NoSQL, OS command and template injection.',
  },
  'A06:2025': {
    id: 'A06:2025',
    title: 'Insecure Design',
    year: 2025,
    summary:
      'Absent or ineffective security controls at the design stage, such as missing abuse cases and trust boundaries.',
  },
  'A07:2025': {
    id: 'A07:2025',
    title: 'Authentication Failures',
    year: 2025,
    summary:
      'Weaknesses in identification, session handling and credential protection that allow account takeover.',
  },
  'A08:2025': {
    id: 'A08:2025',
    title: 'Software or Data Integrity Failures',
    year: 2025,
    summary:
      'Code and infrastructure that trust updates, plugins or serialized data without verifying integrity and authenticity.',
  },
  'A09:2025': {
    id: 'A09:2025',
    title: 'Security Logging and Alerting Failures',
    year: 2025,
    summary:
      'Security-relevant events are not logged, monitored or alerted on with enough context to detect an attack.',
  },
  'A10:2025': {
    id: 'A10:2025',
    title: 'Mishandling of Exceptional Conditions',
    year: 2025,
    summary:
      'Unchecked errors, timeouts and resource exhaustion expose internals or leave the application in an unsafe state.',
  },
}

export const OWASP_2021_CATEGORIES: Record<string, OwaspCategory> = {
  'A01:2021': { id: 'A01:2021', title: 'Broken Access Control', year: 2021, summary: 'Access control restrictions are not correctly enforced.' },
  'A02:2021': { id: 'A02:2021', title: 'Cryptographic Failures', year: 2021, summary: 'Missing or weak cryptography exposes sensitive data.' },
  'A03:2021': { id: 'A03:2021', title: 'Injection', year: 2021, summary: 'Untrusted input is interpreted by a downstream interpreter.' },
  'A04:2021': { id: 'A04:2021', title: 'Insecure Design', year: 2021, summary: 'Security controls were absent at the design stage.' },
  'A05:2021': { id: 'A05:2021', title: 'Security Misconfiguration', year: 2021, summary: 'Insecure configuration across the application stack.' },
  'A06:2021': { id: 'A06:2021', title: 'Vulnerable and Outdated Components', year: 2021, summary: 'Components with known vulnerabilities are in use.' },
  'A07:2021': { id: 'A07:2021', title: 'Identification and Authentication Failures', year: 2021, summary: 'Identification and authentication can be bypassed.' },
  'A08:2021': { id: 'A08:2021', title: 'Software and Data Integrity Failures', year: 2021, summary: 'Code and data integrity is not verified.' },
  'A09:2021': { id: 'A09:2021', title: 'Security Logging and Monitoring Failures', year: 2021, summary: 'Security events are not logged or monitored.' },
  'A10:2021': { id: 'A10:2021', title: 'Server-Side Request Forgery', year: 2021, summary: 'The server can be induced to make unintended requests.' },
}

export const ALL_OWASP_CATEGORIES: Record<string, OwaspCategory> = {
  ...OWASP_2021_CATEGORIES,
  ...OWASP_CATEGORIES,
}

export const OWASP_2025_ORDER: string[] = Object.keys(OWASP_CATEGORIES)

export function getOwaspCategory(id: string): OwaspCategory | undefined {
  return ALL_OWASP_CATEGORIES[id]
}

/** `A05:2025` -> `A05 Injection` */
export function owaspLabel(id: string): string {
  const category = ALL_OWASP_CATEGORIES[id]
  if (!category) return id
  return `${id.split(':')[0]} ${category.title}`
}

/** Resolve the equivalent category in another OWASP edition. */
export function mapOwaspAcrossEditions(id: string, targetYear: number): string | null {
  const positionMatch = /^A(\d{2}):\d{4}$/.exec(id)
  if (!positionMatch) return null
  const position = `A${positionMatch[1]}`
  const target =
    targetYear === 2021
      ? OWASP_2021_CATEGORIES[`${position}:2021`]
      : OWASP_CATEGORIES[`${position}:2025`]
  return target?.id ?? null
}

/**
 * CWE reference data for the vulnerability types VAPTFlow can report.
 * `url` values point at the canonical MITRE / OWASP pages.
 */
export const CWE_NAMES: Record<string, { id: string; name: string; url: string }> = {
  'CWE-16': {
    id: 'CWE-16',
    name: 'Configuration',
    url: 'https://cwe.mitre.org/data/definitions/16.html',
  },
  'CWE-22': {
    id: 'CWE-22',
    name: 'Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)',
    url: 'https://cwe.mitre.org/data/definitions/22.html',
  },
  'CWE-79': {
    id: 'CWE-79',
    name: 'Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)',
    url: 'https://cwe.mitre.org/data/definitions/79.html',
  },
  'CWE-89': {
    id: 'CWE-89',
    name: "Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')",
    url: 'https://cwe.mitre.org/data/definitions/89.html',
  },
  'CWE-94': {
    id: 'CWE-94',
    name: 'Improper Control of Generation of Code (Code Injection)',
    url: 'https://cwe.mitre.org/data/definitions/94.html',
  },
  'CWE-200': {
    id: 'CWE-200',
    name: 'Exposure of Sensitive Information to an Unauthorized Actor',
    url: 'https://cwe.mitre.org/data/definitions/200.html',
  },
  'CWE-209': {
    id: 'CWE-209',
    name: 'Generation of Error Message Containing Sensitive Information',
    url: 'https://cwe.mitre.org/data/definitions/209.html',
  },
  'CWE-327': {
    id: 'CWE-327',
    name: 'Use of a Broken or Risky Cryptographic Algorithm',
    url: 'https://cwe.mitre.org/data/definitions/327.html',
  },
  'CWE-330': {
    id: 'CWE-330',
    name: 'Use of Insufficiently Random Values',
    url: 'https://cwe.mitre.org/data/definitions/330.html',
  },
  'CWE-352': {
    id: 'CWE-352',
    name: 'Cross-Site Request Forgery (CSRF)',
    url: 'https://cwe.mitre.org/data/definitions/352.html',
  },
  'CWE-426': {
    id: 'CWE-426',
    name: 'Untrusted Search Path',
    url: 'https://cwe.mitre.org/data/definitions/426.html',
  },
  'CWE-434': {
    id: 'CWE-434',
    name: 'Unrestricted Upload of File with Dangerous Type',
    url: 'https://cwe.mitre.org/data/definitions/434.html',
  },
  'CWE-538': {
    id: 'CWE-538',
    name: 'Insertion of Sensitive Information into Externally-Accessible File or Directory',
    url: 'https://cwe.mitre.org/data/definitions/538.html',
  },
  'CWE-601': {
    id: 'CWE-601',
    name: 'URL Redirection to Untrusted Site (Open Redirect)',
    url: 'https://cwe.mitre.org/data/definitions/601.html',
  },
  'CWE-614': {
    id: 'CWE-614',
    name: "Sensitive Cookie in HTTPS Session Without 'Secure' Attribute",
    url: 'https://cwe.mitre.org/data/definitions/614.html',
  },
  'CWE-639': {
    id: 'CWE-639',
    name: 'Authorization Bypass Through User-Controlled Key (Insecure Direct Object Reference)',
    url: 'https://cwe.mitre.org/data/definitions/639.html',
  },
  'CWE-693': {
    id: 'CWE-693',
    name: 'Protection Mechanism Failure',
    url: 'https://cwe.mitre.org/data/definitions/693.html',
  },
  'CWE-754': {
    id: 'CWE-754',
    name: 'Improper Check for Unusual or Exceptional Conditions',
    url: 'https://cwe.mitre.org/data/definitions/754.html',
  },
  'CWE-778': {
    id: 'CWE-778',
    name: 'Insufficient Logging',
    url: 'https://cwe.mitre.org/data/definitions/778.html',
  },
  'CWE-798': {
    id: 'CWE-798',
    name: 'Use of Hard-coded Credentials',
    url: 'https://cwe.mitre.org/data/definitions/798.html',
  },
  'CWE-862': {
    id: 'CWE-862',
    name: 'Missing Authorization',
    url: 'https://cwe.mitre.org/data/definitions/862.html',
  },
  'CWE-863': {
    id: 'CWE-863',
    name: 'Incorrect Authorization',
    url: 'https://cwe.mitre.org/data/definitions/863.html',
  },
  'CWE-918': {
    id: 'CWE-918',
    name: 'Server-Side Request Forgery (SSRF)',
    url: 'https://cwe.mitre.org/data/definitions/918.html',
  },
  'CWE-942': {
    id: 'CWE-942',
    name: 'Permissive Cross-domain Policy with Untrusted Domains',
    url: 'https://cwe.mitre.org/data/definitions/942.html',
  },
  'CWE-1004': {
    id: 'CWE-1004',
    name: "Sensitive Cookie Without 'HttpOnly' Flag",
    url: 'https://cwe.mitre.org/data/definitions/1004.html',
  },
  'CWE-1021': {
    id: 'CWE-1021',
    name: 'Improper Restriction of Rendered UI Layers or Frames (Clickjacking)',
    url: 'https://cwe.mitre.org/data/definitions/1021.html',
  },
  'CWE-1104': {
    id: 'CWE-1104',
    name: 'Use of Unmaintained Third Party Components',
    url: 'https://cwe.mitre.org/data/definitions/1104.html',
  },
  'CWE-1173': {
    id: 'CWE-1173',
    name: 'Improper Use of Validation Framework',
    url: 'https://cwe.mitre.org/data/definitions/1173.html',
  },
}

export function getCwe(id: string): { id: string; name: string; url: string } | undefined {
  return CWE_NAMES[id]
}

export function cweLabel(id: string): string {
  const cwe = CWE_NAMES[id]
  if (!cwe) return id
  const shortName = cwe.name.replace(/\s*\([^)]*\)\s*$/, '')
  return `${cwe.id} ${shortName}`
}

/** OWASP category page URL for a given category id. */
export function owaspUrl(id: string): string {
  const category = ALL_OWASP_CATEGORIES[id]
  const position = id.split(':')[0]
  if (!category || !position) return 'https://owasp.org/Top10/'
  return `https://owasp.org/Top10/${category.year}/A${position.slice(1)}_${category.title.replace(/\s+/g, '_')}`
}

/**
 * Typical severity by vulnerability class, used to seed plausible mock data and
 * to colour the coverage matrix. Not a substitute for per-target assessment.
 */
export const CWE_TYPICAL_SEVERITY: Record<string, Severity> = {
  'CWE-89': 'critical',
  'CWE-918': 'high',
  'CWE-862': 'high',
  'CWE-863': 'high',
  'CWE-639': 'high',
  'CWE-22': 'high',
  'CWE-798': 'critical',
  'CWE-434': 'high',
  'CWE-94': 'critical',
  'CWE-601': 'medium',
  'CWE-79': 'medium',
  'CWE-352': 'medium',
  'CWE-942': 'medium',
  'CWE-1021': 'low',
  'CWE-614': 'low',
  'CWE-1004': 'low',
  'CWE-327': 'high',
  'CWE-330': 'medium',
  'CWE-200': 'medium',
  'CWE-209': 'low',
  'CWE-538': 'medium',
  'CWE-693': 'medium',
  'CWE-754': 'medium',
  'CWE-778': 'medium',
  'CWE-1104': 'informational',
  'CWE-426': 'medium',
  'CWE-16': 'low',
  'CWE-1173': 'low',
}
