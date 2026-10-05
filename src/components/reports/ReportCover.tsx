import { Link } from 'react-router-dom'
import { BadgeCheck, CalendarRange, FileText, Target, UserRound } from 'lucide-react'

import { ReportFormatBadge, ReportStatusBadge } from '@/components/common/StatusBadge'
import type { ReportDetailData } from '@/services/reports'
import { formatDate, formatDateTime, formatNumber } from '@/utils/format'

/**
 * The cover block of the preview.
 *
 * Shaped like the first page of the document it stands in for: who it is for,
 * what was tested, who wrote it and when. Everything here comes from the stored
 * report and its scan, never from the browser clock, so a regenerated preview
 * and the register row can never disagree.
 */
export function ReportCover({ detail }: { detail: ReportDetailData }) {
  const { report, project, targets, scan, methodology } = detail

  return (
    <div className="rounded-card border border-border-base bg-surface">
      <div className="border-b border-border-base p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ReportStatusBadge status={detail.state} />
          <ReportFormatBadge format={report.format} />
          <span className="rounded-badge border border-border-base bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
            Version {report.version}
          </span>
        </div>

        <h1 className="mt-3 text-xl font-semibold tracking-tight text-fg">{report.name}</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          {detail.client}
          {project ? ` · ${project.name}` : ''}
        </p>

        {detail.outdatedReason ? (
          <p className="mt-3 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-[13px] leading-relaxed text-warning">
            {detail.outdatedReason} Regenerate it before sharing this version with the client.
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Meta icon={<Target className="size-3.5" />} label="Scope">
          {targets.length === 0 ? (
            <span className="text-fg-subtle">No targets recorded</span>
          ) : (
            <ul className="space-y-1">
              {targets.map((target) => (
                <li key={target.id} className="min-w-0">
                  <span className="block truncate font-medium text-fg">{target.name}</span>
                  <span className="block truncate font-mono text-[11px] text-fg-subtle">
                    {target.baseUrl}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Meta>

        <Meta icon={<FileText className="size-3.5" />} label="Methodology">
          <span className="block font-medium text-fg">{methodology.profileName}</span>
          <span className="block text-fg-muted">
            {methodology.moduleIds.length} module{methodology.moduleIds.length === 1 ? '' : 's'} ·{' '}
            {formatNumber(methodology.testCount)} tests
          </span>
          {scan ? (
            <Link
              to={`/scans/${scan.id}`}
              className="mt-1 inline-block text-[12px] text-accent-text hover:underline"
            >
              View run {scan.id}
            </Link>
          ) : null}
        </Meta>

        <Meta icon={<UserRound className="size-3.5" />} label="Prepared by">
          <span className="block font-medium text-fg">{detail.authorName}</span>
          <span className="block text-fg-muted">
            {report.generatedAt ? formatDateTime(report.generatedAt) : 'Not yet generated'}
          </span>
        </Meta>

        <Meta icon={<CalendarRange className="size-3.5" />} label="Test window">
          {methodology.scanWindow ? (
            <>
              <span className="block font-medium text-fg">
                {formatDate(methodology.scanWindow.startedAt)}
                {methodology.scanWindow.completedAt
                  ? ` – ${formatDate(methodology.scanWindow.completedAt)}`
                  : ' – ongoing'}
              </span>
              <span className="block text-fg-muted">
                {formatNumber(detail.summary.endpointsTested)} endpoints ·{' '}
                {formatNumber(detail.summary.requestsTested)} requests
              </span>
            </>
          ) : (
            <span className="text-fg-subtle">Project-wide report, no single run</span>
          )}
        </Meta>

        <Meta icon={<BadgeCheck className="size-3.5" />} label="Authorisation">
          {methodology.authorisationConfirmed ? (
            <span className="block font-medium text-success">
              Written authorisation on file
            </span>
          ) : (
            <span className="block font-medium text-warning">
              Authorisation not recorded for every target
            </span>
          )}
        </Meta>
      </dl>
    </div>
  )
}

function Meta({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{children}</dd>
    </div>
  )
}