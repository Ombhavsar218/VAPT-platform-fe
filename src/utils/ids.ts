/**
 * Id helpers shared by the services.
 *
 * Ids are sequential with a fixed width (`aud-00042`) so they sort the same way
 * lexically and numerically. That means the next id has to come from the
 * highest existing number, never from `array.length`: services append rows out
 * of order and rows can be deleted between calls, so a length-derived id will
 * eventually hand out one that already exists.
 */

/**
 * Next free number for `prefix`, ignoring ids with any other prefix.
 *
 * Scoped by prefix because the dataset interleaves `scn-0001` and `scn-job-0002`
 * style ids loosely, and a global scan would let a long numeric id from another
 * series inflate the counter and produce `aud-00091` for the first new audit row.
 */
export function nextIndexFor(prefix: string, ids: readonly string[]): number {
  const marker = `${prefix}-`
  let highest = 0
  for (const id of ids) {
    if (!id.startsWith(marker)) continue
    const parsed = Number.parseInt(id.slice(marker.length), 10)
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed
  }
  return highest + 1
}

/** Next audit entry number, from the audit log itself. */
export function nextAuditIndex(entries: readonly { id: string }[]): number {
  return nextIndexFor('aud', entries.map((entry) => entry.id))
}