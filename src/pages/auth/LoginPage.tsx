import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { LogoMark } from '@/components/common/Logo'
import { useAuth, DEMO_PASSWORD, DEMO_USER } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/utils/cn'

interface LocationState {
  from?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const { login, isSubmitting, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as LocationState | null)?.from ?? '/dashboard'

  useEffect(() => {
    document.title = 'Sign in · VAPTFlow'
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate(returnTo, { replace: true })
  }, [isAuthenticated, navigate, returnTo])

  if (isAuthenticated) return null

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(440px,42%)]">
      <SignInPanel
        isSubmitting={isSubmitting}
        onSubmit={async (values) => {
          await login(values)
          navigate(returnTo, { replace: true })
        }}
      />
      <BrandPanel />
    </div>
  )
}

interface SignInValues {
  email: string
  password: string
  remember: boolean
}

function SignInPanel({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (values: SignInValues) => Promise<void>
  isSubmitting: boolean
}) {
  const toast = useToast()
  const [email, setEmail] = useState(DEMO_USER.email)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    const nextErrors: { email?: string; password?: string } = {}
    if (!email.trim()) {
      nextErrors.email = 'Enter your work email address.'
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.'
    }

    if (!password) {
      nextErrors.password = 'Enter your password.'
    } else if (password.length < 6) {
      nextErrors.password = 'Passwords must be at least 6 characters.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    await onSubmit({ email, password, remember })
  }

  return (
    <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-9 flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight text-fg">
            VAPT<span className="text-accent">Flow</span>
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-fg">Sign in to your workspace</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          Access active assessments, findings awaiting verification and client-ready reports.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          <Field
            id="email"
            label="Work email"
            error={errors.email}
            render={(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          />

          <Field
            id="password"
            label="Password"
            error={errors.password}
            trailing={
              <button
                type="button"
                onClick={() =>
                  toast.info(
                    'Password recovery is not wired up yet',
                    'In the full platform this sends a reset link to your work email.',
                  )
                }
                className="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                Forgot password?
              </button>
            }
            render={(props) => (
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          />

          <label className="flex cursor-pointer items-center gap-2.5 pt-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className={cn(
                'size-4 shrink-0 cursor-pointer appearance-none rounded border border-border-strong bg-surface-3',
                'transition-colors duration-150 checked:border-accent checked:bg-accent checked:bg-check',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              )}
            />
            <span className="text-[13px] text-fg">Keep me signed in for 30 days</span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium',
              'text-accent-fg shadow-xs transition-colors hover:bg-accent-hover',
              'disabled:pointer-events-none disabled:opacity-60',
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="mt-6 rounded-md border border-border-base bg-surface-2/60 p-3.5">
          <p className="text-xs font-medium text-fg">Demo workspace</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            Authentication is mocked for this frontend build. Any valid-looking email plus a
            6-character password signs you in; no credentials are transmitted.
          </p>
        </div>
      </div>
    </div>
  )
}

interface FieldRenderProps {
  id: string
  'aria-invalid': true | undefined
  'aria-describedby': string | undefined
  className: string
}

function Field({
  id,
  label,
  error,
  trailing,
  render,
}: {
  id: string
  label: string
  error?: string
  trailing?: React.ReactNode
  render: (props: FieldRenderProps) => React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className={trailing ? 'flex items-baseline justify-between gap-3' : undefined}>
        <label htmlFor={id} className="block text-[13px] font-medium text-fg">
          {label}
        </label>
        {trailing}
      </div>

      {render({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
        className: cn(
          'h-9 w-full rounded-md border bg-surface-3 px-3 text-sm text-fg',
          'transition-colors focus:outline-none focus:ring-2',
          error
            ? 'border-danger/60 focus:border-danger focus:ring-danger/25'
            : 'border-border-base focus:border-accent-border focus:ring-accent/30',
        ),
      })}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const CAPABILITIES: Array<[string, string]> = [
  ['Automated discovery', 'Endpoints, parameters and technology fingerprinting across the agreed scope.'],
  ['Evidence capture', 'Raw HTTP request and response retained for every flagged issue.'],
  ['Human verification', 'Explicit separation of potential signals from confirmed vulnerabilities.'],
  ['Repeatable reporting', 'Scan-to-scan comparison and OWASP-aligned client deliverables.'],
]

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden border-l border-border-base bg-surface lg:block">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--accent) 1px, transparent 1px), linear-gradient(to bottom, var(--accent) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-24 size-96 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="relative flex h-full flex-col justify-center px-14 py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          Vulnerability Assessment &amp; Penetration Testing
        </p>
        <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-tight text-fg">
          From discovery to signed-off report, in one traceable workflow.
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-fg-muted">
          VAPTFlow maps automated detection to OWASP and CWE, holds every result for analyst
          verification, and keeps a defensible audit trail across repeat assessments.
        </p>

        <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-8 gap-y-6">
          {CAPABILITIES.map(([term, detail]) => (
            <div key={term}>
              <dt className="text-[13px] font-semibold text-fg">{term}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-fg-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
