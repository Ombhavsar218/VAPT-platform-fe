import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { AlertOctagon, Home } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'

interface ErrorDetail {
  status: number
  title: string
  message: string
}

function describe(error: unknown): ErrorDetail {
  if (isRouteErrorResponse(error)) {
    const messages: Record<number, string> = {
      403: 'You do not have permission to view this page. Ask a workspace administrator for access.',
      404: 'The page you requested does not exist or has been moved.',
      500: 'The server encountered an unexpected error while loading this page.',
    }
    return {
      status: error.status,
      title: `${error.status} ${error.statusText || 'Error'}`,
      message: messages[error.status] ?? 'The request could not be completed.',
    }
  }

  if (error instanceof Error) {
    return {
      status: 500,
      title: 'Unexpected application error',
      message: error.message,
    }
  }

  return {
    status: 500,
    title: 'Unexpected application error',
    message: 'An unknown error occurred while rendering this page.',
  }
}

/**
 * Route-level error boundary. Keeps a rendering failure inside one branch of the
 * app instead of blanking the whole shell.
 */
export function RouteError() {
  const error = useRouteError()
  const detail = describe(error)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-16">
      <Card className="w-full max-w-lg text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
          <AlertOctagon className="size-6" aria-hidden="true" />
        </div>

        <p className="mt-5 font-mono text-xs uppercase tracking-widest text-fg-subtle">
          Error {detail.status}
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-fg">{detail.title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{detail.message}</p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="secondary" onClick={() => window.history.back()}>
            Go back
          </Button>
          <Link to="/dashboard">
            <Button variant="primary" leadingIcon={<Home className="size-4" />}>
              Back to dashboard
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
