import type { ListParams, Paginated } from '@/types'

/**
 * Mock transport.
 *
 * Services never touch the store directly: they call `request()` with a
 * synchronous producer and get a promise back, exactly as they would with
 * `fetch`. Swapping in the Django client means replacing the body of each
 * service and deleting this file — no component changes.
 */

export class ApiError extends Error {
  readonly status: number
  /** Field-level validation messages, mirroring DRF's `detail` object. */
  readonly fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export function notFound(entity: string, id: string): ApiError {
  return new ApiError(404, `${entity} ${id} was not found.`)
}

const MIN_LATENCY_MS = 140
const MAX_LATENCY_MS = 380

function randomLatency(min: number, max: number): number {
  return min + Math.random() * Math.max(0, max - min)
}

/**
 * Wraps a synchronous producer in a promise with a realistic delay.
 *
 * The delay is intentional: skeletons, pending button states and in-flight
 * counters are part of the design, and a zero-latency mock would hide them.
 */
export async function request<T>(
  produce: () => T,
  options: { minMs?: number; maxMs?: number } = {},
): Promise<T> {
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      randomLatency(options.minMs ?? MIN_LATENCY_MS, options.maxMs ?? MAX_LATENCY_MS),
    ),
  )
  return produce()
}

/** Write operations feel marginally slower than reads, as a real API would. */
export function requestWrite<T>(produce: () => T): Promise<T> {
  return request(produce, { minMs: 260, maxMs: 520 })
}

/* -------------------------------------------------------------------------- */
/* List handling                                                               */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PAGE_SIZE = 12
export const PAGE_SIZE_OPTIONS = [12, 25, 50, 100] as const

export interface NormalizedList {
  page: number
  pageSize: number
  search: string
  /** DRF-style ordering field; a leading `-` means descending. */
  sort: string
  filters: Record<string, string[]>
}

export function normalizeListParams(params: ListParams = {}): NormalizedList {
  const filters: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    if (value === undefined) continue
    filters[key] = (Array.isArray(value) ? value : [value]).filter((entry) => entry !== '')
  }

  return {
    page: Math.max(1, params.page ?? 1),
    pageSize: Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE),
    search: (params.search ?? '').trim(),
    sort: params.sort ?? '',
    filters,
  }
}

/** `filters.status` includes `high`, or the filter is absent. */
export function filterIncludes(filters: NormalizedList['filters'], key: string, value: string): boolean {
  const selected = filters[key]
  if (!selected || selected.length === 0) return true
  return selected.includes(value)
}

export interface ListSelectors<T> {
  /** Concatenated haystack used by the free-text search box. */
  searchText: (row: T) => string
  /** Value for the given sort key; `undefined` keeps the row in place. */
  sortValue: (row: T, key: string) => string | number | undefined
}

/**
 * Applies the free-text search half of `paginate`.
 *
 * Split out because a register also needs the post-search set for its aggregate
 * tiles. Counting before the search runs would report the whole filtered set
 * while the table shows four rows of it, and the two would never add up.
 */
export function applySearch<T>(rows: readonly T[], query: NormalizedList, selectors: ListSelectors<T>): T[] {
  if (!query.search) return [...rows]
  const needle = query.search.toLowerCase()
  return rows.filter((row) => selectors.searchText(row).toLowerCase().includes(needle))
}

export function paginate<T>(rows: readonly T[], query: NormalizedList, selectors: ListSelectors<T>): Paginated<T> {
  let result: readonly T[] = applySearch(rows, query, selectors)

  if (query.sort) {
    const descending = query.sort.startsWith('-')
    const key = descending ? query.sort.slice(1) : query.sort
    const sorted = [...result].sort((a, b) => {
      const left = selectors.sortValue(a, key)
      const right = selectors.sortValue(b, key)
      if (left === undefined && right === undefined) return 0
      if (left === undefined) return 1
      if (right === undefined) return -1
      if (typeof left === 'number' && typeof right === 'number') return left - right
      return String(left).localeCompare(String(right))
    })
    result = descending ? sorted.reverse() : sorted
  }

  const total = result.length
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
  const page = Math.min(query.page, totalPages)
  const start = (page - 1) * query.pageSize

  return {
    count: total,
    results: result.slice(start, start + query.pageSize),
    page,
    pageSize: query.pageSize,
    totalPages,
  }
}
