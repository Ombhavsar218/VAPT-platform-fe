import type { ScopeConfig } from '@/types'

/**
 * Field-wise comparison for the scope draft.
 *
 * Order is ignored on purpose: re-ordering the same paths is not an edit worth
 * marking dirty, and a naive `JSON.stringify` comparison would report it as one.
 */
export function isScopeDirty(draft: ScopeConfig, saved: ScopeConfig): boolean {
  const sameList = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false
    const left = [...a].sort()
    const right = [...b].sort()
    return left.every((entry, index) => entry === right[index])
  }

  return (
    !sameList(draft.allowedPaths, saved.allowedPaths) ||
    !sameList(draft.excludedPaths, saved.excludedPaths) ||
    !sameList(draft.allowedDomains, saved.allowedDomains) ||
    !sameList(draft.excludedDomains, saved.excludedDomains) ||
    draft.authorizationConfirmed !== saved.authorizationConfirmed ||
    draft.authorizationNote.trim() !== saved.authorizationNote.trim()
  )
}
