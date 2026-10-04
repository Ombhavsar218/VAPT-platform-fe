import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { DEFAULT_PAGE_SIZE, normalizeListParams, type NormalizedList } from '@/services/transport'
import type { ListParams } from '@/types'
import { FILTER_KEY_PREFIX } from '@/utils/listQuery'

/**
 * URL-backed list state.
 *
 * Every register page keeps its search text, filters, sort and page in the query
 * string. That makes any view shareable and bookmarkable, survives a reload, and
 * lets the browser's back button undo a filter the way an analyst expects.
 *
 * Multi-value filters are stored comma-separated (`?severity=critical,high`) and
 * handed to the service layer as arrays, matching DRF's repeated query params
 * closely enough that swapping in a real client changes nothing.
 */


function splitValues(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

export interface UseListQueryOptions {
  /** Applied when the URL carries no value for the key. */
  defaults?: Partial<ListParams>
  /** Debounce for the search box; `0` writes on every keystroke. */
  searchDebounceMs?: number
}

export interface ListQuery {
  /** Ready to hand to a service `list()` call. */
  params: ListParams
  /**
   * The same state, fully defaulted. Use this as the query key so two URLs that
   * mean the same thing resolve to the same cache entry.
   */
  normalized: NormalizedList
  page: number
  pageSize: number
  search: string
  /** DRF-style sort field; a leading `-` means descending. */
  sort: string
  sortKey: string
  sortDirection: 'asc' | 'desc'
  /** Current value per filter key; an absent key is an empty string. */
  filters: Record<string, string>
  /** Number of filters deviating from their default. */
  activeFilterCount: number
  hasAnyFilter: boolean
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  setSearch: (search: string) => void
  setSort: (sort: string) => void
  /** `value` of `''` removes the filter. */
  setFilter: (key: string, value: string | string[]) => void
  toggleFilterValue: (key: string, value: string) => void
  clearFilters: () => void
  reset: () => void
}

function toSortParts(sort: string): { key: string; direction: 'asc' | 'desc' } {
  if (!sort) return { key: '', direction: 'asc' }
  return sort.startsWith('-')
    ? { key: sort.slice(1), direction: 'desc' }
    : { key: sort, direction: 'asc' }
}

export function useListQuery(options: UseListQueryOptions = {}): ListQuery {
  const { defaults = {}, searchDebounceMs = 300 } = options
  const [searchParams, setSearchParams] = useSearchParams()

  const defaultPage = defaults.page ?? 1
  const defaultPageSize = defaults.pageSize ?? DEFAULT_PAGE_SIZE
  const defaultSearch = defaults.search ?? ''
  const defaultSort = defaults.sort ?? ''

  const page = toPositiveInt(searchParams.get('page'), defaultPage)
  const pageSize = toPositiveInt(searchParams.get('pageSize'), defaultPageSize)
  const search = searchParams.get('q') ?? defaultSearch
  const sort = searchParams.get('sort') ?? defaultSort

  const filters = useMemo(() => {
    const collected: Record<string, string> = {}
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith(FILTER_KEY_PREFIX)) {
        collected[key.slice(FILTER_KEY_PREFIX.length)] = value
      }
    }
    return collected
  }, [searchParams])

  const { key: sortKey, direction: sortDirection } = toSortParts(sort)

  /* ---------------------------------------------------------------- write */

  const patch = useCallback(
    (mutate: (next: URLSearchParams) => void, options_: { replace?: boolean } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          mutate(next)
          return next
        },
        { replace: options_.replace ?? false },
      )
    },
    [setSearchParams],
  )

  const setPage = useCallback(
    (next: number) => {
      patch((params) => {
        if (next <= defaultPage) params.delete('page')
        else params.set('page', String(next))
      })
    },
    [patch, defaultPage],
  )

  const setPageSize = useCallback(
    (next: number) => {
      patch((params) => {
        params.set('pageSize', String(next))
        params.delete('page')
      })
    },
    [patch],
  )

  // Search text is typed locally and debounced into the URL, so the input never
  // lags behind the keyboard and the request is not fired per keystroke.
  const [searchDraft, setSearchDraft] = useState(search)
  const committedSearch = useRef(search)

  useEffect(() => {
    if (search !== committedSearch.current) {
      committedSearch.current = search
      setSearchDraft(search)
    }
  }, [search])

  const setSearch = useCallback(
    (value: string) => {
      setSearchDraft(value)
      if (searchDebounceMs <= 0) {
        committedSearch.current = value
        patch((params) => {
          if (value) params.set('q', value)
          else params.delete('q')
          params.delete('page')
        })
      }
    },
    [patch, searchDebounceMs],
  )

  useEffect(() => {
    if (searchDebounceMs <= 0) return
    if (searchDraft === search) return
    const timer = setTimeout(() => {
      committedSearch.current = searchDraft
      patch((params) => {
        if (searchDraft) params.set('q', searchDraft)
        else params.delete('q')
        params.delete('page')
      })
    }, searchDebounceMs)
    return () => clearTimeout(timer)
  }, [searchDraft, search, searchDebounceMs, patch])

  const setSort = useCallback(
    (value: string) => {
      patch((params) => {
        if (value) params.set('sort', value)
        else params.delete('sort')
        params.delete('page')
      })
    },
    [patch],
  )

  const setFilter = useCallback(
    (key: string, value: string | string[]) => {
      const values = Array.isArray(value) ? value : value ? [value] : []
      patch((params) => {
        const paramKey = `${FILTER_KEY_PREFIX}${key}`
        if (values.length === 0) params.delete(paramKey)
        else params.set(paramKey, values.join(','))
        params.delete('page')
      })
    },
    [patch],
  )

  const toggleFilterValue = useCallback(
    (key: string, value: string) => {
      const paramKey = `${FILTER_KEY_PREFIX}${key}`
      const current = splitValues(searchParams.get(paramKey))
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
      patch((params) => {
        if (next.length === 0) params.delete(paramKey)
        else params.set(paramKey, next.join(','))
        params.delete('page')
      })
    },
    [patch, searchParams],
  )

  const clearFilters = useCallback(() => {
    patch((params) => {
      for (const key of [...params.keys()]) {
        if (key.startsWith(FILTER_KEY_PREFIX)) params.delete(key)
      }
      params.delete('page')
    })
  }, [patch])

  const reset = useCallback(() => {
    setSearchDraft(defaultSearch)
    committedSearch.current = defaultSearch
    setSearchParams(new URLSearchParams(), { replace: false })
  }, [setSearchParams, defaultSearch])

  /* ----------------------------------------------------------------- read */

  const defaultFilters = useMemo(() => {
    const collected: Record<string, string> = {}
    for (const [key, value] of Object.entries(defaults.filters ?? {})) {
      if (value === undefined) continue
      collected[key] = (Array.isArray(value) ? value : [value]).filter(Boolean).join(',')
    }
    return collected
  }, [defaults.filters])

  const activeFilterCount = useMemo(() => {
    let count = 0
    for (const [key, value] of Object.entries(filters)) {
      if (value !== (defaultFilters[key] ?? '')) count += 1
    }
    return count
  }, [filters, defaultFilters])

  const params = useMemo<ListParams>(() => {
    const filterValues: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(filters)) {
      const values = splitValues(value)
      if (values.length > 0) filterValues[key] = values
    }

    return {
      page,
      pageSize,
      search,
      sort,
      filters: filterValues,
    }
  }, [page, pageSize, search, sort, filters])

  const normalized = useMemo(() => normalizeListParams(params), [params])

  return {
    params,
    normalized,
    page,
    pageSize,
    search,
    sort,
    sortKey,
    sortDirection,
    filters,
    activeFilterCount,
    hasAnyFilter: activeFilterCount > 0 || search.length > 0,
    setPage,
    setPageSize,
    setSearch,
    setSort,
    setFilter,
    toggleFilterValue,
    clearFilters,
    reset,
  }
}

function toPositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** `sort=severity` → `{ key: 'severity', direction: 'asc' }`, `''` → `null`. */
export function sortToState(sort: string): { key: string; direction: 'asc' | 'desc' } | null {
  if (!sort) return null
  return toSortParts(sort)
}

/** Inverse of `sortToState`, for `DataTable`'s `onSortChange`. */
export function sortFromState(state: { key: string; direction: 'asc' | 'desc' } | null): string {
  if (!state) return ''
  return state.direction === 'desc' ? `-${state.key}` : state.key
}
