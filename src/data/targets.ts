import type { Endpoint, Environment, HttpMethod, ScopeConfig, Target, TargetType, Technology } from '@/types'
import { isoAgo, paddedId, pickMany, randomInt, type Rng } from './seed'

/**
 * Authorised assets, their technology fingerprint and the endpoints a
 * reconnaissance pass would discover on each one.
 *
 * Two targets are deliberately unassigned so the "Unassigned" filter and the
 * scope-onboarding flow have real records to work with.
 */

interface TargetSeed {
  name: string
  baseUrl: string
  type: TargetType
  environment: Environment
  projectIndex: number | null
  description: string
  tags: string[]
  allowedPaths: string[]
  excludedPaths: string[]
  /**
   * Whether written authorisation is on file. Defaults to true; the few entries
   * that opt out exist so the authorisation filter, warning panels and the scan
   * wizard's refusal are demonstrated by data rather than by an empty state.
   */
  authorised?: boolean
  /** Ordered stack; the fingerprint reveals the first `depth` entries. */
  stack: Technology[]
}

const TECH = {
  nginx: { name: 'nginx', category: 'Web server', version: '1.25.3', confidence: 'high' as const },
  apache: { name: 'Apache HTTP Server', category: 'Web server', version: '2.4.58', confidence: 'high' as const },
  cloudfront: { name: 'Amazon CloudFront', category: 'CDN', version: null, confidence: 'high' as const },
  akamai: { name: 'Akamai', category: 'CDN', version: null, confidence: 'medium' as const },
  django: { name: 'Django', category: 'Framework', version: '4.2.16', confidence: 'high' as const },
  laravel: { name: 'Laravel', category: 'Framework', version: '8.83.27', confidence: 'high' as const },
  express: { name: 'Express', category: 'Framework', version: '4.17.3', confidence: 'high' as const },
  spring: { name: 'Spring Boot', category: 'Framework', version: '2.7.18', confidence: 'medium' as const },
  rails: { name: 'Ruby on Rails', category: 'Framework', version: '6.1.7.10', confidence: 'high' as const },
  aspnet: { name: 'ASP.NET Core', category: 'Framework', version: '6.0.36', confidence: 'medium' as const },
  react: { name: 'React', category: 'Frontend', version: '18.3.1', confidence: 'high' as const },
  next: { name: 'Next.js', category: 'Frontend', version: '14.2.22', confidence: 'high' as const },
  vue: { name: 'Vue.js', category: 'Frontend', version: '3.4.38', confidence: 'high' as const },
  jquery: { name: 'jQuery', category: 'Frontend', version: '3.4.1', confidence: 'high' as const },
  postgres: { name: 'PostgreSQL', category: 'Database', version: '14.15', confidence: 'medium' as const },
  mysql: { name: 'MySQL', category: 'Database', version: '8.0.39', confidence: 'medium' as const },
  mongo: { name: 'MongoDB', category: 'Database', version: '6.0.19', confidence: 'medium' as const },
  redis: { name: 'Redis', category: 'Data store', version: '6.2.14', confidence: 'low' as const },
  stripe: { name: 'Stripe', category: 'Payment', version: null, confidence: 'high' as const },
  adyen: { name: 'Adyen', category: 'Payment', version: null, confidence: 'high' as const },
  auth0: { name: 'Auth0', category: 'Identity', version: null, confidence: 'high' as const },
  keycloak: { name: 'Keycloak', category: 'Identity', version: '24.0.4', confidence: 'medium' as const },
  twilio: { name: 'Twilio', category: 'Communications', version: null, confidence: 'medium' as const },
  cloudflare: { name: 'Cloudflare', category: 'CDN', version: null, confidence: 'high' as const },
  sentry: { name: 'Sentry', category: 'Observability', version: '7.114.0', confidence: 'medium' as const },
  k8s: { name: 'Kubernetes', category: 'Platform', version: '1.29.6', confidence: 'low' as const },
}

function stack(...entries: Technology[]): Technology[] {
  return entries
}

