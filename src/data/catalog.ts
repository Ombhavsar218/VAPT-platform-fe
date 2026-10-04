import type { Evidence, HttpMethod, Reference, VulnerabilityType } from '@/types'
import { owaspUrl } from './owasp'

/**
 * Catalogue of vulnerability classes VAPTFlow can report.
 *
 * Every entry carries the analyst-facing copy (description, impact,
 * remediation) and a builder that renders realistic HTTP evidence. The mock
 * findings layer instantiates these against real-looking targets and endpoints,
 * so the register reads like an actual assessment rather than repeated filler.
 */

export interface EvidenceContext {
  host: string
  path: string
  method: HttpMethod
  parameter: string | null
  /** The value that triggered detection, e.g. the marker or path traversal. */
  value: string
  /** Overrides for evidence that needs a different host (e.g. TLS findings). */
  requestHost?: string
  extraHeaders?: Record<string, string>
}

export interface VulnTemplate extends Omit<VulnerabilityType, 'id'> {
  id: string
  /** One-line analyst summary shown in registers and tooltips. */
  summary: string
  /** How the scanner concluded the issue was present. */
  detectionReason: string
  /** Business and technical consequence of successful exploitation. */
  impact: string
  references: Reference[]
  /** Paths where this class of issue typically surfaces. */
  candidatePaths: string[]
  methods: HttpMethod[]
  parameters: string[]
  buildEvidence: (context: EvidenceContext) => Evidence
}

function owaspRef(owaspId: string, title: string): Reference {
  return { id: `ref-${owaspId}`, label: `${owaspId.split(':')[0]} ${title}`, url: owaspUrl(owaspId), source: 'owasp' }
}

/* -------------------------------------------------------------------------- */
/* Evidence builders                                                           */
/* -------------------------------------------------------------------------- */

function buildRequest(
  context: EvidenceContext,
  options: { version?: string; body?: string; extraHeaders?: Record<string, string> } = {},
): string {
  const host = context.requestHost ?? context.host
  const query =
    context.parameter && context.method === 'GET'
      ? `?${context.parameter}=${encodeURIComponent(context.value)}`
      : ''

  const lines = [
    `${context.method} ${context.path}${query} HTTP/${options.version ?? '1.1'}`,
    `Host: ${host}`,
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language: en-GB,en;q=0.9',
    'Connection: keep-alive',
    ...Object.entries(options.extraHeaders ?? context.extraHeaders ?? {}).map(
      ([key, value]) => `${key}: ${value}`,
    ),
  ]

  if (options.body) {
    lines.push('Content-Type: application/x-www-form-urlencoded', '', options.body)
  }

  return lines.join('\r\n')
}

function buildResponse(
  _context: EvidenceContext,
  options: {
    status?: number
    reason?: string
    headers?: Record<string, string>
    body?: string
  } = {},
): string {
  const status = options.status ?? 200
  const reason = options.reason ?? 'OK'

  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(options.body?.length ?? 0),
    'Server': 'nginx/1.25.3',
    'Date': 'Thu, 24 Sep 2026 09:41:12 GMT',
    'Cache-Control': 'no-store',
    ...options.headers,
  }

  const lines = [
    `HTTP/1.1 ${status} ${reason}`,
    ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
  ]

  if (options.body !== undefined) lines.push('', options.body)
  return lines.join('\r\n')
}

const securityHeadersOk: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.example.com",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

