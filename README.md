# VAPTFlow

**Automated Web Security Testing & VAPT Management**

A professional web application security testing and VAPT management platform. VAPTFlow covers the
full assessment workflow: target discovery, automated security testing, evidence capture, analyst
verification, OWASP/CWE mapping, client-ready reporting and scan-over-scan comparison.

> **Status: frontend only.** The interface, design system and data architecture are complete and
> running against realistic mock data. There is no backend, no scanner engine and no real security
> testing — every result is simulated in the browser. The architecture is shaped so a Django REST
> API can be connected later without redesigning the UI.

---

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on **http://localhost:5174** (Vite falls back to the next free port if 5174 is
taken).

Any valid-looking email and a 6+ character password will sign you — authentication is mocked. The
form is pre-filled with a demo account.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check then produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |
| `npx tsc -b` | Type-check only |

---

## Tech stack

Deliberately minimal — no UI framework, form library, state library or syntax highlighter.

| Concern | Choice |
| --- | --- |
| Build | Vite 8 |
| UI | React 19 + TypeScript 6 |
| Styling | Tailwind CSS 4 (CSS-first `@theme` tokens) |
| Routing | React Router 7 (`createBrowserRouter`) |
| Server state | TanStack Query 5 |
| Charts | Recharts 3 |
| Icons | lucide-react 1 |
| Lint | oxlint |
| Fonts | Inter Variable, self-hosted |

---

## Architecture

```
src/
├── components/
│   ├── common/      Design-system primitives (buttons, table, modal, badges, code block…)
│   └── layout/      App shell: sidebar, topbar, breadcrumbs, mobile drawer
├── data/            Static seed datasets + OWASP/CWE reference data
├── hooks/           Theme, auth, toast, media query, overlay behaviour
├── pages/           Route components, grouped by domain
├── routes/          Route table, navigation config, guards, error boundaries
├── services/        API boundary + demo store — see "Future API integration"
├── styles/          Design tokens and base styles
├── types/           Domain types shared by every layer
└── utils/           Formatting, severity/status tokens, class-name helper
```

### The data layer

Three layers, deliberately separated so the mock backend can be replaced without touching a
component:

1. **`src/data/*.ts`** — pure static seed datasets. No component imports these directly.
2. **`src/services/store.ts`** — the in-browser source of truth. Exposes `list`/`get`/`create`/`update`/
   `remove`/`reset`, and persists to `localStorage` under a versioned key so demo changes survive a
   refresh. The persisted copy is keyed by `SEED_VERSION`, so bumping the seed discards demo edits
   rather than leaving stale records behind.
3. **`src/services/*.ts`** — the API boundary. Services return promises, apply filtering, sorting and
   pagination, and return a `Paginated<T>` envelope shaped to match DRF's paginated responses.

TanStack Query wraps the services, which is what makes loading skeletons, empty states and error
states real behaviour rather than decoration.

### Future API integration

When the Django REST API is ready, only `src/services/` changes:

```ts
// Today
export async function listProjects(params: ListParams): Promise<Paginated<Project>> {
  return mockTransport(() => store.list('projects', params), '/api/projects/')
}

// Tomorrow — same signature, same envelope, no component changes
export async function listProjects(params: ListParams): Promise<Paginated<Project>> {
  return httpClient.get('/api/projects/', { params })
}
```

### Design system

Semantic CSS custom properties are defined once in `src/styles/index.css` and mapped to Tailwind
utilities with `@theme inline`, so a single token change propagates everywhere — including charts
and inline styles. Dark is the default; light and system are fully supported, and the theme is
applied before first paint by a small inline script in `index.html`.

Severity colours are used only where they carry information, and never as the sole signal — every
badge also renders its text label. Automated *potential* findings are styled distinctly from
*confirmed* vulnerabilities (dashed outline and radar icon versus solid outline and check), because
that distinction is central to the product's credibility.

---

## Security posture of this build

This is a UI project and deliberately contains **no** offensive capability:

