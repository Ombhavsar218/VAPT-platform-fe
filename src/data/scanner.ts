import type { ScanProfile, ScanProfileId, ScannerModule, ModuleStatus } from '@/types'
import { isoAgo, paddedId } from './seed'

/**
 * Detection modules and the scan profiles that bundle them.
 *
 * `testCount` is the number of individual checks the module contributes, and it
 * is what the OWASP coverage page sums to build its "tests available" column —
 * so the numbers here must be internally consistent with the profile totals.
 */

interface ModuleSeed {
  name: string
  slug: string
  description: string
  category: string
  status: ModuleStatus
  version: string
  testCount: number
  owasp: string[]
}

const MODULE_SEEDS: ModuleSeed[] = [
  {
    name: 'Crawler & Endpoint Discovery',
    slug: 'crawler',
    description:
      'Breadth-first crawling with JavaScript rendering, form detection and parameter harvesting across the authorised scope.',
    category: 'Discovery',
    status: 'enabled',
    version: '3.4.1',
    testCount: 12,
    owasp: ['A01:2025', 'A02:2025'],
  },
  {
    name: 'Injection Analysis',
    slug: 'injection',
    description:
      'SQL, NoSQL, command, template and LDAP injection detection using non-destructive differential probes.',
    category: 'Exploitation',
    status: 'enabled',
    version: '4.1.2',
    testCount: 86,
    owasp: ['A05:2025'],
  },
  {
    name: 'Cross-Site Scripting Detector',
    slug: 'xss',
    description:
      'Context-aware reflected and stored XSS detection across HTML, attribute, JavaScript and URL contexts.',
    category: 'Exploitation',
    status: 'enabled',
    version: '3.8.0',
    testCount: 64,
    owasp: ['A05:2025'],
  },
  {
    name: 'Access Control Analysis',
    slug: 'access-control',
    description:
      'Horizontal and vertical privilege escalation testing through identifier substitution and role boundary probing.',
    category: 'Access control',
    status: 'enabled',
    version: '2.9.4',
    testCount: 41,
    owasp: ['A01:2025'],
  },
  {
    name: 'Session & Authentication Review',
    slug: 'authentication',
    description:
      'Session fixation, token handling, MFA presence, rate limiting and credential policy evaluation.',
    category: 'Authentication',
    status: 'enabled',
    version: '2.5.7',
    testCount: 33,
    owasp: ['A07:2025'],
  },
  {
    name: 'Configuration & Headers Audit',
    slug: 'misconfiguration',
    description:
      'Security header, cookie attribute, CORS, default credential and exposed administrative surface checks.',
    category: 'Misconfiguration',
    status: 'enabled',
    version: '2.2.3',
    testCount: 57,
    owasp: ['A02:2025'],
  },
  {
    name: 'Component & Supply Chain Audit',
    slug: 'supply-chain',
    description:
      'Fingerprinting of dependencies and frameworks with comparison against known vulnerable and unsupported versions, plus unsigned artefact and untrusted deserialisation checks.',
    category: 'Supply chain',
    status: 'enabled',
    version: '1.9.0',
    testCount: 24,
    owasp: ['A03:2025', 'A08:2025'],
  },
  {
    name: 'Cryptography & Transport Review',
    slug: 'cryptography',
    description:
      'TLS configuration, certificate trust chain and sensitive data handling over transport assessment.',
    category: 'Cryptography',
    status: 'enabled',
    version: '1.6.3',
    testCount: 19,
    owasp: ['A04:2025'],
  },
  {
    name: 'File Handling Checks',
    slug: 'file-handling',
    description:
      'Upload type validation, path traversal, XML entity processing and file-serving behaviour.',
    category: 'Exploitation',
    status: 'enabled',
    version: '1.4.8',
    testCount: 28,
    owasp: ['A05:2025', 'A01:2025'],
  },
  {
    name: 'Business Logic Analysis',
    slug: 'business-logic',
    description:
      'Workflow, pricing and promotion rule review, including client-side-only enforcement detection.',
    category: 'Design',
    status: 'enabled',
    version: '0.9.6',
    testCount: 15,
    owasp: ['A06:2025'],
  },
  {
    name: 'Server-Side Request Forgery',
    slug: 'ssrf',
    description:
      'Detection of server-side fetches driven by user input, including redirect and DNS rebinding handling.',
    category: 'Exploitation',
    status: 'enabled',
    version: '1.2.1',
    testCount: 18,
    owasp: ['A01:2025', 'A05:2025'],
  },
  {
    name: 'Information Disclosure Sweep',
    slug: 'information-disclosure',
    description:
      'Detection of stack traces, debug endpoints, exposed configuration files, unauthenticated data access and absent security event logging.',
    category: 'Misconfiguration',
    status: 'enabled',
    version: '2.0.9',
    testCount: 37,
    owasp: ['A02:2025', 'A09:2025', 'A10:2025'],
  },
  {
    name: 'Subdomain & Attack Surface Mapping',
    slug: 'attack-surface',
    description:
      'Passive DNS, certificate transparency and dangling record detection for the authorised domain.',
    category: 'Discovery',
    status: 'experimental',
    version: '0.6.0',
    testCount: 9,
    owasp: ['A03:2025'],
  },
  {
    name: 'Security Logging & Alerting Review',
    slug: 'logging-review',
    description:
      'Exercises authentication and authorisation events and checks whether corresponding log records and alerts exist.',
    category: 'Detection',
    status: 'disabled',
    version: '0.4.2',
    testCount: 11,
    owasp: ['A09:2025'],
  },
]

