import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertCircle } from 'lucide-react'

import { cn } from '@/utils/cn'

// Focus is deliberately not handled with an ad-hoc ring: the global
// :focus-visible outline draws a solid --ring that clears 3:1 against every
// surface. Suppressing it here and substituting a low-alpha ring was the
// accessibility regression this replaces.
const CONTROL_BASE =
  'w-full rounded-md border border-control-border bg-surface-3 text-fg placeholder:text-fg-subtle ' +
  'transition-colors duration-150 hover:border-border-strong ' +
  'focus:border-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

const INVALID = 'border-danger focus:border-danger'

export interface FieldProps {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  children?: ReactNode
}

/** Label + hint + error scaffolding shared by every form control. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-fg-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-danger"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  leadingSlot?: ReactNode
  trailingSlot?: ReactNode
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, invalid = false, leadingSlot, trailingSlot, ...rest },
  ref,
) {
  if (leadingSlot || trailingSlot) {
    return (
      <div className="relative">
        {leadingSlot ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
            {leadingSlot}
          </span>
        ) : null}
        <input
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            CONTROL_BASE,
            'h-9 text-sm',
            leadingSlot ? 'pl-9' : 'px-3',
            trailingSlot ? 'pr-9' : undefined,
            invalid && INVALID,
            className,
          )}
          {...rest}
        />
        {trailingSlot ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
            {trailingSlot}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, 'h-9 px-3 text-sm', invalid && INVALID, className)}
      {...rest}
    />
  )
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, invalid = false, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'resize-y px-3 py-2 text-sm leading-relaxed',
        invalid && INVALID,
        className,
      )}
      {...rest}
    />
  )
})

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, options, placeholder, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          'h-9 appearance-none pl-3 pr-9 text-sm',
          invalid && INVALID,
          className,
        )}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
      >
        <path
          d="m6 8 4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
})

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  description?: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className={cn('flex gap-2.5', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded border border-control-border bg-surface-3',
          'transition-colors duration-150 checked:border-accent checked:bg-accent checked:bg-check',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="cursor-pointer text-[13px] leading-5 text-fg">
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
    </div>
  )
})

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  id?: string
}

export function Switch({ checked, onChange, label, description, disabled, id }: SwitchProps) {
  const generatedId = useId()
  const switchId = id ?? generatedId

  return (
    <div className="flex items-start justify-between gap-4">
      {label ? (
        <div className="min-w-0">
          <label htmlFor={switchId} className="cursor-pointer text-[13px] font-medium text-fg">
            {label}
          </label>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>
          ) : null}
        </div>
      ) : null}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-surface-3 border border-control-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
