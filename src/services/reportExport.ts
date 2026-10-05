import { toCsv } from '@/utils/csv'

import type { ReportDetailData, ReportSection } from './reports'

/**
 * Findings register as CSV.
 *
 * The preview and the CSV are generated from the same `ReportDetailData` the
 * client is looking at, so the spreadsheet can never disagree with the document
 * that was approved. Every finding is included regardless of severity: a
 * register that silently drops rows is worse than one that is long.
 */
const FINDINGS_COLUMNS = [
  'Reference',
  'Title',
  'Severity',
  'Status',
  'Confidence',
  'CWE',
  'OWASP 2025',
  'OWASP category',
  'Endpoint',
  'HTTP method',
  'Parameter',
  'Occurrences',
  'First detected',
  'Last detected',
  'Description',
  'Impact',
  'Remediation',
  'References',
] as const

function rowFor(section: ReportSection): string[] {
  return [
    section.reference,
    section.title,
    section.severity,
    section.status,
    section.confidence,
    section.cweId,
    section.owaspId,
    section.owaspTitle,
    section.endpoint,
    section.httpMethod,
    section.parameter ?? '',
    String(section.occurrences),
    section.firstDetected,
    section.lastDetected,
    section.description,
    section.impact,
    section.remediation,
    section.references.join(' '),
  ]
}

/** Flatten the severity groups into the order the client reads them. */
export function reportFindingsCsv(detail: ReportDetailData): string {
  const rows = detail.groups.flatMap((group) => group.findings.map(rowFor))
  return toCsv(FINDINGS_COLUMNS, rows)
}
