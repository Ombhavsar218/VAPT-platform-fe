import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

import { Spinner } from './Spinner'
import { cn } from '@/utils/cn'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'dangerGhost'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'iconSm'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-hover shadow-xs',
  secondary:
    'bg-surface-2 text-fg border border-border-base hover:bg-surface-3 hover:border-border-strong',
  outline:
    'border border-border-strong text-fg bg-transparent hover:bg-surface-2',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90 shadow-xs',
  dangerGhost: 'text-danger hover:bg-danger/12',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
  icon: 'h-9 w-9',
  iconSm: 'h-8 w-8',
}

const BASE_CLASSES =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors duration-150'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        BASE_CLASSES,
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner className={size === 'sm' || size === 'iconSm' ? 'size-3.5' : 'size-4'} />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  )
})

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'>,
    Pick<
      LinkProps,
      'to' | 'state' | 'replace' | 'target' | 'reloadDocument' | 'preventScrollReset' | 'relative'
    > {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  className?: string
}

/**
 * Navigation that looks like a button.
 *
 * `<Link>` already renders an `<a>`, so wrapping a `<Button>` (or a bare `<a>`)
 * inside one produces invalid nested interactive content and breaks keyboard
 * and screen-reader behaviour. This renders the anchor directly with the shared
 * button styling instead.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'primary', size = 'md', leadingIcon, trailingIcon, className, children, to, ...rest },
  ref,
) {
  return (
    <Link
      ref={ref}
      to={to}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  )
})

export interface ButtonAnchorProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  className?: string
}

/**
 * A same-page link that looks like a button.
 *
 * `<Link>` is for router navigation, and it is the wrong element for an in-page
 * fragment: React Router does not scroll to the hash, so `<Link to="#about">`
 * updates the URL and leaves the reader where they were. A plain `<a>` keeps the
 * browser's native fragment handling — which works without JavaScript, moves the
 * sequential focus starting point, and honours `scroll-margin-top` — so these
 * hrefs should be written out rather than routed.
 */
export const ButtonAnchor = forwardRef<HTMLAnchorElement, ButtonAnchorProps>(
  function ButtonAnchor(
    { variant = 'primary', size = 'md', leadingIcon, trailingIcon, className, children, ...rest },
    ref,
  ) {
    return (
      <a
        ref={ref}
        className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
        {...rest}
      >
        {leadingIcon}
        {children}
        {trailingIcon}
      </a>
    )
  },
)