- No payloads are constructed or sent.
- No target is crawled, scanned or requested.
- No injection, XSS, SSRF, authentication or brute-force logic exists.
- No backend, database, queue, worker or container is created.
- Authentication is a local mock; no credentials are transmitted or validated.

`Authorization confirmed` checkboxes on target creation are a UI acknowledgement only. In a
production deployment, scope and authorisation must be enforced server-side before any scan runs.

---

## Build stages

| Stage | Scope | State |
| --- | --- | --- |
| 1 | Project setup, theme, routing, layout, shell, primitives | Complete |
| 2 | Mock data layer, login, dashboard, projects, targets | Complete |
| 3 | Scan configuration, scan simulation, scans | Complete |
| 4 | Findings, finding details, manual verification | Complete |
| 5 | Reports, report preview, scan comparison, OWASP coverage | Complete |
| 6 | Scanner modules, settings, administration | Complete |
| 7 | Responsive polish, a11y, UX refinement | Planned |

Stages 1 to 6 are wired into the router, sidebar and layout with no placeholder routes left. Only
the Stage 7 refinement pass remains.

---

## Reports, comparison and coverage

Three screens, three different jobs.

**A report is a live view, not a stored artefact.** `/reports` is a register of deliverables that
can be filtered by project, target, status and format, with headline aggregates computed from
current data. The preview at `/reports/:reportId` composes its cover, executive summary, severity
breakdown, methodology, scope and activity from live findings on every read, so nothing can drift
out of sync with the register. Only `confirmed`, `open` and `needs_retest` findings are quoted: an
unverified `potential` signal has not earned a place in a client deliverable. Rendering is
simulated — generation resolves to `ready` immediately, and a download is recorded as a
`report.download` audit entry rather than producing a file.

Because the preview recomputes, a target report would silently absorb findings from a later run.
It is instead flagged **outdated** when a completed scan of the same target finishes more than
three days after the report was generated, which is the prompt to regenerate it deliberately.

**Comparison is about movement, not totals.** `/scans/compare` matches findings between two runs
of the same target on a fingerprint of vulnerability type, endpoint, method and parameter, then
classifies each as resolved, introduced, reopened or persisting. A count that is identical across
two runs is uninteresting on its own — the analyst needs to know what changed, what was closed and
what came back. Run `GET /scans/:scanId` to pick up the previous completed run.

**Coverage answers "what did we not test?".** `/coverage` shows, per OWASP Top 10 category, how many
tests the catalogue offers, how many actually executed, how many vulnerability types produced
findings, and which modules contribute. A category with no tests is a different fact from a category
with tests that found nothing, and the screen never collapses the two into one percentage.

---

## Scan simulation

Scans are simulated, not executed. Nothing is sent at a target, and no payload, tool or third
party is involved anywhere in this project.

A run's state is **derived from the clock rather than accumulated tick by tick**, which is what
makes the demo survive a page reload:

- `DemoStore` keeps a persisted `clock` of per-scan anchors. The first time an in-flight scan is
  seen, an anchor is inferred from its seeded progress so a reload resumes where it left off.
- Every read of `DemoStore.snapshot()` (and of the cached indexes) advances anything in flight
  first, so any service call returns up-to-date data. Reads never need a timer of their own.
- Progress, status, stage states, counters and log lines are all computed from elapsed time, and
  integer progress is stored, so two reads in the same instant return identical records and the
  persisted store is not rewritten for no reason.
- Runs play back at **12× real time**, so a 24-minute `quick` scan takes about two minutes to
  watch. The estimate shown before a run starts states both numbers.
- A completed record is written once, and terminal runs stop advancing permanently.

Seeded findings come from the same catalogue the static dataset uses, so a live run produces
recognisable, consistent findings rather than random noise.

### Authorisation is enforced

A scan can only be started against a target whose written authorisation is on file. The wizard
will not let an unauthorised target be selected, the service refuses it independently of the UI,
and the seed contains deliberately unauthorised targets so the refusal is visible. Targets that
already have a run in flight are also refused.

---

## Findings and manual verification

