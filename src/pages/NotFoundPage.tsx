import { useEffect } from 'react'
import { ArrowRight, Home } from 'lucide-react'

import { ButtonLink } from '@/components/common/Button'
import { Card } from '@/components/common/Card'

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · VAPTFlow'
  }, [])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-16">
      <Card className="w-full max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-accent-text">Error 404</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-fg">Page not found</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          The page you requested does not exist, or it has been moved to a different route.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <ButtonLink
            to="/projects"
            variant="secondary"
            trailingIcon={<ArrowRight className="size-3.5" />}
          >
            Projects
          </ButtonLink>
          <ButtonLink to="/dashboard" variant="primary" leadingIcon={<Home className="size-4" />}>
            Back to dashboard
          </ButtonLink>
        </div>
      </Card>
    </div>
  )
}
