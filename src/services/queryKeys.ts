import type { NormalizedList } from './transport'

/**
 * Query key factory.
 *
 * Keys are declared in one place so invalidation after a mutation cannot drift
 * from the key a component subscribed to. Every key starts with its entity root
 * so `invalidateQueries({ queryKey: queryKeys.findings.root })` is always valid.
 */

const list = (root: string, query: NormalizedList) =>
  [root, 'list', query] as const

export const queryKeys = {
  dashboard: {
    root: ['dashboard'] as const,
    overview: () => ['dashboard', 'overview'] as const,
  },

  projects: {
    root: ['projects'] as const,
    lists: () => ['projects', 'list'] as const,
    list: (query: NormalizedList) => list('projects', query),
    detail: (projectId: string) => ['projects', 'detail', projectId] as const,
    summary: (projectId: string) => ['projects', 'summary', projectId] as const,
  },

  targets: {
    root: ['targets'] as const,
    lists: () => ['targets', 'list'] as const,
    list: (query: NormalizedList) => list('targets', query),
    detail: (targetId: string) => ['targets', 'detail', targetId] as const,
    technologies: (targetId: string) => ['targets', 'technologies', targetId] as const,
    endpoints: (targetId: string) => ['targets', 'endpoints', targetId] as const,
  },

  scans: {
    root: ['scans'] as const,
    lists: () => ['scans', 'list'] as const,
    list: (query: NormalizedList) => list('scans', query),
    detail: (scanId: string) => ['scans', 'detail', scanId] as const,
    /** Targets the wizard may offer; `null` means "any project". */
    scannableTargets: (projectId: string | null) =>
      ['scans', 'scannable-targets', projectId ?? 'all'] as const,
    compare: (previousId: string, currentId: string) =>
      ['scans', 'compare', previousId, currentId] as const,
  },

  findings: {
    root: ['findings'] as const,
    lists: () => ['findings', 'list'] as const,
    list: (query: NormalizedList) => list('findings', query),
    detail: (findingId: string) => ['findings', 'detail', findingId] as const,
  },

  verification: {
    root: ['verification'] as const,
    lists: () => ['verification', 'list'] as const,
    list: (query: NormalizedList) => list('verification', query),
    detail: (taskId: string) => ['verification', 'detail', taskId] as const,
  },

  reports: {
    root: ['reports'] as const,
    lists: () => ['reports', 'list'] as const,
    list: (query: NormalizedList) => list('reports', query),
    detail: (reportId: string) => ['reports', 'detail', reportId] as const,
  },

  coverage: {
    root: ['coverage'] as const,
    matrix: (projectId: string | null) => ['coverage', 'matrix', projectId ?? 'all'] as const,
  },

  modules: {
    root: ['modules'] as const,
    lists: () => ['modules', 'list'] as const,
    list: (query: NormalizedList) => list('modules', query),
    options: () => ['modules', 'options'] as const,
    detail: (moduleId: string) => ['modules', 'detail', moduleId] as const,
  },

  settings: {
    root: ['settings'] as const,
    read: () => ['settings', 'read'] as const,
  },

  reference: {
    root: ['reference'] as const,
    users: () => ['reference', 'users'] as const,
    projects: () => ['reference', 'projects'] as const,
    targets: () => ['reference', 'targets'] as const,
    scanProfiles: () => ['reference', 'scan-profiles'] as const,
    modules: () => ['reference', 'modules'] as const,
    vulnerabilityTypes: () => ['reference', 'vulnerability-types'] as const,
  },

  admin: {
    root: ['admin'] as const,
    overview: () => ['admin', 'overview'] as const,
    users: () => ['admin', 'users', 'list'] as const,
    userList: (query: NormalizedList) => list('admin-users', query),
    userDetail: (userId: string) => ['admin', 'users', 'detail', userId] as const,
    jobs: () => ['admin', 'jobs', 'list'] as const,
    jobList: (query: NormalizedList) => list('admin-jobs', query),
    auditLogs: () => ['admin', 'audit-logs', 'list'] as const,
    auditLogList: (query: NormalizedList) => list('admin-audit', query),
    auditOptions: () => ['admin', 'audit-logs', 'options'] as const,
    /** Deployment matrix; a sibling of `modules`, not a subset of it. */
    registry: () => ['admin', 'registry'] as const,
  },

  /** Live counts behind the sidebar and topbar badges. */
  counts: () => ['counts'] as const,
}
