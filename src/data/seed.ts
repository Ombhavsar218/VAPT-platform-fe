/**
 * Deterministic pseudo-random helpers used to build the mock datasets.
 *
 * A fixed seed means every reload produces an identical workspace: the demo
 * looks the same each time, screenshots stay comparable, and a bug found in the
 * data is reproducible.
 */

export type Rng = () => number

/** mulberry32 — small, fast, good enough distribution for mock data. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform integer in `[min, max]`. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** Uniform float in `[min, max)`. */
export function randomFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const index = Math.floor(rng() * items.length)
  const value = items[index]
  if (value === undefined) {
    throw new Error('pick() requires a non-empty array')
  }
  return value
}

/** Picks `count` distinct items, or all of them when `count` exceeds the pool. */
export function pickMany<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items]
  const chosen: T[] = []
  const take = Math.min(count, pool.length)
  for (let i = 0; i < take; i += 1) {
    const index = Math.floor(rng() * pool.length)
    const [removed] = pool.splice(index, 1)
    if (removed !== undefined) chosen.push(removed)
  }
  return chosen
}

/** Weighted pick. `weights` must align with `items` and be positive. */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let threshold = rng() * total
  for (let i = 0; i < items.length; i += 1) {
    threshold -= weights[i] ?? 0
    const value = items[i]
    if (threshold <= 0 && value !== undefined) return value
  }
  const last = items[items.length - 1]
  if (last === undefined) throw new Error('pickWeighted() requires a non-empty array')
  return last
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000

/** Single reference point so the whole dataset shares a coherent "now". */
export const NOW = new Date('2026-09-26T18:30:00.000Z')

/** ISO timestamp `days`/`hours`/`minutes` in the past, with optional jitter. */
export function isoAgo(
  days: number,
  hours = 0,
  minutes = 0,
  jitterHours = 0,
  rng?: Rng,
): string {
  const jitter = rng ? randomInt(rng, 0, Math.max(0, Math.round(jitterHours * 60))) * MS_PER_MINUTE : 0
  const offset = days * MS_PER_DAY + hours * MS_PER_HOUR + minutes * MS_PER_MINUTE
  return new Date(NOW.getTime() - offset - jitter).toISOString()
}

/** ISO timestamp `minutes` in the future — used for scheduled work. */
export function isoAhead(minutes: number): string {
  return new Date(NOW.getTime() + minutes * MS_PER_MINUTE).toISOString()
}

/** `YYYY-MM-DD` `days` in the past. */
export function dateOnly(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Adds `duration` seconds to a timestamp. */
export function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

export function secondsBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000))
}

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                 */
/* -------------------------------------------------------------------------- */

/** `fnd-0142` style zero-padded ids. */
export function paddedId(prefix: string, index: number, width = 4): string {
  return `${prefix}-${String(index).padStart(width, '0')}`
}
