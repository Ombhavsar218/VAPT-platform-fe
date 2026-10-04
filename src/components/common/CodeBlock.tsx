import { useCallback, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { cn } from '@/utils/cn'

/* -------------------------------------------------------------------------- */
/* Token model                                                                 */
/* -------------------------------------------------------------------------- */

type Tone =
  | 'method'
  | 'target'
  | 'version'
  | 'status'
  | 'header'
  | 'value'
  | 'string'
  | 'number'
  | 'literal'
  | 'punctuation'
  | 'plain'

interface Segment {
  text: string
  tone: Tone
}

const TONE_CLASSES: Record<Tone, string> = {
  method: 'text-accent font-semibold',
  target: 'text-fg font-medium',
  version: 'text-fg-subtle',
  status: 'text-warning font-semibold',
  header: 'text-info',
  value: 'text-fg-muted',
  string: 'text-success',
  number: 'text-sev-medium',
  literal: 'text-sev-low',
  punctuation: 'text-fg-subtle',
  plain: 'text-fg-muted',
}

/** Header names whose values are masked when `redact` is enabled. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
])

const REQUEST_LINE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)\s+(HTTP\/\d(?:\.\d)?)$/
const STATUS_LINE = /^(HTTP\/\d(?:\.\d)?)\s+(\d{3})\s*(.*)$/
const HEADER_LINE = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+):\s?(.*)$/

/* -------------------------------------------------------------------------- */
/* Tokenizers                                                                  */
/* -------------------------------------------------------------------------- */

function tokenizeJson(source: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}[\],:])/g

  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: source.slice(cursor, match.index), tone: 'plain' })
    }

    if (match[1] !== undefined) {
      segments.push({ text: match[1], tone: 'string' })
      if (match[2] !== undefined) segments.push({ text: match[2], tone: 'punctuation' })
    } else if (match[3] !== undefined) {
      segments.push({ text: match[3], tone: 'literal' })
    } else if (match[4] !== undefined) {
      segments.push({ text: match[4], tone: 'number' })
    } else if (match[5] !== undefined) {
      segments.push({ text: match[5], tone: 'punctuation' })
    }

    cursor = pattern.lastIndex
  }

  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), tone: 'plain' })
  }
  return segments
}

function looksLikeJsonBody(body: string): boolean {
  const trimmed = body.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function tokenizeHttp(raw: string, redact: boolean): Segment[][] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')

  // The first blank line separates headers from the body.
  const separatorIndex = lines.findIndex((line) => line.trim() === '')
  const bodyLines = separatorIndex === -1 ? [] : lines.slice(separatorIndex + 1)
  const bodyIsJson = looksLikeJsonBody(bodyLines.join('\n'))

  const result: Segment[][] = []
  let inBody = false

  for (const line of lines) {
    if (inBody) {
      result.push(bodyIsJson ? tokenizeJson(line) : [{ text: line, tone: 'plain' }])
      continue
    }

    if (line.trim() === '') {
      inBody = true
      result.push([{ text: '', tone: 'plain' }])
      continue
    }

    const request = REQUEST_LINE.exec(line)
    if (request) {
      result.push([
        { text: request[1] ?? '', tone: 'method' },
        { text: ' ', tone: 'plain' },
        { text: request[2] ?? '', tone: 'target' },
        { text: ' ', tone: 'plain' },
        { text: request[3] ?? '', tone: 'version' },
      ])
      continue
    }

    const status = STATUS_LINE.exec(line)
    if (status) {
      result.push([
        { text: status[1] ?? '', tone: 'version' },
        { text: ' ', tone: 'plain' },
        { text: status[2] ?? '', tone: 'status' },
        { text: status[3] ? ` ${status[3]}` : '', tone: 'plain' },
      ])
      continue
    }

    const header = HEADER_LINE.exec(line)
    if (header) {
      const name = header[1] ?? ''
      const value = header[2] ?? ''
      const masked = redact && SENSITIVE_HEADERS.has(name.toLowerCase()) && value.length > 0
      result.push([
        { text: name, tone: 'header' },
        { text: ':', tone: 'punctuation' },
        { text: ' ', tone: 'plain' },
        {
          text: masked ? `${value.slice(0, 4)}${'•'.repeat(Math.min(12, value.length - 4))}` : value,
          tone: masked ? 'literal' : 'value',
        },
      ])
      continue
    }

    result.push([{ text: line, tone: 'plain' }])
  }

  return result
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export interface CodeBlockProps {
  code: string
  /** Short caption above the block, e.g. "Request" or "Response". */
  label?: string
  language?: 'http' | 'json' | 'text'
  /** Masks Authorization, Cookie and API-key header values. On by default. */
  redact?: boolean
  showLineNumbers?: boolean
  maxHeight?: number
  className?: string
}

export function CodeBlock({
  code,
  label,
  language = 'http',
  redact = true,
  showLineNumbers = true,
  maxHeight,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const lines = useMemo(() => {
    const source = code.replace(/\r\n/g, '\n')
    if (language === 'json') {
      return source.split('\n').map((line) => tokenizeJson(line))
    }
    if (language === 'http') return tokenizeHttp(code, redact)
    return source.split('\n').map((line) => [{ text: line, tone: 'plain' as const }])
  }, [code, language, redact])

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }, [code])

  const gutterWidth = showLineNumbers ? String(lines.length).length : 0

  return (
    <div className={cn('overflow-hidden rounded-md border border-border-base bg-bg', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border-base bg-surface-2/70 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {label ? (
            <span className="truncate font-mono text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              {label}
            </span>
          ) : null}
          {redact && language === 'http' ? (
            <span className="hidden rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning sm:inline">
              sensitive values masked
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
        >
          {copied ? (
            <>
              <Check className="size-3" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3" aria-hidden="true" />
              Copy
            </>
          )}
        </button>
      </div>

      <pre
        className="overflow-auto p-3 font-mono text-[12px] leading-[1.65]"
        style={maxHeight ? { maxHeight } : undefined}
        tabIndex={0}
      >
        <code>
          {lines.map((segments, lineIndex) => (
            <div key={lineIndex} className="flex">
              {showLineNumbers ? (
                <span
                  aria-hidden="true"
                  className="mr-3 shrink-0 select-none text-right text-fg-subtle/60 tabular-nums"
                  style={{ width: `${Math.max(2, gutterWidth)}ch` }}
                >
                  {lineIndex + 1}
                </span>
              ) : null}
              <span className="min-w-0 whitespace-pre-wrap break-all">
                {segments.length === 0 ? (
                  ' '
                ) : (
                  segments.map((segment, segmentIndex) => (
                    <span key={segmentIndex} className={TONE_CLASSES[segment.tone]}>
                      {segment.text}
                    </span>
                  ))
                )}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}
