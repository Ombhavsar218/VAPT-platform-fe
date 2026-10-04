import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileOutput, Info } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Field, Select, TextInput } from '@/components/common/Form'
import { Modal } from '@/components/common/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { ApiError } from '@/services/transport'
import { reportService, type GenerateOption } from '@/services/reports'
import { queryKeys } from '@/services/queryKeys'
import { REPORT_FORMATS, type ReportFormat } from '@/types'
import { REPORT_FORMAT_META } from '@/utils/severity'
import { formatNumber } from '@/utils/format'

/**
 * Generate a deliverable from a completed run.
 *
 * Only completed scans are offered. That is not a convenience: the report's
 * contents are composed from the findings a run produced, so there is nothing
 * coherent to render for a scan that is still crawling.
 */
export function GenerateReportModal({
  open,
  onClose,
  onGenerated,
  options,
  initialScanId,
  initialFormat,
  initialName,
}: {
  open: boolean
  onClose: () => void
  onGenerated: (reportId: string) => void
  options: GenerateOption[]
  /** Regeneration seeds the form so it produces the same deliverable, not a new one. */
  initialScanId?: string
  initialFormat?: ReportFormat
  initialName?: string
}) {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [scanId, setScanId] = useState('')
  const [format, setFormat] = useState<ReportFormat>('pdf')
  const [name, setName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Reopening must not inherit the last submission, and a regeneration has to
  // land on the format the reader was just looking at. Adjusting during render
  // on the open transition avoids both a stale form and a cascading effect.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setScanId(initialScanId ?? '')
      setFormat(initialFormat ?? 'pdf')
      setName(initialName ?? '')
      setFieldErrors({})
    }
  }

  const isRegeneration = Boolean(initialScanId)

  const selected = options.find((option) => option.id === scanId) ?? null

  const generate = useMutation({
    mutationFn: () => {
      if (!user) throw new ApiError(401, 'Sign in to generate a report.')
      return reportService.generate(
        { name: name.trim(), scanId, format },
        user.id,
      )
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.root })
      toast.success(
        row.report.version > 1 ? 'Report regenerated' : 'Report generated',
        `${row.report.name} is ready to review.`,
      )
      setFieldErrors({})
      onGenerated(row.report.id)
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setFieldErrors(error.fields)
        return
      }
      toast.error(
        'Could not generate the report',
        error instanceof Error ? error.message : 'Unknown error.',
      )
    },
  })

  // Naming follows the scan, but stays editable: the seed's titles are long
  // enough that nobody wants them verbatim on a client deliverable.
  const suggestName = (nextScanId: string) => {
    setScanId(nextScanId)
    const option = options.find((entry) => entry.id === nextScanId)
    if (option && name.trim() === '') setName(`${option.targetName} Security Assessment`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRegeneration ? 'Regenerate report' : 'Generate report'}
      description={
        isRegeneration
          ? 'Re-render this deliverable as a new version against current findings.'
          : 'Compose a deliverable from a completed run. The preview recomputes from live findings.'
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leadingIcon={<FileOutput className="size-4" />}
            loading={generate.isPending}
            disabled={!scanId}
            onClick={() => generate.mutate()}
          >
{isRegeneration ? 'Regenerate report' : 'Generate report'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Scan"
          htmlFor="report-scan"
          required
          error={fieldErrors.scanId}
          hint={
            selected ? (
              <span className="inline-flex items-center gap-1.5">
                {formatNumber(selected.findingCount)} findings from this run
                <Info className="size-3 text-fg-subtle" aria-hidden="true" />
              </span>
            ) : (
              'Only completed runs can be reported on.'
            )
          }
        >
          <Select
            id="report-scan"
            value={scanId}
            invalid={Boolean(fieldErrors.scanId)}
            onChange={(event) => suggestName(event.target.value)}
            placeholder="Choose a completed scan"
            options={options.map((option) => ({ value: option.id, label: option.label }))}
          />
        </Field>

        <Field label="Report name" htmlFor="report-name" required error={fieldErrors.name}>
          <TextInput
            id="report-name"
            value={name}
            invalid={Boolean(fieldErrors.name)}
            placeholder="Acme Portal Penetration Test Report"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Format"
          htmlFor="report-format"
          hint="Rendering is simulated; the format is recorded against the deliverable."
        >
          <Select
            id="report-format"
            value={format}
            onChange={(event) => setFormat(event.target.value as ReportFormat)}
            options={REPORT_FORMATS.map((entry) => ({
              value: entry,
              label: REPORT_FORMAT_META[entry].label,
            }))}
          />
        </Field>
      </div>
    </Modal>
  )
}