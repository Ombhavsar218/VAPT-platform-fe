import { useQuery } from '@tanstack/react-query'

import { dashboardService, type WorkspaceCounts } from '@/services/dashboard'
import { queryKeys } from '@/services/queryKeys'

/**
 * Workspace-wide counts used by the sidebar badges, the topbar scan pill and the
 * dashboard tiles.
 *
 * Kept as its own query (rather than being read off the dashboard overview) so a
 * cheap 80–200 ms request can refresh the chrome from anywhere, including pages
 * that never load the overview.
 */
export function useWorkspaceCounts(): WorkspaceCounts | null {
  const { data } = useQuery({
    queryKey: queryKeys.counts(),
    queryFn: () => dashboardService.counts(),
    staleTime: 15_000,
  })

  return data ?? null
}
