import { createSeedData, SEED_VERSION, type Dataset } from '@/data'

import { planScanUpdates } from './scanSimulation'

/**
 * In-browser replacement for the backend.
 *
 * The seeded dataset is generated once and then persisted, so anything the user
 * creates survives a reload. Lookup maps are rebuilt on every mutation, which is
 * irrelevant at this scale and removes a whole class of stale-index bugs.
 */

const STORAGE_KEY = 'vaptflow:demo:v1'

interface PersistedStore {
  version: number
  savedAt: string
  /**
   * Wall-clock milliseconds at which each in-flight scan's simulated timeline
   * began. Persisted so a reload resumes a run instead of restarting it.
   */
  clock: Record<string, number>
  data: Dataset
}


export interface StoreIndexes {
  projectById: Map<string, Dataset['projects'][number]>
  targetById: Map<string, Dataset['targets'][number]>
  userById: Map<string, Dataset['users'][number]>
  scanById: Map<string, Dataset['scans'][number]>
  findingById: Map<string, Dataset['findings'][number]>
  reportById: Map<string, Dataset['reports'][number]>
  endpointsByTarget: Map<string, Dataset['endpoints']>
  technologiesByTarget: Map<string, Dataset['technologies'][string]>
  findingsByScan: Map<string, Dataset['findings']>
  findingsByProject: Map<string, Dataset['findings']>
  findingsByTarget: Map<string, Dataset['findings']>
  scansByProject: Map<string, Dataset['scans']>
  scansByTarget: Map<string, Dataset['scans']>
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const bucket = key(row)
    if (bucket === null) continue
    const existing = map.get(bucket)
    if (existing) existing.push(row)
    else map.set(bucket, [row])
  }
  return map
}

function indexById<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

function buildIndexes(data: Dataset): StoreIndexes {
  return {
    projectById: indexById(data.projects),
    targetById: indexById(data.targets),
    userById: indexById(data.users),
    scanById: indexById(data.scans),
    findingById: indexById(data.findings),
    reportById: indexById(data.reports),
    endpointsByTarget: groupBy(data.endpoints, (endpoint) => endpoint.targetId),
    technologiesByTarget: new Map(Object.entries(data.technologies)),
    findingsByScan: groupBy(data.findings, (finding) => finding.scanId),
    findingsByProject: groupBy(data.findings, (finding) => finding.projectId),
    findingsByTarget: groupBy(data.findings, (finding) => finding.targetId),
    scansByProject: groupBy(data.scans, (scan) => scan.projectId),
    scansByTarget: groupBy(data.scans, (scan) => scan.targetId),
  }
}

/**
 * Structural check so a stale or hand-edited payload cannot crash the app.
 *
 * Deliberately shallow: it answers "can the app read this?", not "is this
 * current?" — recency is `SEED_VERSION`'s job. The per-entity checks below exist
 * because a missing array is a crash on first render, whereas a stale value
 * simply renders as slightly old demo data.
 */
function isUsableDataset(value: unknown): value is Dataset {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Dataset>
  return (
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.targets) &&
    Array.isArray(candidate.scans) &&
    Array.isArray(candidate.findings) &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.endpoints) &&
    Array.isArray(candidate.reports) &&
    Array.isArray(candidate.modules) &&
    Array.isArray(candidate.scanProfiles) &&
    Array.isArray(candidate.vulnerabilityTypes) &&
    Array.isArray(candidate.verificationTasks) &&
    candidate.scans.every((scan) => Array.isArray(scan.moduleIds)) &&
    Array.isArray(candidate.moduleDeployments) &&
    typeof candidate.workspaceSettings === 'object' &&
    candidate.workspaceSettings !== null &&
    typeof candidate.technologies === 'object' &&
    candidate.technologies !== null
  )
}

function loadPersisted(): { data: Dataset; clock: Record<string, number> } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Partial<PersistedStore>
    if (candidate.version !== SEED_VERSION || !isUsableDataset(candidate.data)) return null
    return {
      data: candidate.data,
      clock:
        typeof candidate.clock === 'object' && candidate.clock !== null ? candidate.clock : {},
    }
  } catch {
    return null
  }
}


