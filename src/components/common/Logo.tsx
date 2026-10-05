import { Link } from 'react-router-dom'

import { cn } from '@/utils/cn'

/**
 * VAPTFlow mark: a shield with a check, drawn inline so it inherits the accent
 * colour in both themes.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
    >
      <path
        d="M16 3.2 27 7.4v8.4c0 6.1-4.2 11-11 12.1C9.2 26.8 5 21.9 5 15.8V7.4L16 3.2Z"
        className="fill-accent-soft stroke-accent"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m10.8 16.1 3.6 3.6 6.8-7.6"
        className="stroke-accent"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({
  className,
  showTagline = false,
  size = 'md',
}: {
  className?: string
  showTagline?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={size === 'lg' ? 'size-9' : size === 'sm' ? 'size-7' : undefined} />
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            'font-semibold tracking-tight text-fg',
            size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-[15px]',
          )}
        >
          VAPT<span className="text-accent-text">Flow</span>
        </span>
        {showTagline ? (
          <span className="mt-1 text-[11px] font-normal text-fg-subtle">
            Automated Web Security Testing &amp; VAPT Management
          </span>
        ) : null}
      </span>
    </span>
  )
}

/** Sidebar/topbar variant that links back to the dashboard. */
export function LogoLink({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      to="/dashboard"
      aria-label="VAPTFlow dashboard"
      className="flex items-center gap-2.5 rounded-md"
    >
      <Logo size={collapsed ? 'sm' : 'md'} />
    </Link>
  )
}
