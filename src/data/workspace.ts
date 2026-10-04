import type { ModuleDeployment, ScannerModule, WorkerHost, WorkspaceSettings } from '@/types'
import { WORKER_HOSTS } from '@/types'
import { isoAgo, pick, randomInt, type Rng } from './seed'

/**
 * Workspace defaults and per-host module deployment.
 *
 * Deployment is generated separately from `ScannerModule.status` because the two
 * answer different questions. `status` is the editorial decision "should this
 * detection run at all?"; deployment is the operational fact "which worker pools
 * carry this build, and have they all converged?". An operator triaging a
 * rollout only cares about the second.
 */

/** Worker pools that load detection modules; the report host loads none. */
const SCANNER_HOSTS: readonly WorkerHost[] = WORKER_HOSTS.filter((host) => host !== 'report-01')

export function createModuleDeployments(
  modules: readonly ScannerModule[],
  rng: Rng,
): ModuleDeployment[] {
  return modules.map((module, index) => {
    // The tail of the catalogue holds the newest builds, so those are the ones
    // most likely to still be mid-rollout.
    const staged = index >= modules.length - 4
    const drifted = pickSubset(SCANNER_HOSTS, randomInt(rng, 1, 2), rng)
    const missing = pickSubset(SCANNER_HOSTS, randomInt(rng, 0, staged ? 2 : 1), rng).filter(
      (host) => !drifted.includes(host),
    )
    const installedOn = SCANNER_HOSTS.filter(
      (host) => !missing.includes(host) && !drifted.includes(host),
    )

    return {
      moduleId: module.id,
      installedOn,
      driftedOn: drifted,
      converged: drifted.length === 0 && missing.length === 0,
      lastDeployAt: isoAgo(randomInt(rng, 0, staged ? 2 : 40), randomInt(rng, 0, 23)),
      deployedBy: pick(rng, ['usr-001', 'usr-002']),
    }
  })
}

function pickSubset(hosts: readonly WorkerHost[], count: number, rng: Rng): WorkerHost[] {
  const pool = [...hosts]
  const taken: WorkerHost[] = []
  const take = Math.min(count, pool.length)
  for (let i = 0; i < take; i += 1) {
    const index = randomInt(rng, 0, pool.length - 1)
    const [removed] = pool.splice(index, 1)
    if (removed !== undefined) taken.push(removed)
  }
  return taken
}

export function createWorkspaceSettings(organizationId: string): WorkspaceSettings {
  return {
    organizationId,
    name: 'Northwind Security Group',
    shortName: 'Northwind',
    timezone: 'Europe/London',
    defaultLocale: 'en-GB',
    scanner: {
      profileId: 'standard',
      assessmentType: 'web_application',
      autoStart: true,
      maxConcurrentScans: 3,
      autoRetestFixed: true,
      scheduleStartHour: 8,
      scheduleEndHour: 19,
    },
    notifications: {
      scanStarted: false,
      scanCompleted: true,
      scanFailed: true,
      verificationAssigned: true,
      reportReady: true,
      dailyDigest: false,
      email: 'soc@northwind.example',
    },
    security: {
      requireMfaForExports: true,
      sessionTimeoutMinutes: 30,
      notifyOnNewSignIn: true,
      requireAuthorisation: true,
      warnOnRateLimitOverride: true,
    },
    updatedAt: isoAgo(2, 3),
    updatedBy: 'usr-002',
  }
}