class DemoStore {
  private data: Dataset
  private indexCache: StoreIndexes
  private listeners = new Set<() => void>()
  /** Wall-clock start of each in-flight scan's simulated timeline. */
  private clock = new Map<string, number>()
  /** Guards the simulation against re-entering itself through `snapshot()`. */
  private syncing = false

  constructor() {
    const restored = loadPersisted()
    this.data = restored?.data ?? createSeedData()
    this.clock = new Map(Object.entries(restored?.clock ?? {}))
    this.indexCache = buildIndexes(this.data)
    this.persist()
  }

  /* ---------------------------------------------------------------- state */

  /**
   * The current dataset, with in-flight scans advanced to the wall clock.
   *
   * Advancing here rather than in a timer means no read path can show a stale
   * run: the register, the dashboard, the sidebar badge and the scan detail all
   * go through this door, so they cannot disagree about how far a scan has got.
   */
  snapshot(): Dataset {
    if (!this.syncing) this.advanceInFlightScans()
    return this.data
  }

  /**
   * Wall-clock milliseconds at which a scan's simulated timeline began.
   *
   * `realElapsedSeconds` is how many real seconds into the run the scan already
   * was the first time it was observed, so a seeded scan carrying 78% keeps that
   * lead instead of being fast-forwarded to completion on first read.
   */
  simulationAnchor(scanId: string, realElapsedSeconds: number): number {
    const existing = this.clock.get(scanId)
    if (existing !== undefined) return existing
    const anchor = Date.now() - realElapsedSeconds * 1000
    this.clock.set(scanId, anchor)
    return anchor
  }

  /** Lookup maps, rebuilt on every mutation so they cannot go stale. */
  get indexes(): StoreIndexes {
    if (!this.syncing) this.advanceInFlightScans()
    return this.indexCache
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Moves in-flight scans to where the wall clock says they are.
   *
   * A no-op unless something actually changed, so the common case — a poll that
   * lands in the same second as the last one — costs comparisons rather than a
   * deep clone of the dataset and a `localStorage` write.
   */
  private advanceInFlightScans(): void {
    this.syncing = true
    try {
      const update = planScanUpdates({
        data: this.data,
        now: new Date(),
        anchorFor: (scanId, elapsed) => this.simulationAnchor(scanId, elapsed),
      })
      if (!update) return

      const next = structuredClone(this.data)
      for (const [scanId, scan] of update.scans) {
        const position = next.scans.findIndex((entry) => entry.id === scanId)
        if (position >= 0) next.scans[position] = scan
      }
      next.findings.push(...update.findings)
      next.verificationTasks.push(...update.verificationTasks)
      next.auditLog.push(...update.auditLog)
      for (const job of update.jobs) {
        const position = next.jobs.findIndex((entry) => entry.id === job.id)
        if (position >= 0) next.jobs[position] = job
        else next.jobs.push(job)
      }

      this.commit(next)
    } finally {
      this.syncing = false
    }
  }

  private commit(next: Dataset): void {
    this.data = next
    this.indexCache = buildIndexes(next)
    this.persist()
    for (const listener of this.listeners) listener()
  }

  private persist(): void {
    try {
      const clock: Record<string, number> = {}
      for (const scan of this.data.scans) {
        const anchor = this.clock.get(scan.id)
        if (anchor !== undefined) clock[scan.id] = anchor
      }
      const payload: PersistedStore = {
        version: SEED_VERSION,
        savedAt: new Date().toISOString(),
        clock,
        data: this.data,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // A full or blocked store degrades to session-only state, which is fine.
    }
  }

  /** Restores the original generated dataset, discarding user changes. */
  reset(): Dataset {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* nothing to clear */
    }
    this.clock.clear()
    const fresh = createSeedData()
    this.commit(fresh)
    return fresh
  }

  /* ------------------------------------------------------------ mutation */

  mutate(producer: (draft: Dataset) => void): Dataset {
    const next = structuredClone(this.data)
    producer(next)
    this.commit(next)
    return next
  }
}


export const demoStore = new DemoStore()

export const DEMO_STORAGE_KEY = STORAGE_KEY
