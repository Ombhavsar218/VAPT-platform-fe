import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers3, Radar, ShieldAlert, Sparkles } from 'lucide-react'

import { Card, CardHeader } from '@/components/common/Card'
import { ModuleStatusBadge } from '@/components/common/StatusBadge'
import { ProgressBar } from '@/components/common/ProgressBar'
import { Select } from '@/components/common/Form'
import type { CoverageAggregates, CoverageRow, ModuleCoverageRow } from '@/services/coverage'
import { formatNumber, formatPercent, formatRelativeTime } from '@/utils/format'
import { listFilterHref } from '@/utils/listQuery'

/**
 * Coverage view.
 *
 * "Coverage" is the most misread number in a scanner, so this panel keeps three
 * figures visibly separate: tests the enabled modules *can* run, executions those
 * tests actually made, and catalogue types that have surfaced something. A
 * category can sit at 0% with plenty of tests behind it, and the only honest way
 * to show that is side by side rather than collapsed into one score.
 */
export function CoverageMatrix({ matrix }: { matrix: CoverageRow[] }) {
  return (
    <Card flush>
      <div className="border-b border-border-base px-5 py-4">
        <CardHeader
          title="OWASP Top 10:2025 coverage"
          description="Catalogue coverage per category. Select a row to filter the findings register."
        />
      </div>

      <ul className="divide-y divide-border-base">
        {matrix.map((row) => (
          <li key={row.owaspId}>
            {/*
             * A link, not a button. `<a>` has a transparent content model, so the
             * <dl>, <p> and progress bar below are valid inside it, whereas a
             * <button> may only contain phrasing content. The row is real
             * navigation to the filtered register, so the anchor is also the
             * honest element here.
             */}
            <Link
              to={listFilterHref('/findings', { owasp: row.owaspId })}
              className="block px-5 py-3 transition-colors hover:bg-surface-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-[11px] text-fg-subtle">{row.owaspId}</span>
                  <span className="truncate text-[13px] font-medium text-fg">{row.title}</span>
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-fg">
                  {formatPercent(row.coveragePercent)}
                </span>
              </div>

              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-fg-subtle">
                {row.summary}
              </p>

              <ProgressBar
                value={row.coveragePercent}
                tone={toneFor(row.coveragePercent)}
                className="mt-2"
              />

              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <Figure label="Tests available" value={formatNumber(row.testsAvailable)} />
                <Figure label="Executions" value={formatNumber(row.testExecutions)} />
                <Figure
                  label="Types covered"
                  value={`${formatNumber(row.typesWithFindings)}/${formatNumber(row.typesAvailable)}`}
                />
                <Figure label="Findings" value={formatNumber(row.findings)} />
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Headline coverage numbers, so the matrix does not have to be read row by row. */
export function CoverageOverview({
  aggregates,
  scopedToProject,
}: {
  aggregates: CoverageAggregates
  scopedToProject: string | null
}) {
  const tiles = [
    {
      label: 'Overall coverage',
      value: formatPercent(aggregates.overallPercent),
      icon: <ShieldAlert className="size-4" />,
      caption: 'Mean of the ten category percentages.',
    },
    {
      label: 'Fully covered',
      value: formatNumber(aggregates.categoriesFullyCovered),
      icon: <Sparkles className="size-4" />,
      caption: 'Every catalogue type has produced a finding.',
    },
    {
      label: 'Untested categories',
      value: formatNumber(aggregates.categoriesUntested),
      icon: <Radar className="size-4" />,
      caption: 'No enabled module claims these categories.',
    },
    {
      label: 'Test executions',
      value: formatNumber(aggregates.testExecutions),
      icon: <Layers3 className="size-4" />,
      caption: `Across ${formatNumber(aggregates.findings)} findings${scopedToProject ? ' in this project' : ''}.`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              {tile.label}
            </p>
            <span className="text-fg-subtle">{tile.icon}</span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{tile.value}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">{tile.caption}</p>
        </Card>
      ))}
    </div>
  )
}

/** Per-module rollup: what each module contributes and when it last ran. */
export function ModuleCoverageTable({ modules }: { modules: ModuleCoverageRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <Card flush>
      <div className="border-b border-border-base px-5 py-4">
        <CardHeader
          title="Coverage by module"
          description="A module with no findings is not necessarily broken - it may simply never have run."
        />
      </div>

      <ul className="divide-y divide-border-base">
        {modules.map((module) => {
          const open = expanded === module.id
          return (
            <li key={module.id}>
              {/*
               * The button holds only phrasing content, as `<button>` requires.
               * The surrounding div carries the hover surface, and the button's
               * ::after overlay keeps the entire row clickable without nesting
               * block elements inside the control.
               */}
              <div className="relative px-5 py-3 transition-colors hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : module.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left after:absolute after:inset-0 after:content-['']"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">{module.name}</span>
                    <ModuleStatusBadge status={module.status} size="xs" />
                    <span className="font-mono text-[11px] text-fg-subtle">{module.version}</span>
                  </span>
                  <span className="text-[13px] tabular-nums text-fg-muted">
                    {formatNumber(module.findings)} findings
                  </span>
                </button>

                <p className="mt-0.5 text-[11px] text-fg-subtle">
                  {formatNumber(module.testCount)} tests · {module.owaspCategories.join(', ')}
                  {module.lastRunAt ? ` · last run ${formatRelativeTime(module.lastRunAt)}` : ' · never run'}
                </p>

                <ProgressBar
                  value={module.signalPercent}
                  tone={module.signalPercent === 0 ? 'neutral' : 'accent'}
                  className="mt-2"
                />

                {open ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <Figure label="Open findings" value={formatNumber(module.openFindings)} />
                    <Figure label="Total findings" value={formatNumber(module.findings)} />
                    <Figure label="Signal rate" value={formatPercent(module.signalPercent)} />
                    <Figure label="Runs" value={formatNumber(module.runCount)} />
                  </dl>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Project scope picker, rendered by the page so it can own the URL param. */
export function CoverageScopeSelect({
  projects,
  value,
  onChange,
}: {
  projects: Array<{ id: string; name: string }>
  value: string
  onChange: (projectId: string) => void
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={projects.map((project) => ({ value: project.id, label: project.name }))}
      placeholder="Whole workspace"
      aria-label="Scope coverage to a project"
    />
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="text-[13px] font-medium tabular-nums text-fg-muted">{value}</dd>
    </div>
  )
}

function toneFor(percent: number): 'danger' | 'warning' | 'accent' | 'neutral' {
  if (percent >= 70) return 'danger'
  if (percent >= 40) return 'warning'
  if (percent > 0) return 'accent'
  return 'neutral'
}