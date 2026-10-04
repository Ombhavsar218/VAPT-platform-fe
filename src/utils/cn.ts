/**
 * Minimal class-name joiner.
 *
 * Deliberately dependency-free. It filters falsy values and flattens arrays so
 * components can compose class names ergonomically:
 *
 *   cn('px-3', isActive && 'bg-accent')
 *
 * It intentionally does NOT implement Tailwind conflict resolution. Components
 * expose explicit variant props instead of relying on a caller overriding a
 * conflicting base utility through `className`.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]

export function cn(...values: ClassValue[]): string {
  const out: string[] = []

  for (const value of values) {
    if (!value && value !== 0) continue
    if (Array.isArray(value)) {
      const nested = cn(...value)
      if (nested) out.push(nested)
    } else {
      out.push(String(value))
    }
  }

  return out.join(' ')
}
