import { useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import type { Evidence } from '@/types'
import { Button } from '@/components/common/Button'
import { formatRelativeTime } from '@/utils/format'

/**
 * Raw request/response evidence.
 *
 * Verbatim HTTP is the only evidence a reviewer can actually argue with, so it
 * is shown monospaced and unformatted rather than pretty-printed — a
 * re-indented body would misrepresent what the scanner actually saw. Long
 * bodies collapse so one huge response cannot bury the rest of the page.
 */

const PREVIEW_LINES = 12

function EvidenceBlock({ label, body }: { label: string; body: string }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const lines = body.split('\n')
  const truncated = lines.length > PREVIEW_LINES
  const visible = expanded || !truncated ? body : lines.slice(0, PREVIEW_LINES).join('\n')

  const copy = () => {
    void navigator.clipboard?.writeText(body).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-base bg-surface-2">
      <div className="flex items-center justify-between gap-2 border-b border-border-base px-3 py-1.5">
        <span className="text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={copy}
            leadingIcon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {truncated ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((value) => !value)}
              trailingIcon={
                <ChevronDown className={expanded ? 'size-3.5 rotate-180' : 'size-3.5'} />
              }
            >
              {expanded ? 'Collapse' : `All ${lines.length} lines`}
            </Button>
          ) : null}
        </div>
      </div>
      <pre className="max-h-96 overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-fg-muted">
        {visible}
      </pre>
    </div>
  )
}

export function EvidencePanel({ evidence }: { evidence: Evidence }) {
  return (
    <div className="space-y-3">
      <EvidenceBlock label="Request" body={evidence.request} />
      <EvidenceBlock label="Response" body={evidence.response} />
      <p className="text-xs text-fg-subtle">
        Evidence captured {formatRelativeTime(evidence.observedAt)}.
      </p>
    </div>
  )
}