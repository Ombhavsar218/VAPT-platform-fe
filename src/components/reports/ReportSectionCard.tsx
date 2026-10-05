import { useState } from 'react'
import { ChevronDown, ExternalLink, Repeat2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ConfidenceBadge } from '@/components/common/ConfidenceBadge'
import { SeverityBadge } from '@/components/common/SeverityBadge'
import { FindingStatusBadge } from '@/components/common/StatusBadge'
import type { ReportSection } from '@/services/reports'
import { formatDate, formatNumber } from '@/utils/format'

/**
 * One numbered finding, as it appears in the deliverable.
 *
 * The body is collapsed by default because a report with forty findings would
 * otherwise be unusable on screen, but the summary line always carries the
 * severity, the location and the classification - everything someone skimming
 * for "is anything critical in here" needs.
 */
export function ReportSectionCard({ section }: { section: ReportSection }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <article className="rounded-card border border-border-base bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="mt-0.5 font-mono text-[12px] font-semibold text-fg-subtle">
          {section.reference}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={section.severity} />
            <span className="text-[13px] font-semibold text-fg">{section.title}</span>
          </span>

          <span className="mt-1 block font-mono text-[11px] text-fg-subtle">
            {section.httpMethod} {section.endpoint}
            {section.parameter ? ` · ${section.parameter}` : ''}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
            <span>
              {section.cweId} · {section.owaspId} {section.owaspTitle}
            </span>
            {section.occurrences > 1 ? (
              <span className="inline-flex items-center gap-1">
                <Repeat2 className="size-3" aria-hidden="true" />
                {formatNumber(section.occurrences)} occurrences
              </span>
            ) : null}
          </span>
        </span>

        <ChevronDown
          className={
            'mt-1 size-4 shrink-0 text-fg-subtle transition-transform ' +
            (expanded ? 'rotate-180' : '')
          }
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-border-base p-4">
          <Prose label="Description" body={section.description} />
          <Prose label="Impact" body={section.impact} />
          <Prose label="Remediation" body={section.remediation} />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-base pt-4 sm:grid-cols-4">
            <Attribute label="Status">
              <FindingStatusBadge status={section.status} size="xs" />
            </Attribute>
            <Attribute label="Confidence">
              <ConfidenceBadge confidence={section.confidence} />
            </Attribute>
            <Attribute label="First detected">{formatDate(section.firstDetected)}</Attribute>
            <Attribute label="Last detected">{formatDate(section.lastDetected)}</Attribute>
          </dl>

          {section.references.length > 0 ? (
            <div className="border-t border-border-base pt-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
                References
              </p>
              <ul className="mt-2 space-y-1">
                {section.references.map((reference) => (
                  <li key={reference.id} className="text-[12px]">
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-accent-text hover:underline"
                    >
                      {reference.label}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="border-t border-border-base pt-3 text-[12px]">
            <Link to={`/findings/${section.findingId}`} className="text-accent-text hover:underline">
              Open {section.findingId} in the findings register
            </Link>
          </p>
        </div>
      ) : null}
    </article>
  )
}

function Prose({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">{label}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{body}</p>
    </div>
  )
}

function Attribute({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-fg-muted">{children}</dd>
    </div>
  )
}