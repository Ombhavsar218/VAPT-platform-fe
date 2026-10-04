/**
 * Shared Recharts styling.
 *
 * Colours are referenced as CSS custom properties rather than hex literals so
 * charts follow the active theme (light/dark) without a JavaScript read of the
 * palette, and so a palette change in `styles/index.css` reaches the charts too.
 *
 * Recharts forwards these straight to SVG elements, so they are declared as SVG
 * presentation attributes rather than CSS properties.
 */

/** Tick label styling for both axes. */
export const AXIS_STICK = { fill: 'var(--fg-subtle)', fontSize: 11 } as const

/** Horizontal-only grid lines. */
export const GRID_STROKE = { stroke: 'var(--border)', strokeDasharray: '3 3' } as const

export const TOOLTIP_CONTENT_STYLE = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: '0.5rem',
  color: 'var(--fg)',
  fontSize: 12,
  padding: '8px 10px',
} as const

export const TOOLTIP_LABEL_STYLE = {
  color: 'var(--fg-muted)',
  fontSize: 11,
  marginBottom: 4,
} as const

export const TOOLTIP_ITEM_STYLE = { color: 'var(--fg)', padding: '1px 0' } as const

export const LEGEND_WRAPPER_STYLE = {
  fontSize: 12,
  color: 'var(--fg-muted)',
  cursor: 'pointer',
} as const
