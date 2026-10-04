import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { AuthProvider } from '@/hooks/useAuth'
import { ThemeProvider } from '@/hooks/useTheme'
import { ToastProvider } from '@/hooks/useToast'
import { NavCountsProvider, SidebarPreferenceProvider } from '@/routes/NavContext'
import { router } from '@/routes/router'

/**
 * Query defaults tuned for a mock transport that resolves in a few hundred
 * milliseconds: no aggressive refetching, and retries stay off so error states
 * are reachable and the UI is not silently thrashing.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <SidebarPreferenceProvider>
              <NavCountsProvider>
                <RouterProvider router={router} />
              </NavCountsProvider>
            </SidebarPreferenceProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