A scanner cannot tell a real SQL injection from a WAF banner, so anything it cannot prove on its
own becomes a **verification task**: a queue item with the scanner's rationale, a suggested
procedure and the raw request/response that triggered it. Stage 4 exists to make that judgement
explicit and auditable rather than to hide it behind a status dropdown.

The rule that shapes the whole stage: **a finding's status is never set by picking from a list.**

- `confirmed`, `false_positive` and `needs_retest` are reachable only by recording a decision on
  the finding's verification task. `findingService.setStatus` refuses them with a `409`.
- While a task is undecided the finding is *locked*: the detail page disables the status control
  and explains which task is blocking it. A finding therefore cannot claim to be confirmed while
  its task still sits in the queue.
- `verificationService.decide` writes the task **and** the finding in one store commit. A
  half-applied decision is the exact inconsistency this stage prevents.
- Dismissing a finding or sending it for retest requires a written reason (8 characters minimum);
  confirming one does not. An unexplained "false positive" is worthless to the next reviewer.
- Reopening a task clears the decision and returns the finding to `potential`, leaving the notes
  in place, so changing your mind is as traceable as the original call.
- Every decision, reopen, assignment and manual status change lands on the audit log as
  `verification.decide`, `verification.reopen`, `finding.assign` or `finding.status_change`.

The register (`/findings`) leads with severity tiles that double as filters, because the two
questions people arrive with are different: "show me the criticals" and "how much of this is
unverified noise?". The queue (`/verification`) defaults to priority then due date so the
highest-risk undecided inference is always first, and marks overdue work in the table rather than
silently reordering it.

---

## Modules, settings and administration

Stage 6 is the workspace's control plane: what the scanner is allowed to run, how the product
behaves, and who is allowed to change either.

### Disabling a module is not deleting its findings

`/modules` is the analyst-facing register. Disabling a module stops it being offered to future runs,
but **it never retracts a finding that module already produced**. Retracting evidence because a
detector was later turned off would destroy the audit trail and quietly understate a client's risk.
The catalogue therefore separates availability from history: aggregate counts (`testsAvailable`,
findings attributed, OWASP coverage) are computed from the current catalogue, while the number of
findings behind each module stays attached to what actually ran.

Profile selection (`quick`, `standard`, `full`) and OWASP mapping are filterable, and the enabled
count is surfaced as a share of the catalogue so a workspace cannot silently run almost nothing.

### Administration is a role gate, not a nav toggle

`/admin` holds overview, users, module registry, jobs and audit logs. The branch sits behind
`RequireRole`, which admits `admin` and `lead_analyst` and redirects `analyst` and `viewer` to the
dashboard. Signing in is not the same as being allowed to administer, and the check lives on the
route rather than in a hidden link, so typing the URL gains nothing.

Every privileged mutation is written to the audit log by the service, not by the page: role and MFA
changes, invitations, suspensions, job retries and cancellations, module enable/disable and
rollouts. The audit register is append-only and offers no edit or delete affordance at all.

- **Overview** surfaces workspace health plus the items needing attention: failed jobs, unenrolled
  MFA, and modules drifting from their intended version.
- **Users** shows role, account state and MFA enrolment per member, with a separate action for each
  so a role change is never a side effect of a suspension.
- **Module registry** compares intended versions against what each worker actually runs, which is how
  version drift becomes visible before it produces confusing results.
- **Jobs** is the queue register across the `scans`, `analysis`, `reporting`, `notifications` and
  `maintenance` queues, with the retry action pinned to a real worker instead of a free-text field.

### Settings separate the immediate from the deliberate

`/settings` groups six sections: profile, appearance, scanner defaults, notifications, security and
workspace. Changes that only affect how this browser looks (appearance, sidebar density) apply
immediately. Changes with workspace consequences -- scanner defaults, notification routing, security
policy -- are held as a local draft behind an explicit **Save**, so navigating away cannot half-apply
a security change. Reverting a draft restores the last saved values rather than silently writing
them.

Role and MFA enrolment are deliberately *not* editable here; they live under Administration, so there
is exactly one place where authority changes.
#   V A P T - p l a t f o r m - f e  
 