export const VULN_TEMPLATES: VulnTemplate[] = [
  {
    id: 'vt-xss-reflected',
    name: 'Reflected Cross-Site Scripting',
    slug: 'reflected-xss',
    cweId: 'CWE-79',
    owaspId: 'A05:2025',
    severity: 'medium',
    summary: 'User-supplied input is echoed into an HTML response without output encoding.',
    description:
      'The application reflects request parameters directly into the returned HTML document without contextual output encoding. A crafted value in the affected parameter is parsed as active markup by the browser, allowing script execution in the context of the application origin.',
    detectionReason:
      'A non-HTML marker submitted in the parameter was returned verbatim inside the HTML body of the response, unescaped and outside of any script context. The response Content-Type is text/html, so the browser will parse and execute the injected markup.',
    impact:
      'An attacker who can persuade a user to open a crafted link can execute script in that user\'s session. This allows cookie and token theft, session hijacking, keylogging of form input, and actions performed as the victim. Because the payload travels in the URL, no server-side state is required.',
    remediation:
      'Apply context-aware output encoding at the point of rendering — HTML entity encoding for element content, JavaScript encoding inside script blocks, and URL encoding for attribute values. Prefer auto-escaping templates over string concatenation. As defence in depth, deploy a Content-Security-Policy that disallows inline script, and set HttpOnly on session cookies to reduce the impact of token theft.',
    references: [
      owaspRef('A05:2025', 'Injection'),
      { id: 'ref-owasp-xss', label: 'OWASP Cross Site Scripting Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html', source: 'owasp' },
    ],
    candidatePaths: ['/search', '/products', '/blog', '/support/ticket', '/newsletter', '/catalog'],
    methods: ['GET', 'POST'],
    parameters: ['q', 'query', 'search', 'keyword', 'ref', 'sort'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-24T09:41:12.000Z',
      request: buildRequest(context, {
        extraHeaders: { Cookie: 'csrftoken=8fB2q1zX0dLm4vT9; sessionid=s%3A7Kq2Pz91' },
      }),
      response: buildResponse(context, {
        body: `<!DOCTYPE html>
<html lang="en">
  <head><title>Search results</title></head>
  <body>
    <h1>Search results</h1>
    <p>No results found for <span class="query">${context.value}</span></p>
    <a href="/support">Contact support</a>
  </body>
</html>`,
      }),
    }),
  },
  {
    id: 'vt-xss-stored',
    name: 'Stored Cross-Site Scripting',
    slug: 'stored-xss',
    cweId: 'CWE-79',
    owaspId: 'A05:2025',
    severity: 'high',
    summary: 'Persistent input is stored and later rendered unescaped to other users.',
    description:
      'Content submitted by one user is persisted and rendered to other users without output encoding. Unlike reflected XSS, no crafted link is required — the payload executes for every visitor who views the affected record, including privileged reviewers and administrators.',
    detectionReason:
      'A stored marker submitted through the content field was rendered unescaped in the response served to a separate, unauthenticated session, confirming the value is persisted and displayed to other users.',
    impact:
      'Stored XSS typically achieves unauthenticated compromise of privileged users, because administrative views render the same user-supplied content. In a VAPT context this can escalate a low-privilege account to full control of the application and its data.',
    remediation:
      'Sanitise input on write using an allow-list HTML sanitiser appropriate to the field, and encode on output as the primary control. Store and render structured data rather than raw HTML wherever possible. Enforce a strict Content-Security-Policy and consider a separate, cookie-isolated origin for user-generated content.',
    references: [
      owaspRef('A05:2025', 'Injection'),
      { id: 'ref-owasp-xss', label: 'OWASP Cross Site Scripting Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html', source: 'owasp' },
    ],
    candidatePaths: ['/api/tickets', '/api/comments', '/api/feedback', '/profile/bio'],
    methods: ['POST', 'PUT', 'PATCH'],
    parameters: ['body', 'comment', 'description', 'message'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-23T16:08:44.000Z',
      request: buildRequest(context, {
        body: `${context.parameter ?? 'body'}=${encodeURIComponent(context.value)}`,
        extraHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.mock' },
      }),
      response: buildResponse(context, {
        status: 201,
        reason: 'Created',
        headers: { 'Content-Type': 'application/json' },
        body: `{
  "id": "tkt_88123",
  "status": "open",
  "body": "${context.value}",
  "created_by": "usr_40211",
  "created_at": "2026-09-23T16:08:41Z"
}`,
      }),
    }),
  },
  {
    id: 'vt-sqli-error',
    name: 'SQL Injection (error-based)',
    slug: 'sql-injection-error',
    cweId: 'CWE-89',
    owaspId: 'A05:2025',
    severity: 'critical',
    summary: 'Parameter is concatenated into a SQL statement; database errors are returned to the client.',
    description:
      'The affected parameter is inserted into a database query without parameterisation. A quote-terminated value alters the intended statement, and the resulting database error is reflected in the HTTP response, confirming the injection point is reachable and the errors are exposed.',
    detectionReason:
      "A single-quote terminated value caused the response status to change and the response body to include the underlying database driver's error text and the fragment of the executed statement, confirming the parameter is concatenated rather than bound.",
    impact:
      'An attacker can read, modify or delete any record the application account can reach, and in many deployments escalate to operating-system command execution through database features. Confidentiality of all data accessible to the application is considered lost, and integrity of that data is at risk.',
    remediation:
      'Use parameterised queries or prepared statements for every database access, including dynamic ORDER BY and table names via strict allow-lists. Remove string interpolation from query construction. Additionally disable verbose database errors in production and return generic failure messages to the client while logging detail server-side.',
    references: [
      owaspRef('A05:2025', 'Injection'),
      { id: 'ref-owasp-sqli', label: 'OWASP SQL Injection Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html', source: 'owasp' },
    ],
    candidatePaths: ['/api/orders', '/api/products', '/api/invoices', '/reports/sales', '/api/customers/search'],
    methods: ['GET', 'POST'],
    parameters: ['id', 'order_id', 'invoice', 'filter', 'sort', 'status'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-22T11:27:03.000Z',
      request: buildRequest(context, {
        extraHeaders: { Cookie: 'sessionid=s%3A7Kq2Pz91' },
      }),
      response: buildResponse(context, {
        status: 500,
        reason: 'Internal Server Error',
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Powered-By': 'PHP/8.2.7' },
        body: `<h1>SQLSTATE[42000]: Syntax error or access violation: 1064</h1>
<p>You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near ''' at line 1</p>
<pre>SELECT * FROM orders WHERE customer_id = '15' AND status = ''' LIMIT 50</pre>`,
      }),
    }),
  },
  {
    id: 'vt-sqli-blind',
    name: 'SQL Injection (time-based, blind)',
    slug: 'sql-injection-blind',
    cweId: 'CWE-89',
    owaspId: 'A05:2025',
    severity: 'high',
    summary: 'Response timing varies with a conditional delay, indicating injectable query logic.',
    description:
      'The affected parameter influences the execution time of a database query. An injected conditional delay changes the response latency in a way that corresponds to the supplied expression, indicating a blind injection point even though no database content is returned directly.',
    detectionReason:
      'Baseline requests returned in 120–180 ms. Requests containing a conditional delay returned after 5.0–5.4 s consistently across repeated samples, correlating with the injected condition rather than network variance.',
    impact:
      'Blind injection still permits full database extraction character by character, including credentials and personal data, at the cost of speed. Depending on database privileges it may also allow data modification or file access.',
    remediation:
      'Replace dynamic query construction with parameterised statements. Where an identifier must be dynamic, validate it against a strict allow-list. Apply the principle of least privilege to the database account used by the application, and remove unnecessary grants such as FILE or schema-modification rights.',
    references: [owaspRef('A05:2025', 'Injection')],
    candidatePaths: ['/api/products', '/api/orders', '/api/invoices', '/api/search'],
    methods: ['GET', 'POST'],
    parameters: ['id', 'category', 'status', 'page'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-22T11:31:55.000Z',
      request: buildRequest(context),
      response: `Baseline (control) — 3 samples
GET ${context.path}${context.parameter}=15 HTTP/1.1
→ 200 OK, 142 ms
→ 200 OK, 138 ms
→ 200 OK, 151 ms

Conditional delay — 3 samples
GET ${context.path}${context.parameter}=15${context.value} HTTP/1.1
→ 200 OK, 5240 ms
→ 200 OK, 5312 ms
→ 200 OK, 5188 ms

Delta: ~5.1 s, consistent across samples.`,
    }),
  },
  {
    id: 'vt-idor',
    name: 'Insecure Direct Object Reference',
    slug: 'idor',
    cweId: 'CWE-639',
    owaspId: 'A01:2025',
    severity: 'high',
    summary: 'Object identifiers can be substituted to access records belonging to other users.',
    description:
      'The endpoint returns a record based on an identifier supplied in the request without verifying that the authenticated principal owns or is entitled to that record. Substituting another valid identifier returns that record\'s data in full.',
    detectionReason:
      'Requesting the endpoint with a sequential identifier belonging to a different account returned that account\'s record with populated personal fields, using only the low-privilege session. No ownership or tenancy check rejected the request.',
    impact:
      'Any authenticated user can read the records of every other user by enumerating identifiers, exposing personal data, order history, stored documents and potentially internal notes. Sequential identifiers make bulk enumeration trivial, so the exposure is typically workspace-wide.',
    remediation:
      'Enforce authorisation server-side on every object access: resolve the object, then verify the current principal has a grant for that specific object before returning any data. Do not rely on unguessable identifiers as the control. Scope queries by tenant or owner in the data-access layer so unauthorised rows are never loaded, and prefer sequential-internal keys with an authorisation check over exposed UUIDs.',
    references: [owaspRef('A01:2025', 'Broken Access Control')],
    candidatePaths: ['/api/users/{id}', '/api/orders/{id}', '/api/invoices/{id}', '/api/accounts/{id}', '/api/documents/{id}'],
    methods: ['GET'],
    parameters: ['id', 'user_id', 'order_id'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-21T08:14:29.000Z',
      request: buildRequest(context, {
        extraHeaders: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usr_40211.sig', Cookie: 'sessionid=s%3A7Kq2Pz91' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "id": "usr_40211",
  "full_name": "Priya Raghunathan",
  "email": "priya.raghunathan@example.com",
  "phone": "+44 7700 900412",
  "address": { "line1": "14B Cavendish Road", "city": "Bristol", "postcode": "BS8 3AH" },
  "date_of_birth": "1989-04-22",
  "payment_last4": "4417",
  "role": "customer"
}`,
      }),
    }),
  },
  {
    id: 'vt-bac-missing',
    name: 'Missing Function-Level Access Control',
    slug: 'missing-function-access-control',
    cweId: 'CWE-862',
    owaspId: 'A01:2025',
    severity: 'high',
    summary: 'Administrative functionality is reachable without an appropriate role.',
    description:
      'A privileged route or API operation does not verify that the caller holds the required role. A low-privilege authenticated session can invoke administrative functionality directly, bypassing the UI restriction that would normally hide it.',
    detectionReason:
      'A session authenticated as a standard user obtained HTTP 200 from an administrative endpoint that the interface restricts to administrators. The response included administrative data, and no role check rejected the request.',
    impact:
      'Standard users gain administrative capability: managing other accounts, altering configuration, reading audit data, or triggering privileged operations. On shared or multi-tenant deployments this is a straightforward route to full workspace compromise.',
    remediation:
      'Enforce role and permission checks server-side on every privileged operation, at the API or service layer rather than in the interface. Default to deny. Do not treat route visibility as authorisation. Re-test with an unprivileged token after any change to the permission model, and add automated authorisation tests to the CI pipeline.',
    references: [owaspRef('A01:2025', 'Broken Access Control')],
    candidatePaths: ['/api/admin/users', '/api/admin/settings', '/api/admin/reports', '/admin/users'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-20T13:52:07.000Z',
      request: buildRequest(context, {
        extraHeaders: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usr_40211.sig', 'X-CSRF-Token': '8fB2q1zX0dLm4vT9' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "total": 18422,
  "users": [
    { "id": "usr_40211", "email": "priya.r@example.com", "role": "standard_user", "last_login": "2026-09-20T11:02:44Z" },
    { "id": "usr_40218", "email": "admin@example.com", "role": "administrator", "last_login": "2026-09-20T09:44:10Z" }
  ],
  "requires_role": "administrator"
}`,
      }),
    }),
  },
  {
    id: 'vt-path-traversal',
    name: 'Path Traversal',
    slug: 'path-traversal',
    cweId: 'CWE-22',
    owaspId: 'A01:2025',
    severity: 'high',
    summary: 'A file path is built from user input without normalisation or containment checks.',
    description:
      'The affected parameter is used to construct a filesystem path without resolving and validating the result against a permitted base directory. Traversal sequences escape the intended directory and allow files elsewhere on the server to be retrieved.',
    detectionReason:
      'A traversal sequence in the parameter returned the contents of a file outside the intended upload directory, and the application returned a distinct "file not found" response for a non-existent name in the same directory, confirming the path is being resolved on the server.',
    impact:
      'An attacker can read application source code, configuration files containing database credentials and API keys, private keys, and host files readable by the service account. Reading source frequently enables further compromise, including secret recovery.',
    remediation:
      'Resolve the requested path to an absolute canonical form and verify it remains inside the intended base directory before opening it; reject anything that escapes, including after symlink resolution. Better, map an opaque identifier to a known file server-side so the client never supplies a path at all. Never expose configuration or credential files within a served directory.',
    references: [owaspRef('A01:2025', 'Broken Access Control')],
    candidatePaths: ['/api/files/download', '/api/documents/fetch', '/download', '/api/attachments/{id}'],
    methods: ['GET'],
    parameters: ['file', 'path', 'name', 'document'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-19T15:38:20.000Z',
      request: buildRequest(context),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeadersOk },
        body: `DATABASE_URL=postgresql://app_user:Hq3-vR8sKp2Lw@db.internal:5432/orders
SECRET_KEY=8f2c1a9e4b7d0356ea1c
REDIS_URL=redis://cache.internal:6379/2
STRIPE_SECRET_KEY=sk_live_51NxQ2p8KmL0vBqRt7YwZa
ADMIN_EMAIL=ops@example.com`,
      }),
    }),
  },
  {
    id: 'vt-ssrf',
    name: 'Server-Side Request Forgery',
    slug: 'ssrf',
    cweId: 'CWE-918',
    owaspId: 'A01:2025',
    severity: 'high',
    summary: 'The server fetches a URL supplied by the user without restricting the destination.',
    description:
      'The application retrieves a remote resource using a URL taken directly from the request. The destination is not restricted to an allow-list of external hosts, so the server can be induced to issue requests to internal addresses and cloud metadata services.',
    detectionReason:
      'Supplying a loopback and link-local address as the resource URL produced a response whose content and timing matched the internal service rather than an outbound fetch failure, indicating the request originated from the server and the destination was not filtered.',
    impact:
      'The server can be used as a proxy into the internal network: port scanning internal hosts, reaching services bound to localhost, and reading cloud instance metadata to obtain IAM credentials in managed environments. This frequently escalates to full cloud account compromise.',
    remediation:
      'Resolve the hostname and reject loopback, link-local, private and reserved ranges, then re-validate after following redirects to prevent DNS rebinding. Use an allow-list of permitted external hosts where possible. Ensure outbound traffic from application servers is filtered by firewall or egress proxy, and disable IMDSv1 on cloud instances.',
    references: [owaspRef('A01:2025', 'Broken Access Control')],
    candidatePaths: ['/api/integrations/webhook-test', '/api/import/url', '/api/webhooks/preview', '/api/avatar/fetch'],
    methods: ['POST', 'GET'],
    parameters: ['url', 'webhook_url', 'endpoint', 'source'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-18T10:05:51.000Z',
      request: buildRequest(context, {
        body: `url=${encodeURIComponent(context.value)}`,
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "status": "ok",
  "fetched_url": "${context.value}",
  "content_type": "text/plain",
  "body_preview": "internal-service-bridge v2.4.1\\nLISTENING 127.0.0.1:8500\\nadmin-token: bridge-9f2c81ab",
  "elapsed_ms": 214
}`,
      }),
    }),
  },
  {
    id: 'vt-csrf',
    name: 'Missing CSRF Protection',
    slug: 'csrf-missing',
    cweId: 'CWE-352',
    owaspId: 'A01:2025',
    severity: 'medium',
    summary: 'A state-changing request is accepted without a valid anti-CSRF token.',
    description:
      'The endpoint performs a state-changing operation and relies only on the ambient session cookie for authentication. No anti-CSRF token, Origin check or SameSite restriction prevents a third-party page from causing the request to be issued with the victim\'s credentials.',
    detectionReason:
      'A state-changing request was accepted with the session cookie but without a CSRF token, and without a matching Origin or Referer header. The operation completed, confirming the request is not bound to the originating page.',
    impact:
      'An attacker can cause an authenticated user to perform unintended actions such as changing email or password, adding payment methods, altering account settings, or approving administrative changes, entirely from a page they visited.',
    remediation:
      'Issue a cryptographically random anti-CSRF token tied to the session, require it on every state-changing request, and validate it server-side. Additionally verify the Origin or Referer header, and set session cookies with SameSite=Lax or Strict. Do not exempt endpoints based solely on content type, since simple cross-origin form posts can use text/plain.',
    references: [owaspRef('A01:2025', 'Broken Access Control')],
    candidatePaths: ['/api/account/email', '/api/account/password', '/api/settings/profile', '/api/billing/method'],
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    parameters: ['email', 'password', 'name'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-17T14:22:38.000Z',
      request: buildRequest(context, {
        body: `${context.parameter ?? 'email'}=attacker-controlled%40evil.example`,
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'sessionid=s%3A7Kq2Pz91' },
      }),
      response: buildResponse(context, {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "status": "updated",
  "account": {
    "email": "attacker-controlled@evil.example",
    "pending_email_confirmation": true,
    "updated_at": "2026-09-17T14:22:36Z"
  }
}`,
      }),
    }),
  },
  {
    id: 'vt-headers-missing',
    name: 'Missing Security Headers',
    slug: 'missing-security-headers',
    cweId: 'CWE-693',
    owaspId: 'A02:2025',
    severity: 'low',
    summary: 'Responses omit recommended browser hardening headers.',
    description:
      'The response does not set several headers that browsers use to constrain the behaviour of injected content. Their absence does not create a vulnerability on its own, but it removes defence in depth against content injection, framing and MIME confusion attacks.',
    detectionReason:
      'Response headers were enumerated across the sample of endpoints. The headers below were absent from every response in the sample.',
    impact:
      'The missing headers widen the impact of other issues. Without Content-Security-Policy, a content injection flaw becomes script execution. Without frame protection, the application can be framed for clickjacking. Without nosniff, browsers may mis-interpret content types.',
    remediation:
      'Set the following at the edge or in a shared response middleware, applied consistently to HTML responses:\n\n- Content-Security-Policy — start with a report-only policy, then enforce; avoid unsafe-inline.\n- Strict-Transport-Security — max-age of at least 31536000, includeSubDomains.\n- X-Content-Type-Options: nosniff\n- X-Frame-Options: DENY, or a CSP frame-ancestors directive\n- Referrer-Policy: strict-origin-when-cross-origin\n- Permissions-Policy — restrict unused browser capabilities',
    references: [owaspRef('A02:2025', 'Security Misconfiguration')],
    candidatePaths: ['/login', '/dashboard', '/settings', '/reports', '/', '/api/status'],
    methods: ['GET'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-16T09:02:14.000Z',
      request: buildRequest(context),
      response: buildResponse(context, {
        headers: { 'X-Powered-By': 'Express', 'X-Request-Id': 'req_7Kd92LpX' },
        body: `<!DOCTYPE html>
<html lang="en"><head><title>Dashboard</title></head>
<body><h1>Dashboard</h1></body></html>

— Absent across the sampled responses —
  Content-Security-Policy
  Strict-Transport-Security
  X-Content-Type-Options
  X-Frame-Options
  Referrer-Policy
  Permissions-Policy

— Present —
  Content-Type: text/html; charset=utf-8
  Server: nginx/1.25.3
  X-Powered-By: Express`,
      }),
    }),
  },
  {
    id: 'vt-cors',
    name: 'Permissive Cross-Origin Resource Sharing Policy',
    slug: 'cors-misconfiguration',
    cweId: 'CWE-942',
    owaspId: 'A02:2025',
    severity: 'medium',
    summary: 'CORS reflects arbitrary origins and allows credentialed requests.',
    description:
      'The application reflects any supplied Origin into Access-Control-Allow-Origin and additionally sets Access-Control-Allow-Credentials. Any website on the internet can therefore make authenticated, readable cross-origin requests to the API from a victim\'s browser.',
    detectionReason:
      'A request with an attacker-controlled Origin header was echoed verbatim in Access-Control-Allow-Origin, with Access-Control-Allow-Credentials set to true. The response body was readable from that foreign origin.',
    impact:
      'A malicious page visited by an authenticated user can read API responses on their behalf — profile data, tokens, order history, internal records — and can perform state-changing operations. This is a cross-origin data theft primitive that does not require any injection flaw.',
    remediation:
      'Replace origin reflection with a strict allow-list of permitted origins, compared exactly. Do not combine a wildcard or reflected origin with Access-Control-Allow-Credentials. Do not cache responses that vary on Origin without a precise Vary: Origin header, as a shared cache could serve one origin\'s response to another.',
    references: [owaspRef('A02:2025', 'Security Misconfiguration')],
    candidatePaths: ['/api/user', '/api/orders', '/api/session', '/api/internal/metrics'],
    methods: ['GET', 'OPTIONS'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-15T18:44:02.000Z',
      request: buildRequest(context, {
        extraHeaders: { Origin: 'https://evil.example', Cookie: 'sessionid=s%3A7Kq2Pz91' },
      }),
      response: buildResponse(context, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://evil.example',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token',
          Vary: 'Origin',
          ...securityHeadersOk,
        },
        body: `{
  "user": { "id": "usr_40211", "email": "priya.r@example.com", "role": "standard_user" },
  "session": { "issued_at": "2026-09-15T08:12:00Z", "mfa": true },
  "preferences": { "language": "en-GB", "timezone": "Europe/London" }
}`,
      }),
    }),
  },
  {
    id: 'vt-info-disclosure',
    name: 'Information Disclosure',
    slug: 'information-disclosure',
    cweId: 'CWE-200',
    owaspId: 'A02:2025',
    severity: 'medium',
    summary: 'An endpoint returns internal or sensitive data to unauthenticated callers.',
    description:
      'The endpoint exposes internal application state — configuration, credentials, user records or infrastructure detail — to a request that carries no valid authentication, or more data than the caller is entitled to see.',
    detectionReason:
      'The endpoint was requested without authentication and returned structured internal data rather than a 401 or 403 response, including fields that are not referenced anywhere in the user interface.',
    impact:
      'Exposed data materially reduces the effort needed to compromise the application. Version and configuration detail enables targeted exploit selection, while user or tenant records constitute a direct privacy breach and may carry notification obligations.',
    remediation:
      'Require authentication and an explicit authorisation check on the endpoint, and return only the fields the caller needs. Move internal-only endpoints behind a separate administrative surface or network policy. Remove secrets and connection strings from responses entirely — rotate anything that has already been exposed.',
    references: [owaspRef('A02:2025', 'Security Misconfiguration')],
    candidatePaths: ['/api/debug/config', '/api/internal/users', '/api/health/detailed', '/.env', '/api/config'],
    methods: ['GET'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-14T12:19:47.000Z',
      request: buildRequest(context),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "environment": "production",
  "release": "2026.09.3",
  "git_sha": "a91f4c0e77b2",
  "database": { "engine": "postgresql", "host": "db.internal", "pool_max": 40, "replica_lag_ms": 12 },
  "integrations": {
    "payments": { "provider": "stripe", "live_mode": true },
    "email": { "provider": "ses", "from": "no-reply@example.com" }
  },
  "feature_flags": { "new_checkout": true, "legacy_pricing": false },
  "internal_notes": "Vendor sandbox key rotates monthly; prod key in vault path kv/prod/psp"
}`,
      }),
    }),
  },
  {
    id: 'vt-error-verbose',
    name: 'Verbose Error Messages',
    slug: 'verbose-error-messages',
    cweId: 'CWE-209',
    owaspId: 'A10:2025',
    severity: 'low',
    summary: 'Unhandled exceptions leak stack traces and internal implementation detail.',
    description:
      'An unhandled exception returns a debug response containing a stack trace, source file paths, library versions or database text. The information is not intended for end users and assists an attacker in understanding the internals of the application.',
    detectionReason:
      'A malformed request triggered an unhandled exception. The response body included a framework stack trace with file paths, line numbers and dependency versions, and the HTTP status was 500 rather than a handled error response.',
    impact:
      'Stack traces reveal framework versions, directory layout and code structure, which accelerates targeted attack and makes vulnerability discovery far cheaper. Leaked queries or configuration fragments may also disclose data directly.',
    remediation:
      'Configure the framework to render a generic error page in production while logging full detail server-side with a correlation identifier. Return a stable error code to the client so support can trace the request without exposing internals. Ensure the debug mode is not reachable by any environment flag an attacker can influence.',
    references: [owaspRef('A10:2025', 'Mishandling of Exceptional Conditions')],
    candidatePaths: ['/api/orders/invalid', '/api/parse', '/internal/error'],
    methods: ['GET', 'POST'],
    parameters: ['id', 'format'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-13T07:55:31.000Z',
      request: buildRequest(context),
      response: buildResponse(context, {
        status: 500,
        reason: 'Internal Server Error',
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Powered-By': 'PHP/8.2.7' },
        body: `<h1>Whoops, looks like something went wrong.</h1>
<p class="message">SQLSTATE[42P01]: Undefined table: 7 =&gt; SELECT * FROM "order_itemz" WHERE "id" = $1</p>
<pre class="trace">
#0 /var/www/app/src/Repository/OrderRepository.php(88): PDOStatement-&gt;execute()
#1 /var/www/app/src/Controller/OrderController.php(41): App\\Repository\\OrderRepository-&gt;find()
#2 /var/www/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(52): App\\Controller\\OrderController-&gt;show()
#3 /var/www/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(256): App\\Controller\\OrderController-&gt;show()
</pre>`,
      }),
    }),
  },
  {
    id: 'vt-cookie-flags',
    name: 'Insecure Session Cookie Attributes',
    slug: 'insecure-cookie-attributes',
    cweId: 'CWE-1004',
    owaspId: 'A07:2025',
    severity: 'low',
    summary: 'Session cookies are missing HttpOnly and/or Secure attributes.',
    description:
      'The session cookie is set without one or both of the attributes that prevent it being read by client-side script or transmitted over plaintext connections. This does not create an independent vulnerability, but it materially increases the impact of a content injection flaw.',
    detectionReason:
      'The Set-Cookie header for the session identifier omitted HttpOnly, and for an insecure-context route the Secure attribute was also absent. The cookie was issued over a request that the application itself also serves over HTTPS.',
    impact:
      'Without HttpOnly, any successful script injection can read the session token directly. Without Secure, the token can be transmitted over a plaintext connection and captured by a network attacker. Together these turn a moderate content injection into full session compromise.',
    remediation:
      'Set HttpOnly and Secure on every session cookie, plus SameSite=Lax or Strict where the application does not require cross-site session use. Prefer the __Host- prefix, which browsers enforce as Secure, path-anchored and host-only. Apply these centrally so new endpoints inherit them.',
    references: [owaspRef('A07:2025', 'Authentication Failures')],
    candidatePaths: ['/login', '/api/session', '/set-cookie'],
    methods: ['GET'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-12T16:08:19.000Z',
      request: buildRequest(context),
      response: [
        'HTTP/1.1 200 OK',
        'Set-Cookie: sessionid=s%3A7Kq2Pz91vT9hR4mLxB8dW2; Path=/; HttpOnly',
        'Set-Cookie: tracking_id=4f8b2c91ae37; Path=/',
        'Content-Type: text/html; charset=utf-8',
        ...Object.entries(securityHeadersOk),
        '',
        '<!DOCTYPE html><html lang="en"><body>Signed in.</body></html>',
        '',
        'sessionid  — HttpOnly present, Secure ABSENT, SameSite ABSENT',
        'tracking_id — HttpOnly ABSENT, Secure ABSENT, SameSite ABSENT',
      ].join('\r\n'),
    }),
  },
  {
    id: 'vt-jwt-weak',
    name: 'Weak JWT Signature Validation',
    slug: 'jwt-weak-validation',
    cweId: 'CWE-347',
    owaspId: 'A07:2025',
    severity: 'high',
    summary: 'The API accepts tokens whose signature algorithm is not verified as expected.',
    description:
      'The API accepts a bearer token whose header declares an unsigned or algorithm-confused token, and the token is honoured as a valid session. Verification is therefore not being performed against the expected signing algorithm and key.',
    detectionReason:
      'A token with alg set to "none" and no signature was accepted with HTTP 200, and its claims were used to identify the session. A token signed with a different algorithm than the server expects was also accepted.',
    impact:
      'An attacker can mint a token with arbitrary claims — including administrative roles and any subject identifier — without possessing the signing key, obtaining full impersonation of any user. This is a complete authentication bypass for the affected API.',
    remediation:
      'Explicitly pin the expected algorithm on the server and reject anything else, including "none". Verify the signature against the correct key before reading any claim, and treat unverified claims as untrusted input. Prefer an asymmetric algorithm such as RS256 or ES256 so verifiers cannot be tricked into treating a public key as a signing secret.',
    references: [owaspRef('A07:2025', 'Authentication Failures')],
    candidatePaths: ['/api/user', '/api/orders', '/api/admin/settings'],
    methods: ['GET'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-11T11:37:55.000Z',
      request: buildRequest(context, {
        extraHeaders: { Authorization: 'Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c3JfMDAwMDEiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3ODg5MTIzNDV9.' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "accepted": true,
  "algorithm": "none",
  "signature_verified": false,
  "claims_relied_upon": { "sub": "usr_000001", "role": "admin", "iat": 1788912345 }
}`,
      }),
    }),
  },
  {
    id: 'vt-outdated-component',
    name: 'Outdated Third-Party Component',
    slug: 'outdated-component',
    cweId: 'CWE-1104',
    owaspId: 'A03:2025',
    severity: 'informational',
    summary: 'A dependency is several versions behind its maintained release line.',
    description:
      'Fingerprinting identified a third-party dependency at a version that is no longer supported and is superseded by later releases. This is recorded for supply-chain hygiene rather than as an exploitable finding on its own.',
    detectionReason:
      'The component and version were identified from response headers, asset file names and script source comments, and compared against the current supported release line.',
    impact:
      'Unsupported versions stop receiving security fixes, so any later-disclosed issue in that component remains unpatched. Continued use also increases exposure to supply-chain compromise, since unmaintained packages can lose maintainer control.',
    remediation:
      'Move the dependency to a currently supported release, then enable automated dependency update checking so the gap does not reappear. Track components in a software bill of materials, and add a build step that fails on dependencies with known critical advisories. Where a component is no longer needed, remove it rather than leaving it vendored.',
    references: [owaspRef('A03:2025', 'Software Supply Chain Failures')],
    candidatePaths: ['/'],
    methods: ['GET'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-10T08:14:22.000Z',
      request: buildRequest(context),
      response: [
        'HTTP/1.1 200 OK',
        'X-Powered-By: Express',
        'Content-Type: text/html; charset=utf-8',
        ...Object.entries(securityHeadersOk),
        '',
        '/*! jquery 3.4.1 | jquery.org/license */',
        '/*! lodash 4.17.11 | license.io */',
        '',
        'Detected  jquery  3.4.1   latest supported  3.7.1   (+6 releases, unsupported line)',
        'Detected  lodash  4.17.11 latest supported  4.17.21  (+1 release, 2019 backport line)',
        '',
        'Sources: /assets/jquery.min.js banner comment, /assets/app.js module banner,',
        '         /vendor/lodash/lodash.min.js source map reference',
      ].join('\r\n'),
    }),
  },
  {
    id: 'vt-logging-missing',
    name: 'Insufficient Security Logging',
    slug: 'insufficient-security-logging',
    cweId: 'CWE-778',
    owaspId: 'A09:2025',
    severity: 'medium',
    summary: 'Security-relevant events are not recorded with usable context.',
    description:
      'Authentication failures, authorisation denials, privilege changes and administrative actions either produce no log entry or omit the actor, source and outcome needed to investigate an incident. Detection and response capability is materially reduced.',
    detectionReason:
      'A sequence of failed sign-in attempts, an authorisation denial and an administrative role change were exercised. None produced a corresponding entry in the application log within the observation window, and no alerting fired.',
    impact:
      'Intrusion attempts and post-compromise activity leave no trace, so an incident may go undetected for weeks and cannot be scoped afterwards. Where logging is required for compliance, the gap is also an audit finding in its own right.',
    remediation:
      'Log authentication outcomes, authorisation denials, privilege and permission changes, and administrative actions as structured events including timestamp, actor, source address, target resource and outcome. Centralise the logs, protect them from tampering, retain them for the period your policy requires, and alert on meaningful patterns such as repeated failures or bulk enumeration.',
    references: [owaspRef('A09:2025', 'Security Logging and Alerting Failures')],
    candidatePaths: ['/login', '/api/admin/users', '/api/account/password'],
    methods: ['POST', 'PATCH'],
    parameters: ['username', 'email', 'role'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-09T10:02:18.000Z',
      request: buildRequest(context, {
        body: 'username=admin%40example.com&password=incorrect',
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
      response: [
        'HTTP/1.1 401 Unauthorized',
        'Content-Type: application/json',
        ...Object.entries(securityHeadersOk),
        '',
        '{ "error": "invalid_credentials", "message": "Email or password is incorrect" }',
        '',
        'Actions exercised during the assessment window:',
        '  12 failed sign-ins        → 0 log entries',
        '   1 authorisation denial   → 0 log entries',
        '   1 admin role change      → 0 log entries',
        '',
        'Nearest application log line: 2026-09-09T09:58:02 INFO request completed',
        '(no actor, no outcome, no correlation with the actions above)',
      ].join('\r\n'),
    }),
  },
  {
    id: 'vt-file-upload',
    name: 'Unrestricted File Upload',
    slug: 'unrestricted-file-upload',
    cweId: 'CWE-434',
    owaspId: 'A05:2025',
    severity: 'high',
    summary: 'Uploaded files are accepted without type validation and appear to be served.',
    description:
      'The upload endpoint accepts a file whose content type and extension are not restricted to an allow-list, stores it under a web-servable path, and returns a URL that the application will serve back. No evidence of content re-encoding or execution was found, but the storage and serving model is unsafe.',
    detectionReason:
      'A file with a double extension and a script content type was accepted with HTTP 201 and returned a direct URL. Requesting that URL returned the stored content with the original type, indicating no sanitisation or re-encoding was applied.',
    impact:
      'If the storage location is ever served with a script-executable content type, this becomes remote code execution. Even without execution, hosting attacker-controlled content on a trusted origin enables stored XSS and content spoofing, and can be used to distribute malware from a reputable domain.',
    remediation:
      'Validate uploads against an allow-list of permitted types by inspecting content rather than trusting the supplied filename or content type, and store files outside any web-servable directory. Serve downloads with a fixed safe content type and Content-Disposition: attachment, and set X-Content-Type-Options: nosniff. Generate the stored filename server-side and never reflect the client\'s.',
    references: [owaspRef('A05:2025', 'Injection')],
    candidatePaths: ['/api/uploads/avatar', '/api/attachments', '/api/documents/upload'],
    methods: ['POST'],
    parameters: ['file', 'avatar', 'attachment'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-08T13:29:41.000Z',
      request: [
        `POST ${context.path} HTTP/1.1`,
        `Host: ${context.host}`,
        'Content-Type: multipart/form-data; boundary=----VAPTFlowBoundary',
        'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.usr_40211.sig',
        '',
        '------VAPTFlowBoundary',
        'Content-Disposition: form-data; name="file"; filename="invoice.php.png"',
        'Content-Type: image/png',
        '',
        '<?php system($_GET["cmd"]); ?>',
        '------VAPTFlowBoundary--',
      ].join('\r\n'),
      response: buildResponse(context, {
        status: 201,
        reason: 'Created',
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "id": "upl_9c1f2e",
  "stored_filename": "invoice.php.png",
  "declared_type": "image/png",
  "detected_type": "text/x-php",
  "url": "https://${context.host}/media/uploads/invoice.php.png",
  "publicly_servable": true
}`,
      }),
    }),
  },
  {
    id: 'vt-privilege-escalation',
    name: 'Privilege Escalation via Parameter Tampering',
    slug: 'privilege-escalation',
    cweId: 'CWE-269',
    owaspId: 'A01:2025',
    severity: 'critical',
    summary: 'A standard user can grant themselves an administrative role.',
    description:
      'The profile update endpoint accepts a role or permission field from the request body and applies it without restricting which values a non-privileged caller may set. A standard account can therefore elevate its own privileges to full administrative access.',
    detectionReason:
      'Submitting an update as a standard user with a modified role field returned HTTP 200 and the account\'s role was subsequently observed as administrator on a fresh session. No authorisation check rejected the field.',
    impact:
      'Any authenticated user can take full control of the platform, including all customer data, payment configuration and other tenants. This is a direct path to complete compromise that requires only a valid low-privilege account, which is often freely obtainable through self-registration.',
    remediation:
      'Never accept privilege-bearing fields from the client. Use an explicit allow-list of updatable profile attributes and ignore anything else, and apply privileged changes only through a separately authorised administrative endpoint. Add a server-side authorisation test for every field on every update path, and review the data-access layer for other mass-assignment exposure.',
    references: [owaspRef('A01:2025', 'Broken Access Control')],
    candidatePaths: ['/api/user/profile', '/api/account', '/api/users/update'],
    methods: ['PATCH', 'PUT', 'POST'],
    parameters: ['role', 'is_admin', 'permissions'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-07T09:47:03.000Z',
      request: buildRequest(context, {
        body: `first_name=Jack&role=admin&permissions%5B%5D=users.read&permissions%5B%5D=users.write`,
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usr_40211.sig' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "id": "usr_40211",
  "first_name": "Jack",
  "role": "admin",
  "permissions": ["users.read", "users.write"],
  "privilege_fields_accepted_from_client": true,
  "expected_role": "standard_user"
}`,
      }),
    }),
  },
  {
    id: 'vt-open-redirect',
    name: 'Open Redirect',
    slug: 'open-redirect',
    cweId: 'CWE-601',
    owaspId: 'A01:2025',
    severity: 'medium',
    summary: 'A redirect target is taken from user input without validation.',
    description:
      'The sign-in and logout flows accept a destination parameter and redirect to it after completing the action. The destination is not restricted to a relative path or an allow-list, so a crafted link can send a user to an attacker-controlled page at the moment their trust is highest.',
    detectionReason:
      'Supplying an absolute external URL as the destination resulted in a 302 response whose Location header pointed to that external host. The application performed the redirect without validation.',
    impact:
      'The redirect lends credibility to a phishing page because it originates from the legitimate application immediately after sign-in, which measurably increases success rates. It also enables token leakage when the destination is appended to the callback parameters.',
    remediation:
      'Accept only relative paths, and reject any value beginning with a scheme, a double slash, or a backslash, after normalising encoded variants. Where external destinations are genuinely required, validate against a strict allow-list of known hosts. Never carry tokens or session identifiers into the destination URL.',
    references: [owaspRef('A01:2025', 'Broken Access Control')],
    candidatePaths: ['/login', '/logout', '/auth/callback', '/sso'],
    methods: ['GET'],
    parameters: ['next', 'redirect', 'return_url', 'continue'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-06T11:18:26.000Z',
      request: buildRequest(context, {
        extraHeaders: { Cookie: 'sessionid=s%3A7Kq2Pz91' },
      }),
      response: [
        'HTTP/1.1 302 Found',
        `Location: https://evil.example/signin-capture?next=${encodeURIComponent(context.value)}`,
        'Set-Cookie: sessionid=s%3A7Kq2Pz91; Path=/; HttpOnly; Secure; SameSite=Lax',
        'Content-Length: 0',
        'Cache-Control: no-store',
        '',
        'Destination validation: none',
        'Accepted value type: absolute external URL',
        'Tested also accepted: //evil.example, /\\evil.example, https:\\\\evil.example',
      ].join('\r\n'),
    }),
  },
  {
    id: 'vt-clickjacking',
    name: 'Clickjacking — Missing Frame Protection',
    slug: 'clickjacking',
    cweId: 'CWE-1021',
    owaspId: 'A02:2025',
    severity: 'low',
    summary: 'Sensitive pages can be embedded in a frame on another origin.',
    description:
      'The application does not restrict which origins may frame it, and does not send X-Frame-Options or a CSP frame-ancestors directive. A remote page can therefore embed the application invisibly and present its own interface over it.',
    detectionReason:
      'Framing checks were performed on the sensitive routes. The response headers contained neither X-Frame-Options nor a frame-ancestors directive, and a cross-origin framing test page successfully embedded the route without being blocked.',
    impact:
      'An attacker can overlay deceptive controls on a framed copy of a sensitive page and induce a user to perform an action they did not intend, such as approving a payment or changing account details. Impact depends on which framed routes expose state-changing controls.',
    remediation:
      'Send Content-Security-Policy: frame-ancestors \'none\' for pages that must never be framed, or a specific allow-list where framing is genuinely required. X-Frame-Options: DENY provides legacy coverage. Apply the directive centrally so newly added routes inherit it, and avoid combining these with JavaScript frame-busting, which is bypassable.',
    references: [owaspRef('A02:2025', 'Security Misconfiguration')],
    candidatePaths: ['/login', '/settings', '/api/session', '/billing'],
    methods: ['GET'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-05T15:52:09.000Z',
      request: buildRequest(context),
      response: [
        'HTTP/1.1 200 OK',
        'Content-Type: text/html; charset=utf-8',
        'Content-Security-Policy: default-src \'self\'   ← no frame-ancestors directive',
        'Cache-Control: no-store',
        ...Object.entries(securityHeadersOk).filter(([key]) => key !== 'X-Frame-Options'),
        '',
        '<!DOCTYPE html><html lang="en"><body>...</body></html>',
        '',
        'X-Frame-Options: ABSENT',
        'CSP frame-ancestors: ABSENT',
        'Cross-origin framing: allowed (verified with a remote iframe test harness)',
      ].join('\r\n'),
    }),
  },
  {
    id: 'vt-mass-assignment',
    name: 'Mass Assignment',
    slug: 'mass-assignment',
    cweId: 'CWE-915',
    owaspId: 'A04:2025',
    severity: 'high',
    summary: 'Update endpoints bind arbitrary request fields to the domain model.',
    description:
      'The update endpoint binds the full request body onto the domain object, so any field the client supplies is written. Fields that should be immutable or privileged — balance, tenant, verification state, internal flags — can be set by the caller.',
    detectionReason:
      'Submitting an update containing internal and financial fields returned HTTP 200 and the values were persisted, confirmed by reading the record back on a subsequent request.',
    impact:
      'Depending on the fields exposed, this enables direct manipulation of financial or state values, cross-tenant data corruption, and self-approval of verification or approval workflows. It is a common root cause of critical business-logic flaws.',
    remediation:
      'Bind an explicit allow-list of fields the caller is permitted to change, and ignore everything else. Enforce the check in the domain or service layer so it applies to every path, not just the controller. Add a schema-validation step and tests asserting that a privileged field in the body is dropped.',
    references: [owaspRef('A04:2025', 'Insecure Design')],
    candidatePaths: ['/api/orders/{id}', '/api/invoices/{id}', '/api/users/{id}'],
    methods: ['PATCH', 'PUT'],
    parameters: ['total', 'status', 'tenant_id', 'verified'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-04T08:33:57.000Z',
      request: buildRequest(context, {
        body: 'total=0.01&currency=USD&status=paid&verified=true&tenant_id=org_internal&discount_pct=100',
        extraHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usr_40211.sig' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "id": "ord_88213",
  "total": 0.01,
  "currency": "USD",
  "status": "paid",
  "verified": true,
  "tenant_id": "org_internal",
  "discount_pct": 100,
  "updated_by": "usr_40211",
  "fields_bound_from_client": 6,
  "fields_expected_to_be_immutable": ["total", "verified", "tenant_id"]
}`,
      }),
    }),
  },
  {
    id: 'vt-host-header',
    name: 'Host Header Injection',
    slug: 'host-header-injection',
    cweId: 'CWE-644',
    owaspId: 'A02:2025',
    severity: 'medium',
    summary: 'The application builds absolute URLs from the untrusted Host header.',
    description:
      'The Host request header is used to construct absolute URLs that are returned to the client, such as password reset links and redirect targets. Because the header is not validated against a known set of hosts, the attacker controls the resulting URL.',
    detectionReason:
      'Sending an unrecognised Host header caused the response to embed that host verbatim in a generated absolute URL returned in the response body.',
    impact:
      'Password reset and notification emails can be made to point at an attacker-controlled domain, which is a direct route to account takeover through credential phishing. Cache poisoning is also possible where responses are cached by URL but vary by Host.',
    remediation:
      'Build absolute URLs from a configured canonical origin rather than from the request. Validate the Host header against an allow-list of known hosts and reject the request otherwise. Ensure any cache in front of the application varies correctly on Host, or normalises it.',
    references: [owaspRef('A02:2025', 'Security Misconfiguration')],
    candidatePaths: ['/api/account/forgot-password', '/api/auth/session', '/health'],
    methods: ['GET', 'POST'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-09-03T10:24:35.000Z',
      request: buildRequest(context, {
        extraHeaders: { Host: 'attacker.example' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "status": "reset_email_queued",
  "reset_url": "https://attacker.example/reset?token=rt_9f2c81ab44de07",
  "generated_from": "request Host header",
  "canonical_origin": "app.example.com"
}`,
      }),
    }),
  },
  {
    id: 'vt-rate-limiting',
    name: 'Missing Rate Limiting',
    slug: 'missing-rate-limiting',
    cweId: 'CWE-770',
    owaspId: 'A07:2025',
    severity: 'medium',
    summary: 'Authentication and sensitive endpoints accept unlimited requests.',
    description:
      'The endpoint applies no rate limit, lockout or progressive delay, so an unbounded number of attempts can be made within a short window. This permits credential stuffing, password spraying and enumeration without technical restriction.',
    detectionReason:
      'Two hundred consecutive sign-in attempts were submitted in under a minute. Every request was processed and none was throttled, locked out or challenged; the response status was identical for valid and invalid accounts, permitting enumeration.',
    impact:
      'Rate limiting is the primary control limiting online credential attacks. Its absence makes password spraying against user accounts practical and removes the friction that would otherwise blunt automated attacks against the authentication surface.',
    remediation:
      'Apply rate limits per source address and per account, with progressive delay rather than an abrupt block, and prefer a token-bucket implementation at the gateway. Add CAPTCHA or a challenge after repeated failures, return a generic failure message to prevent account enumeration, and monitor and alert on authentication failure patterns.',
    references: [owaspRef('A07:2025', 'Authentication Failures')],
    candidatePaths: ['/login', '/api/auth/login', '/api/auth/forgot-password', '/api/otp/verify'],
    methods: ['POST'],
    parameters: ['email', 'username', 'password'],
    buildEvidence: (context) => ({
      observedAt: '2026-09-02T14:11:02.000Z',
      request: buildRequest(context, {
        body: 'email=admin%40example.com&password=Password1',
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
      response: [
        'HTTP/1.1 401 Unauthorized',
        'Content-Type: application/json',
        'X-RateLimit-Limit: ABSENT',
        'X-RateLimit-Remaining: ABSENT',
        'Retry-After: ABSENT',
        ...Object.entries(securityHeadersOk),
        '',
        '{ "error": "invalid_credentials" }',
        '',
        'Attempt summary over 60 seconds:',
        '  requests issued          200',
        '  throttled                  0',
        '  locked out                 0',
        '  challenged (captcha/MFA)    0',
        '  distinct accounts targeted 20',
      ].join('\r\n'),
    }),
  },
  {
    id: 'vt-subdomain-takeover',
    name: 'Subdomain Takeover Risk',
    slug: 'subdomain-takeover',
    cweId: 'CWE-404',
    owaspId: 'A03:2025',
    severity: 'medium',
    summary: 'A subdomain points at a deprovisioned service that still accepts claims.',
    description:
      'A subdomain in the organisation\'s scope resolves to a hosting platform resource that has been deleted or released. If the platform still permits a new account to claim that exact subdomain, an attacker can register it and serve content on a trusted domain.',
    detectionReason:
      'The hostname resolved to a platform-specific dangling resource signature, and the resource no longer exists at the origin. A claim attempt was not performed, as claiming would modify third-party state.',
    impact:
      'Content served on a trusted subdomain inherits cookie and certificate trust, enabling convincing phishing, session cookie capture where cookie scope is too broad, and abuse of trust relationships such as OAuth callbacks or CORS allow-lists referencing that host.',
    remediation:
      'Remove the DNS record for any resource that is no longer in use, and automate detection of dangling records as part of CI. Inventory all third-party subdomains, and where a subdomain must remain, claim it with a placeholder resource you control so nobody else can.',
    references: [owaspRef('A03:2025', 'Software Supply Chain Failures')],
    candidatePaths: ['/'],
    methods: ['GET'],
    parameters: [],
      buildEvidence: (context) => ({
        observedAt: '2026-09-01T09:40:12.000Z',
        request: buildRequest(context, { extraHeaders: { Host: 'legacy-preview.example.com' } }),
        response: buildResponse(context, {
        status: 404,
        reason: 'Not Found',
        headers: { Server: 'AmazonS3', 'Content-Type': 'application/xml' },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchBucket</Code>
  <Message>The specified bucket does not exist</Message>
  <BucketName>example-legacy-preview</BucketName>
  <RequestId>7Kq2Pz91vT9hR4mLxB8dW2a91f4c0e</RequestId>
</Error>

DNS  legacy-preview.example.com  CNAME  example-legacy-preview.s3.amazonaws.com
Status: resource deleted, DNS record still present`,
      }),
    }),
  },
  {
    id: 'vt-xxe',
    name: 'XML External Entity Processing',
    slug: 'xxe',
    cweId: 'CWE-611',
    owaspId: 'A05:2025',
    severity: 'high',
    summary: 'The XML parser resolves external entity references supplied by the client.',
    description:
      'The application parses client-supplied XML with entity resolution enabled. An external entity declaration can therefore instruct the parser to read local files or make outbound network requests, with the resolved content reflected back to the caller.',
    detectionReason:
      'A document containing an external entity was accepted and processed. The response reflected content obtained through the entity, confirming that external resolution is active rather than refused. Only a benign local file reference was used as the probe.',
    impact:
      'Local file disclosure including configuration and credentials, server-side request forgery using the parser as a proxy, and denial of service through entity expansion consuming memory. On older parsers, external entity processing has historically enabled remote code execution.',
    remediation:
      'Disable external entity and DTD processing in the parser configuration, and use a parser that does not resolve external resources by default. If DTDs are required for the format, disable external entities specifically and apply entity expansion limits to prevent billion-laughs style denial of service.',
    references: [owaspRef('A05:2025', 'Injection')],
    candidatePaths: ['/api/import/xml', '/api/soap', '/api/webhooks/parse', '/api/orders/import'],
    methods: ['POST'],
    parameters: ['xml', 'payload', 'document'],
    buildEvidence: (context) => ({
      observedAt: '2026-08-31T11:55:40.000Z',
      request: buildRequest(context, {
        body: `<?xml version="1.0"?>
<!DOCTYPE order [ <!ENTITY probe SYSTEM "file:///etc/hostname"> ]>
<order><id>&probe;</id></order>`,
        extraHeaders: { 'Content-Type': 'application/xml' },
      }),
      response: buildResponse(context, {
        headers: { 'Content-Type': 'application/xml' },
        body: `<?xml version="1.0"?>
<order>
  <id>ip-10-42-8-17</id>
  <status>accepted</status>
</order>

Parser: libxml2 2.9.14 — no-load-ext-entity NOT set
External entity resolution: ENABLED
Doctype processing: ENABLED`,
      }),
    }),
  },
  {
    id: 'vt-click-order-enforcement',
    name: 'Client-Side Only Validation of Discount Codes',
    slug: 'client-side-validation-bypass',
    cweId: 'CWE-602',
    owaspId: 'A04:2025',
    severity: 'high',
    summary: 'A pricing rule is enforced only in the browser and can be bypassed.',
    description:
      'Discount and eligibility rules are evaluated in the browser, and the resulting figure is submitted to the server as an authoritative value. The server accepts the submitted amount without recalculating it, so a modified request applies a discount that was never granted.',
    detectionReason:
      'A request submitting a zero total with a fabricated discount code was accepted and the order was created at that price. Recalculating the total server-side for the same basket produced a materially different figure.',
    impact:
      'Direct financial loss through arbitrary discounts or negative totals, and a bypass of eligibility controls such as regional pricing, quota limits or one-per-customer promotions. The same pattern frequently extends to shipping, tax and refund calculations.',
    remediation:
      'Treat all client-supplied prices, discounts and totals as untrusted. Recalculate every figure server-side from the persisted product and pricing data, apply the promotion rules on the server, and reject the request if the submitted total does not match. Return only the computed amount to the client for display.',
    references: [owaspRef('A04:2025', 'Insecure Design')],
    candidatePaths: ['/api/checkout', '/api/cart/apply-discount', '/api/orders'],
    methods: ['POST'],
    parameters: ['total', 'discount_code', 'amount'],
    buildEvidence: (context) => ({
      observedAt: '2026-08-30T16:12:48.000Z',
      request: buildRequest(context, {
        body: `items%5B0%5D%5Bsku%5D=SKU-4471&total=0.00&discount_code=STAFF100&currency=USD`,
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usr_40211.sig' },
      }),
      response: buildResponse(context, {
        status: 201,
        reason: 'Created',
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "order_id": "ord_90114",
  "submitted_total": 0.00,
  "accepted_total": 0.00,
  "discount_code": "STAFF100",
  "discount_recognised_server_side": false,
  "server_side_recalculation_performed": false,
  "basket_value_at_creation": 249.00
}`,
      }),
    }),
  },
  {
    id: 'vt-tls-weak',
    name: 'Weak TLS Configuration',
    slug: 'weak-tls',
    cweId: 'CWE-326',
    owaspId: 'A04:2025',
    severity: 'low',
    summary: 'The endpoint negotiates legacy protocol versions or cipher suites.',
    description:
      'The server accepts protocol versions or cipher suites that are deprecated and known to be weakened. An attacker with network position may be able to downgrade the connection to a suite that is practically breakable.',
    detectionReason:
      'Supported protocol versions and cipher suites were enumerated for the host. The entries below were accepted during negotiation.',
    impact:
      'Downgrade to a weak suite exposes session traffic and any credentials carried over it to passive or active network attackers. The practical risk depends on exposure, but the configuration is non-compliant with current guidance and should be corrected.',
    remediation:
      'Support TLS 1.2 and 1.3 only, and explicitly disable SSLv3, TLS 1.0 and TLS 1.1. Restrict the cipher list to AEAD suites with forward secrecy, prefer ECDHE-based suites, and enable HTTP Strict Transport Security. Re-test after any load-balancer or CDN configuration change.',
    references: [owaspRef('A04:2025', 'Cryptographic Failures')],
    candidatePaths: ['/'],
    methods: ['GET'],
    parameters: [],
    buildEvidence: (context) => ({
      observedAt: '2026-08-29T08:07:19.000Z',
      request: `openssl s_client -connect ${context.host}:443 -tls1_1 -cipher 'AES128-SHA'`,
      response: `CONNECTED(00000003)
Protocol  : TLSv1.1
Cipher    : AES128-SHA (0x002f)
Compression: NULL
Verification: OK

Negotiated suite is not forward-secret and the protocol version is deprecated.
Recommended: TLSv1.2/1.3 with ECDHE-AES-GCM suites only.`,
    }),
  },
  {
    id: 'vt-rate-limit-bypass',
    name: 'Business Limit Bypass in Multi-Step Workflow',
    slug: 'workflow-limit-bypass',
    cweId: 'CWE-841',
    owaspId: 'A06:2025',
    severity: 'medium',
    summary: 'A multi-step workflow enforces a limit only at the final step, so the ceiling is never reached.',
    description:
      'The application enforces a usage or value ceiling at the last step of a multi-request workflow instead of accounting for the earlier steps. State accumulated by the preceding requests is not counted towards the limit, so an automated client can repeat the sequence and exceed the intended number of operations.',
    detectionReason:
      'The final step of the workflow was replayed in a loop after a bounded number of preparatory submissions, and every iteration was accepted. The server-side counter reported by the summary endpoint did not increase by the number of completed workflows.',
    impact:
      'The ceiling exists to bound commercial or operational exposure, such as promotional discounts, refund volume or quota-limited API calls. Bypassing it converts a capped benefit into an uncapped one and may also exhaust downstream inventory, credits or third-party quotas. Because the workflow itself completes normally, the abuse is invisible without server-side reconciliation.',
    remediation:
      'Account for every step of the workflow in a single server-side ledger, keyed to the user and the workflow instance, and reject the final step when the accumulated total would exceed the limit. Make the counter increment and the state transition atomic so a partially completed sequence cannot be replayed, and reconcile the ledger against real business records on a schedule.',
    references: [owaspRef('A06:2025', 'Insecure Design')],
    candidatePaths: ['/api/quota/summary', '/api/claims/submit', '/api/requests'],
    methods: ['GET', 'POST'],
    parameters: ['limit', 'workflow_id', 'page'],
    buildEvidence: (context) => ({
      observedAt: '2026-08-31T11:04:57.000Z',
      request: buildRequest(context, {
        body: `workflow_id=wf_4471&limit=25&acknowledged=true`,
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usr_51832.sig' },
      }),
      response: buildResponse(context, {
        status: 201,
        reason: 'Created',
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "workflow_id": "wf_4471",
  "accepted": true,
  "step": "final",
  "workflows_completed_this_period": 37,
  "configured_limit": 25,
  "limit_source": "client_supplied",
  "server_side_ledger_updated": false,
  "prior_preparatory_steps_accounted": 0
}`,
      }),
    }),
  },
  {
    id: 'vt-deserialization',
    name: 'Unsafe Deserialization of Untrusted Objects',
    slug: 'unsafe-deserialization',
    cweId: 'CWE-502',
    owaspId: 'A08:2025',
    severity: 'critical',
    summary: 'A serialised object from the request body is reconstructed on the server without validation.',
    description:
      'The application accepts a serialised object in the request body and reconstructs it with a language-native deserialiser, without validating the object graph or restricting the types that may be instantiated. The attacker controls the entire payload, including the type metadata the deserialiser uses to select a constructor.',
    detectionReason:
      'A request body containing a serialised object with an unexpected type marker was accepted and reconstructed. The response reflects values decoded from the attacker-supplied graph, which confirms the payload was materialised rather than parsed as inert data.',
    impact:
      'Depending on the classes available on the server classpath, this leads to remote code execution, arbitrary file writes, or outbound connections to attacker-controlled hosts. Where code execution is not reachable, it still allows privilege escalation and denial of service by instantiating expensive object graphs. The issue is exploitable by anyone who can reach the endpoint, and frequently sits in front of authenticated functionality.',
    remediation:
      'Do not deserialise untrusted input with native object deserialisers. Accept a plain data format such as JSON and validate it against an explicit schema, rejecting unknown fields. Where a native format is unavoidable, use a data-only parser, apply an allow-list of permitted types, and enforce a size and depth limit. Rotate any signing keys or session material that may have been exposed and audit the host for unexpected child processes or outbound traffic.',
    references: [owaspRef('A08:2025', 'Software or Data Integrity Failures')],
    candidatePaths: ['/api/session/import', '/api/orders/bulk'],
    methods: ['POST'],
    parameters: ['payload', 'format'],
    buildEvidence: (context) => ({
      observedAt: '2026-08-31T14:22:03.000Z',
      request: buildRequest(context, {
        body: 'format=java&payload=%AC%ED%00%05%73%72%0Djava.lang.ProcessBuilder%0A%01%0E%0C%0B%2F%62%69%6E%2F73%68%0A%01%00%0E%00%0A%2F%74%6D%70%2F%70%77%6E%65%72',
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usr_51832.sig' },
      }),
      response: buildResponse(context, {
        status: 200,
        reason: 'OK',
        headers: { 'Content-Type': 'application/json', ...securityHeadersOk },
        body: `{
  "imported": true,
  "objects_created": 2,
  "type_restrictions_applied": false,
  "allow_list_configured": false,
  "graph_depth_limit": null,
  "decoded_command": "/bin/sh -c /tmp/pwned",
  "server_execution_observed": true
}`,
      }),
    }),
  },
]

/** Fast lookup used by the findings generator. */
export const VULN_TEMPLATE_BY_ID: Record<string, VulnTemplate> = Object.fromEntries(
  VULN_TEMPLATES.map((template) => [template.id, template]),
)

export const VULN_CATALOGUE: VulnerabilityType[] = VULN_TEMPLATES.map((template) => ({
  id: template.id,
  name: template.name,
  slug: template.slug,
  cweId: template.cweId,
  owaspId: template.owaspId,
  severity: template.severity,
  description: template.description,
  remediation: template.remediation,
}))
