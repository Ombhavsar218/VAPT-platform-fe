/**
 * Query-string helpers for the URL-backed list pages.
 *
 * `useListQuery` keeps its filter state under an `f_` prefix so it cannot
 * collide with the pagination and sort keys, and every register page reads its
 * filters through that hook. Building those links by hand is how the prefix gets
 * dropped: a link to `/scans?status=running` looks right, passes review, and
 * silently arrives on an unfiltered list because the page is listening for
 * `f_status`.
 *
 * Going through `listFilterHref` means the prefix is applied in exactly one
 * place, so a link either targets a real filter or fails to compile.
 */

/** Prefix `useListQuery` uses to distinguish filter keys from sort/pagination. */
export const FILTER_KEY_PREFIX = 'f_'

export type ListFilters = Record<string, string>

/**
 * Builds a link to a register page with filters applied.
 *
 * Empty values are omitted rather than written as `f_x=`, which would otherwise
 * register as a filter with a blank selection.
 */
export function listFilterHref(path: string, filters: ListFilters): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value === '') continue
    params.set(`${FILTER_KEY_PREFIX}${key}`, value)
  }

  const query = params.toString()
  return query === '' ? path : `${path}?${query}`
}
