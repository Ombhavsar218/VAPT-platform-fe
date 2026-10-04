import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { User } from '@/types'

/**
 * Mock authentication for the frontend-only phase.
 *
 * The session is a plain object in localStorage. When the Django backend lands,
 * `login`/`logout` are the only two functions that change — the `useAuth`
 * contract consumed by components stays identical.
 */

const SESSION_STORAGE_KEY = 'vaptflow:session'

export interface Session {
  user: User
  /** Distinguishes "remember me" from a tab-scoped session on sign-out. */
  remember: boolean
  issuedAt: string
}

export interface LoginCredentials {
  email: string
  password: string
  remember: boolean
}

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  /** In-flight sign-in, for disabling the submit button. */
  isSubmitting: boolean
  login: (credentials: LoginCredentials) => Promise<User>
  logout: () => void
  /**
   * Folds a server-confirmed change to the signed-in user into the live session.
   *
   * The session is a separate copy of the user record, so a profile saved
   * anywhere other than the sign-in form would otherwise be reverted by the
   * next reload. Persistence mirrors `login` so a remembered session stays in
   * `localStorage` and a tab-scoped one stays in `sessionStorage`.
   */
  syncUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const DEMO_PASSWORD = 'vaptflow'

/** Seed identity used by the mock sign-in. */
export const DEMO_USER: User = {
  id: 'usr-001',
  name: 'Aarav Reddy',
  email: 'aarav.reddy@vaptflow.io',
  role: 'lead_analyst',
  organizationId: 'org-001',
  lastActiveAt: new Date().toISOString(),
  status: 'active',
  mfaEnabled: true,
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Partial<Session>
    if (!candidate.user || typeof candidate.user.id !== 'string') return null
    return {
      user: candidate.user,
      remember: candidate.remember === true,
      issuedAt: typeof candidate.issuedAt === 'string' ? candidate.issuedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession)
  const [isSubmitting, setSubmitting] = useState(false)

  const login = useCallback(async ({ email, remember }: LoginCredentials) => {
    setSubmitting(true)
    try {
      // Simulated network round-trip so the button's pending state is real.
      await new Promise((resolve) => setTimeout(resolve, 650))

      const next: Session = {
        user: { ...DEMO_USER, email: email.trim().toLowerCase(), lastActiveAt: new Date().toISOString() },
        remember,
        issuedAt: new Date().toISOString(),
      }

      setSession(next)
      try {
        if (remember) {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
        } else {
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
        }
      } catch {
        /* session is still active in memory when storage is blocked */
      }
      return next.user
    } finally {
      setSubmitting(false)
    }
  }, [])

  const logout = useCallback(() => {
    setSession(null)
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      /* nothing to clean up */
    }
  }, [])

  const syncUser = useCallback(
    (patch: Partial<User>) => {
      if (!session) return
      const next: Session = { ...session, user: { ...session.user, ...patch } }
      setSession(next)
      try {
        if (session.remember) {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
        } else {
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
        }
      } catch {
        /* the session stays correct in memory even when storage is blocked */
      }
    },
    [session],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      isSubmitting,
      login,
      logout,
      syncUser,
    }),
    [session, isSubmitting, login, logout, syncUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return context
}

/** Convenience selector for route guards. */
export function useIsAuthenticated(): boolean {
  return useAuth().isAuthenticated
}
