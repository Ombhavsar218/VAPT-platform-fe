import { Radar, ScanLine, ShieldCheck } from 'lucide-react'

import { ProgressBar } from '@/components/common/ProgressBar'
import type { Severity } from '@/types'
import { SCAN_STATUS_META, SEVERITY_META } from '@/utils/severity'
import { cn } from '@/utils/cn'

/**
 * The hero visual: a VAPTFlow scan in flight, composed from the app's own tokens
 * and primitives.
 *
 * It is drawn rather than photographed on purpose. The project ships no image
 * assets at all — every other visual in VAPTFlow is an inline SVG, a lucide icon
 * or a gradient — so a screenshot would have been the only asset that did not
 * theme itself. Composing the panel from `SEVERITY_META` and `SCAN_STATUS_META`
 * means the mockup cannot drift out of step with the palette, in either theme.
 *
 * The figures are illustrative, not read from the store: this renders for signed
 * out visitors, who have no workspace to summarise.
 */

const RUNNING = SCAN_STATUS_META.running

const MOCK_SEVERITIES: ReadonlyArray<readonly [Severity, number]> = [
  ['critical', 2],
  ['high', 5],
  ['medium', 11],
  ['low', 8],
  ['informational', 3],
]

const MOCK_FINDINGS: ReadonlyArray<{
  severity: Severity
  title: string
  endpoint: string
}> = [
  {
    severity: 'critical',
    title: 'SQL injection in order search',
    endpoint: 'GET /api/v1/orders?q=',
  },
  {
    severity: 'high',
    title: 'Broken access control on invoices',
    endpoint: 'GET /api/v1/invoices/1042',
  },
  {
    severity: 'medium',
    title: 'Security headers missing',
    endpoint: 'GET /',
  },
]

const LOG_LINES: ReadonlyArray<{ text: string; tone: string }> = [
  { text: 'crawled 412 endpoints in 18s', tone: 'text-fg-subtle' },
  { text: '29 module tests executed', tone: 'text-fg-subtle' },
  { text: 'confirmed 2 critical, 5 high', tone: 'text-sev-critical' },
]

function PanelHeader() {
  return (
    <div className="flex items-center gap-3 border-b border-border-base px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent-border bg-accent-soft text-accent-text">
        <Radar className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-fg">shop.example.com</p>
        <p className="text-[11px] text-fg-subtle">Web application · Deep profile</p>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
          RUNNING.surface,
          RUNNING.border,
          RUNNING.text,
        )}
      >
        <span className={cn('size-1.5 rounded-full', RUNNING.fill)} />
        {RUNNING.label}
      </span>
    </div>
  )
}

function SeverityRow() {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
        Findings by severity
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {MOCK_SEVERITIES.map(([severity, count]) => {
          const meta = SEVERITY_META[severity]
          return (
            <li
              key={severity}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                meta.surface,
                meta.border,
                meta.text,
              )}
            >
              <span className={cn('size-1.5 rounded-full', meta.fill)} />
              {meta.label}
              <span className="font-semibold tabular-nums">{count}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FindingList() {
  return (
    <ul className="space-y-2">
      {MOCK_FINDINGS.map((finding) => {
        const meta = SEVERITY_META[finding.severity]
        return (
          <li
            key={finding.title}
            className="flex items-start gap-3 rounded-lg border border-border-base bg-surface-2 px-3 py-2.5"
          >
            <ShieldCheck className={cn('mt-0.5 size-4 shrink-0', meta.text)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-fg">{finding.title}</p>
              <p className="truncate font-mono text-[11px] text-fg-subtle">{finding.endpoint}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                meta.surface,
                meta.text,
              )}
            >
              {meta.short}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function ScanLog() {
  return (
    <div className="rounded-lg border border-border-base bg-surface-2 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
        Scan log
      </p>
      <ul className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed">
        {LOG_LINES.map((line) => (
          <li key={line.text} className={cn('flex gap-2', line.tone)}>
            <span aria-hidden="true" className="text-fg-subtle">
              ›
            </span>
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Floating risk readout, styled after the dashboard's KPI tile. */
function RiskBadge() {
  return (
    <div className="rounded-card border border-border-base bg-surface p-3.5 shadow-overlay">
      <p className="text-[11px] font-medium text-fg-muted">Risk score</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-fg">
        78
      </p>
      <p className="mt-1.5 text-[11px] text-sev-high">High exposure</p>
    </div>
  )
}

export function HeroMockup() {
  return (
    <div className="relative">
      {/* Decorative only: a faint measurement grid and a single accent bloom,
          the same vocabulary the login screen already uses. */}
      <div
        aria-hidden="true"
        className="absolute -inset-8 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--accent) 1px, transparent 1px), linear-gradient(to bottom, var(--accent) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-16 size-80 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="absolute -left-5 bottom-10 z-20 hidden animate-[drift_7s_ease-in-out_infinite] sm:block">
        <RiskBadge />
      </div>

      <div className="relative z-10 overflow-hidden rounded-card border border-border-base bg-surface">
        <PanelHeader />
        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg">
                <ScanLine className="size-3.5 text-accent-text" aria-hidden="true" />
                Analyzing responses
              </p>
              <span className="text-[11px] tabular-nums text-fg-subtle">68%</span>
            </div>
            <ProgressBar value={68} size="sm" tone="accent" />
          </div>

          <SeverityRow />
          <FindingList />
          <ScanLog />
        </div>
      </div>
    </div>
  )
}