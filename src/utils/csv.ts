/**
 * CSV serialisation and client-side file download.
 *
 * No dependency is used for this: the output is a handful of RFC 4180 rows, and
 * the report has to work offline in a demo build, so a library would add weight
 * without adding capability.
 */

/**
 * Escape one field. A field is quoted if it contains a comma, quote, CR or LF,
 * and embedded quotes are doubled.
 */
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

/**
 * Build a CSV document from a header row and body rows.
 *
 * A UTF-8 byte order mark and CRLF line endings are emitted because both are what
 * spreadsheet software expects; without the BOM, non-ASCII finding titles open
 * as mojibake.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** Trigger a download of `contents` as a file named `filename`. */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType: string,
): void {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Release the object URL once the download has been handed to the browser.
  URL.revokeObjectURL(url)
}

/** Filesystem-safe slug, so report names can be used in a download filename. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report'
  )
}
