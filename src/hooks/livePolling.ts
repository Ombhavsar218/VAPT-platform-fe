/**
 * Polling policy for views that show work in flight.
 *
 * A running scan is the only thing in the app that changes on its own, so the
 * only queries that need to poll are the ones describing one. Stopping matters
 * as much as starting: without it every register page would re-request forever
 * on a workspace that happens to have nothing running.
 *
 * Callers pass this to a query's `refetchInterval` as a function of the query,
 * so the decision is made from the data that query just returned:
 *
 *   refetchInterval: (query) => pollWhile(query.state.data?.aggregates.inFlight)
 */

export const LIVE_POLL_INTERVAL_MS = 1_000

/** Poll at the live interval while `isLive`, and never otherwise. */
export function pollWhile(isLive: boolean | undefined): number | false {
  return isLive ? LIVE_POLL_INTERVAL_MS : false
}

/** Same policy, from a count of runs in flight. */
export function pollWhileAnyInFlight(count: number | undefined): number | false {
  return (count ?? 0) > 0 ? LIVE_POLL_INTERVAL_MS : false
}