const TARGET_SEEDS: TargetSeed[] = [
  {
    name: 'Northwind Storefront',
    baseUrl: 'https://store.northwind-retail.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 0,
    description: 'Primary customer storefront, including search, cart and checkout.',
    tags: ['checkout', 'customer-facing', 'pci'],
    allowedPaths: ['/'],
    excludedPaths: ['/admin/legacy', '/media/uploads/*'],
    stack: stack(TECH.cloudfront, TECH.nginx, TECH.next, TECH.react, TECH.postgres, TECH.stripe),
  },
  {
    name: 'Northwind Loyalty Wallet',
    baseUrl: 'https://wallet.northwind-retail.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 0,
    description: 'New loyalty wallet introduced with the 2026 programme migration.',
    tags: ['new-feature', 'pci'],
    allowedPaths: ['/'],
    excludedPaths: ['/internal/*'],
    stack: stack(TECH.cloudfront, TECH.nginx, TECH.express, TECH.react, TECH.mongo, TECH.stripe),
  },
  {
    name: 'Northwind Staging',
    baseUrl: 'https://staging.northwind-retail.example',
    type: 'web_application',
    environment: 'staging',
    projectIndex: 0,
    description: 'Pre-production environment mirroring production data with test cards.',
    tags: ['staging', 'test-data'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.next, TECH.postgres, TECH.sentry),
  },
  {
    name: 'Helix Partner API',
    baseUrl: 'https://api.helixbiologics.example',
    type: 'api',
    environment: 'production',
    projectIndex: 1,
    description: 'Clinical trial partner API with per-partner scoped credentials.',
    tags: ['api', 'phi', 'partner'],
    allowedPaths: ['/api/v1'],
    excludedPaths: ['/api/v1/internal/*'],
    stack: stack(TECH.akamai, TECH.nginx, TECH.spring, TECH.postgres, TECH.keycloak),
  },
  {
    name: 'Helix Data Export API',
    baseUrl: 'https://exports.helixbiologics.example',
    type: 'api',
    environment: 'staging',
    projectIndex: 1,
    description: 'Bulk trial data export service for authorised partners.',
    tags: ['api', 'bulk-data'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.express, TECH.postgres),
  },
  {
    name: 'Orbit Driver API',
    baseUrl: 'https://driver-api.orbitfreight.example',
    type: 'api',
    environment: 'production',
    projectIndex: 2,
    description: 'Backend for the driver mobile application, including route and proof-of-delivery upload.',
    tags: ['mobile', 'api', 'upload'],
    allowedPaths: ['/api/v2'],
    excludedPaths: ['/api/v2/ops/*'],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.spring, TECH.mysql, TECH.auth0),
  },
  {
    name: 'Orbit Depot Console',
    baseUrl: 'https://depot.orbitfreight.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 2,
    description: 'Depot staff console for loading, manifesting and dispatch.',
    tags: ['internal', 'operations'],
    allowedPaths: ['/'],
    excludedPaths: ['/reports/export/*'],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.rails, TECH.jquery, TECH.postgres),
  },
  {
    name: 'Orbit Notification Service',
    baseUrl: 'https://notify.orbitfreight.example',
    type: 'api',
    environment: 'production',
    projectIndex: 2,
    description: 'Push notification and SMS dispatch service for shipment updates.',
    tags: ['service', 'notifications'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.express, TECH.redis, TECH.twilio),
  },
  {
    name: 'Kestrel Edge Gateway',
    baseUrl: 'https://edge.kestrelfinancial.example',
    type: 'web_service',
    environment: 'production',
    projectIndex: 3,
    description: 'Public API gateway fronting the core banking services.',
    tags: ['gateway', 'paused'],
    allowedPaths: ['/'],
    excludedPaths: ['/admin/*'],
    stack: stack(TECH.akamai, TECH.nginx, TECH.k8s, TECH.keycloak, TECH.sentry),
  },
  {
    name: 'Kestrel Partner Portal',
    baseUrl: 'https://partners.kestrelfinancial.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 3,
    description: 'Partner and correspondent bank self-service portal.',
    tags: ['banking', 'paused'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.akamai, TECH.apache, TECH.django, TECH.postgres, TECH.keycloak),
  },
  {
    name: 'Verity Patient Portal',
    baseUrl: 'https://portal.verityhealth.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 4,
    description: 'Patient portal covering appointments, results and messaging.',
    tags: ['healthcare', 'phi', 'patient-facing'],
    allowedPaths: ['/'],
    excludedPaths: ['/admin/*'],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.aspnet, TECH.postgres, TECH.sentry),
  },
  {
    name: 'Verity Scheduling API',
    baseUrl: 'https://scheduling.verityhealth.example',
    type: 'api',
    environment: 'production',
    projectIndex: 4,
    description: 'Appointment availability and booking API used by the portal and third parties.',
    tags: ['api', 'healthcare'],
    allowedPaths: ['/api'],
    excludedPaths: [],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.aspnet, TECH.postgres),
  },
  {
    name: 'Verity Lab Results Service',
    baseUrl: 'https://labs.verityhealth.example',
    type: 'api',
    environment: 'production',
    projectIndex: 4,
    description: 'Diagnostics result delivery service with clinician and patient audiences.',
    tags: ['api', 'phi', 'high-sensitivity'],
    allowedPaths: ['/'],
    excludedPaths: ['/fixtures/*'],
    stack: stack(TECH.nginx, TECH.spring, TECH.mongo, TECH.keycloak, TECH.sentry),
  },
  {
    name: 'Lumen Checkout',
    baseUrl: 'https://checkout.lumenretail.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 5,
    description: 'Unified checkout covering card, wallet and buy-now-pay-later.',
    tags: ['checkout', 'pci', 'new-feature'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.cloudfront, TECH.nginx, TECH.next, TECH.react, TECH.stripe, TECH.sentry),
  },
  {
    name: 'Lumen Discount Engine',
    baseUrl: 'https://pricing.lumenretail.example',
    type: 'api',
    environment: 'production',
    projectIndex: 5,
    description: 'Promotion, voucher and regional pricing rules engine.',
    tags: ['api', 'business-logic'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.express, TECH.postgres),
  },
  {
    name: 'Lumen Fulfilment API',
    baseUrl: 'https://fulfilment.lumenretail.example',
    type: 'api',
    environment: 'staging',
    projectIndex: 5,
    description: 'Warehouse, carrier and returns integrations for order fulfilment.',
    tags: ['api', 'integrations'],
    allowedPaths: ['/'],
    excludedPaths: ['/sandbox/fixtures/*'],
    stack: stack(TECH.nginx, TECH.express, TECH.mongo, TECH.twilio),
  },
  {
    name: 'Solstice Publishing',
    baseUrl: 'https://publish.solsticemedia.example',
    type: 'web_application',
    environment: 'staging',
    projectIndex: 6,
    description: 'Contributor publishing workflow and media library, pre-migration.',
    tags: ['cms', 'staging'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.laravel, TECH.mysql, TECH.jquery),
  },
  {
    name: 'Solstice Content API',
    baseUrl: 'https://content.solsticemedia.example',
    type: 'api',
    environment: 'staging',
    projectIndex: 6,
    description: 'Public content delivery API consumed by web and mobile clients.',
    tags: ['api', 'cms'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.express, TECH.redis),
  },
  {
    name: 'Ardent Corporate Site',
    baseUrl: 'https://www.ardentlogistics.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 7,
    description: 'Public corporate site used as the adversary simulation entry point.',
    tags: ['red-team', 'phishing-surface'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.laravel, TECH.mysql),
  },
  {
    name: 'Ardent Fleet Operations',
    baseUrl: 'https://fleet.ardentlogistics.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 7,
    description: 'Fleet scheduling and telematics operations application.',
    tags: ['red-team', 'operations'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.cloudflare, TECH.apache, TECH.django, TECH.postgres),
  },
  {
    name: 'Ardent Identity Provider',
    baseUrl: 'https://idp.ardentlogistics.example',
    type: 'web_service',
    environment: 'production',
    projectIndex: 7,
    description: 'Workforce single sign-on provider for all internal estate systems.',
    tags: ['red-team', 'identity', 'critical'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.akamai, TECH.nginx, TECH.keycloak, TECH.k8s, TECH.redis),
  },
  {
    name: 'Cobalt Engineer Portal',
    baseUrl: 'https://engineer.cobaltenergy.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 8,
    description: 'Field engineer portal for substation telemetry and maintenance records.',
    tags: ['critical-infrastructure', 'engineer-facing'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.nginx, TECH.aspnet, TECH.postgres, TECH.sentry),
  },
  {
    name: 'Cobalt Telemetry Dashboard',
    baseUrl: 'https://telemetry.cobaltenergy.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 8,
    description: 'Grid telemetry visualisation dashboard and historical data explorer.',
    tags: ['critical-infrastructure', 'read-mostly'],
    allowedPaths: ['/'],
    excludedPaths: ['/data/bulk/*'],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.express, TECH.postgres),
  },
  {
    name: 'Perch Payments API',
    baseUrl: 'https://api.perchpayments.example',
    type: 'api',
    environment: 'production',
    projectIndex: 9,
    description: 'Card processing API including merchant onboarding and settlement.',
    tags: ['api', 'pci', 'payments'],
    allowedPaths: ['/'],
    excludedPaths: ['/internal/*'],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.spring, TECH.mysql, TECH.stripe),
  },
  {
    name: 'Perch Merchant Dashboard',
    baseUrl: 'https://dashboard.perchpayments.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 9,
    description: 'Merchant-facing dashboard for transaction review and payouts.',
    tags: ['payments', 'pci'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.cloudflare, TECH.nginx, TECH.rails, TECH.mysql),
  },
  {
    name: 'Halcyon Booking Engine',
    baseUrl: 'https://book.halcyontravel.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 10,
    description: 'Public booking engine covering flights, hotels and ancillaries.',
    tags: ['travel', 'customer-facing', 'payments'],
    allowedPaths: ['/'],
    excludedPaths: ['/admin/*'],
    stack: stack(TECH.cloudfront, TECH.nginx, TECH.next, TECH.react, TECH.adyen),
  },
  {
    name: 'Halcyon Back Office',
    baseUrl: 'https://ops.halcyontravel.example',
    type: 'web_application',
    environment: 'production',
    projectIndex: 10,
    authorised: false,
    description: 'Reservations operations back office with manual override capability.',
    tags: ['internal', 'operations'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.laravel, TECH.mysql, TECH.jquery),
  },
  {
    name: 'Tessera Ops Console',
    baseUrl: 'https://console.tesseralearning.example',
    type: 'web_application',
    environment: 'lab',
    projectIndex: null,
    authorised: false,
    description: 'Internal assessment tooling awaiting project assignment.',
    tags: ['unassigned', 'internal'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.nginx, TECH.django, TECH.postgres),
  },
  {
    name: 'Meridian Assurance Sandbox',
    baseUrl: 'https://sandbox.meridianassurance.example',
    type: 'api',
    environment: 'lab',
    projectIndex: null,
    authorised: false,
    description: 'Partner integration sandbox retained for internal capability testing.',
    tags: ['unassigned', 'sandbox'],
    allowedPaths: ['/'],
    excludedPaths: [],
    stack: stack(TECH.cloudflare, TECH.express, TECH.mongo),
  },
]