export function createModules(): ScannerModule[] {
  return MODULE_SEEDS.map((seed, index) => ({
    id: paddedId('mod', index + 1, 3),
    name: seed.name,
    slug: seed.slug,
    description: seed.description,
    category: seed.category,
    status: seed.status,
    version: seed.version,
    testCount: seed.testCount,
    owaspCategories: seed.owasp,
    updatedAt: isoAgo(6 + index * 5, (index * 7) % 24),
  }))
}

const enabledIds = (slugs: readonly string[], modules: readonly ScannerModule[]): string[] =>
  modules
    .filter((module) => slugs.includes(module.slug) && module.status !== 'disabled')
    .map((module) => module.id)

export function createScanProfiles(modules: readonly ScannerModule[]): ScanProfile[] {
  const quick = enabledIds(
    ['crawler', 'misconfiguration', 'information-disclosure', 'supply-chain'],
    modules,
  )
  const standard = enabledIds(
    [
      'crawler',
      'injection',
      'xss',
      'access-control',
      'authentication',
      'misconfiguration',
      'file-handling',
      'ssrf',
      'information-disclosure',
      'supply-chain',
    ],
    modules,
  )
  const full = enabledIds(
    [
      'crawler',
      'injection',
      'xss',
      'access-control',
      'authentication',
      'misconfiguration',
      'file-handling',
      'ssrf',
      'business-logic',
      'information-disclosure',
      'supply-chain',
      'cryptography',
      'attack-surface',
    ],
    modules,
  )

  return [
    {
      id: 'quick' satisfies ScanProfileId,
      name: 'Quick',
      description:
        'Passive and low-impact checks only: discovery, configuration review, disclosure sweep and dependency audit. No exploitation.',
      estimatedMinutes: 12,
      intensity: 'low',
      capabilities: [
        'Endpoint discovery and parameter harvesting',
        'Security header and cookie attribute review',
        'Exposed configuration and debug surface detection',
        'Dependency fingerprinting and version comparison',
      ],
      moduleIds: quick,
    },
    {
      id: 'standard' satisfies ScanProfileId,
      name: 'Standard',
      description:
        'The default engagement profile. Adds non-destructive injection, access control and session testing across the crawled surface.',
      estimatedMinutes: 38,
      intensity: 'balanced',
      capabilities: [
        'Everything in Quick',
        'SQL, NoSQL and command injection differentials',
        'Reflected and stored XSS context analysis',
        'Horizontal and vertical access control probing',
        'Session handling and rate limiting checks',
        'Upload handling and path traversal probes',
      ],
      moduleIds: standard,
    },
    {
      id: 'full' satisfies ScanProfileId,
      name: 'Full',
      description:
        'Thorough assessment for authorised engagements. Adds business logic review, transport analysis and passive attack-surface mapping.',
      estimatedMinutes: 96,
      intensity: 'thorough',
      capabilities: [
        'Everything in Standard',
        'Business logic and pricing rule evaluation',
        'TLS and cryptographic transport review',
        'Passive subdomain and dangling record mapping',
        'Extended parameter fuzzing with context analysis',
      ],
      moduleIds: full,
    },
  ]
}