const AUTHORISATION_NOTES: string[] = [
  'Written authorisation signed by the client CISO on 14 September 2026. Scope limited to the hosts listed for this target.',
  'Authorisation letter countersigned by the partner integration lead. Data handling agreement is in force for all test data.',
  'Authorised under master services agreement schedule 4. No production data may be modified; test accounts are provided.',
]

/** Shown instead of a note when the paperwork has not been received. */
const PENDING_AUTHORISATION_NOTE =
  'Awaiting countersigned authorisation from the client. No testing may start until this is recorded.'


function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function createTargets(projectIds: readonly string[], rng: Rng): Target[] {
  return TARGET_SEEDS.map((seed, index) => {
    const projectId =
      seed.projectIndex === null ? null : (projectIds[seed.projectIndex] ?? null)

    const scope: ScopeConfig = {
      allowedPaths: seed.allowedPaths,
      excludedPaths: seed.excludedPaths,
      allowedDomains: [hostOf(seed.baseUrl)],
      excludedDomains: seed.type === 'api' ? ['metadata.google.internal'] : [],
      authorizationConfirmed: seed.authorised !== false,
      authorizationNote:
        seed.authorised === false
          ? PENDING_AUTHORISATION_NOTE
          : (AUTHORISATION_NOTES[(seed.projectIndex ?? 0) % AUTHORISATION_NOTES.length] ?? ''),
    }

    return {
      id: paddedId('tgt', index + 1, 3),
      projectId,
      name: seed.name,
      baseUrl: seed.baseUrl,
      type: seed.type,
      environment: seed.environment,
      description: seed.description,
      scope,
      tags: seed.tags,
      createdAt: isoAgo(38 - index, randomInt(rng, 0, 6)),
      updatedAt: isoAgo(randomInt(rng, 0, 5), randomInt(rng, 0, 23)),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Technology fingerprint                                                       */
/* -------------------------------------------------------------------------- */

/** Reveals `depth` entries from the seeded stack, so fingerprints differ. */
export function createTechnologies(
  targets: readonly Target[],
  rng: Rng,
): Record<string, Technology[]> {
  const result: Record<string, Technology[]> = {}
  TARGET_SEEDS.forEach((seed, index) => {
    const target = targets[index]
    if (!target) return
    const depth = Math.min(seed.stack.length, randomInt(rng, 3, seed.stack.length))
    result[target.id] = seed.stack.slice(0, depth)
  })
  return result
}

/* -------------------------------------------------------------------------- */
/* Endpoint discovery                                                           */
/* -------------------------------------------------------------------------- */

interface EndpointTemplate {
  method: HttpMethod
  path: string
  parameters?: string[]
  authRequired?: boolean
}

const WEB_ENDPOINTS: EndpointTemplate[] = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/login' },
  { method: 'POST', path: '/login', parameters: ['email', 'password'] },
  { method: 'GET', path: '/account' },
  { method: 'GET', path: '/search', parameters: ['q', 'page'] },
  { method: 'GET', path: '/products', parameters: ['category', 'sort'] },
  { method: 'GET', path: '/products/{id}' },
  { method: 'POST', path: '/cart', parameters: ['sku', 'quantity'] },
  { method: 'GET', path: '/cart' },
  { method: 'POST', path: '/checkout', parameters: ['total', 'discount_code'] },
  { method: 'GET', path: '/orders' },
  { method: 'GET', path: '/orders/{id}' },
  { method: 'GET', path: '/blog' },
  { method: 'GET', path: '/support/ticket' },
  { method: 'POST', path: '/support/ticket', parameters: ['subject', 'body'] },
  { method: 'GET', path: '/settings' },
  { method: 'GET', path: '/admin/users' },
  { method: 'POST', path: '/api/session' },
  { method: 'GET', path: '/api/user/profile' },
  { method: 'PATCH', path: '/api/user/profile', parameters: ['role', 'first_name'] },
  { method: 'GET', path: '/api/orders' },
  { method: 'GET', path: '/api/orders/{id}' },
  { method: 'PATCH', path: '/api/orders/{id}', parameters: ['total', 'status'] },
  { method: 'GET', path: '/api/invoices', parameters: ['status'] },
  { method: 'POST', path: '/api/uploads/avatar', parameters: ['file'] },
  { method: 'GET', path: '/download', parameters: ['file'] },
  { method: 'GET', path: '/api/debug/config' },
  { method: 'GET', path: '/sitemap.xml' },
  { method: 'GET', path: '/robots.txt' },
]

const API_ENDPOINTS: EndpointTemplate[] = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/openapi.json' },
  { method: 'GET', path: '/api/user' },
  { method: 'GET', path: '/api/orders' },
  { method: 'GET', path: '/api/orders/{id}' },
  { method: 'GET', path: '/api/products' },
  { method: 'GET', path: '/api/products/{id}' },
  { method: 'GET', path: '/api/invoices', parameters: ['status'] },
  { method: 'GET', path: '/api/invoices/{id}' },
  { method: 'GET', path: '/api/documents/{id}' },
  { method: 'GET', path: '/api/admin/settings' },
  { method: 'GET', path: '/api/admin/users' },
  { method: 'GET', path: '/api/internal/metrics' },
  { method: 'POST', path: '/api/auth/login', parameters: ['email', 'password'] },
  { method: 'GET', path: '/api/auth/forgot-password' },
  { method: 'POST', path: '/api/account/password', parameters: ['password'] },
  { method: 'POST', path: '/api/import/url', parameters: ['url'] },
  { method: 'POST', path: '/api/import/xml', parameters: ['xml'] },
  { method: 'POST', path: '/api/integrations/webhook-test', parameters: ['webhook_url'] },
  { method: 'GET', path: '/api/files/download', parameters: ['path'] },
  { method: 'GET', path: '/api/health/detailed' },
  { method: 'GET', path: '/health' },
  { method: 'OPTIONS', path: '/api/orders' },
]

const SERVICE_ENDPOINTS: EndpointTemplate[] = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/metrics' },
  { method: 'GET', path: '/api/status' },
  { method: 'GET', path: '/api/config' },
  { method: 'GET', path: '/api/health/detailed' },
  { method: 'GET', path: '/api/internal/users' },
  { method: 'GET', path: '/actuator/health' },
  { method: 'GET', path: '/actuator/env' },
  { method: 'GET', path: '/swagger-ui/' },
  { method: 'GET', path: '/v2/api-docs' },
  { method: 'GET', path: '/api/session' },
  { method: 'GET', path: '/debug/pprof' },
  { method: 'GET', path: '/api/orders/invalid', parameters: ['id'] },
]

function poolForType(type: TargetType): EndpointTemplate[] {
  switch (type) {
    case 'api':
      return API_ENDPOINTS
    case 'web_service':
      return SERVICE_ENDPOINTS
    case 'web_application':
      return WEB_ENDPOINTS
  }
}

/** Populates `{id}` segments with plausible identifiers. */
export function materialisePath(path: string, rng: Rng): string {
  return path.replace(/\{(\w+)\}/g, (_match, key: string) => {
    switch (key) {
      case 'id':
        return String(randomInt(rng, 8800, 9900))
      default:
        return String(randomInt(rng, 100, 999))
    }
  })
}

/** Realistic discovered-surface size per target type. */
const ENDPOINT_COUNT_RANGE: Record<TargetType, [number, number]> = {
  web_application: [5, 11],
  api: [5, 10],
  web_service: [4, 8],
}

export function createEndpoints(targets: readonly Target[], rng: Rng): Endpoint[] {
  const endpoints: Endpoint[] = []
  let sequence = 1

  for (const target of targets) {
    const pool = poolForType(target.type)
    const [min, max] = ENDPOINT_COUNT_RANGE[target.type]
    const count = randomInt(rng, min, Math.min(max, pool.length))
    const templates = pickMany(rng, pool, count)
    const discoveredAt = isoAgo(randomInt(rng, 1, 30), randomInt(rng, 0, 12))

    for (const template of templates) {
      endpoints.push({
        id: paddedId('ep', sequence, 4),
        targetId: target.id,
        method: template.method,
        path: materialisePath(template.path, rng),
        contentType: template.method === 'POST' || template.method === 'PATCH' ? 'application/json' : 'text/html',
        parameters: template.parameters ?? [],
        discoveredAt,
        authRequired: template.authRequired ?? (template.path.startsWith('/api/') || template.path.includes('{id}')),
      })
      sequence += 1
    }
  }

  return endpoints
}
