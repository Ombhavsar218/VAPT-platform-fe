import { useId, useState } from 'react'
import type { VerificationDecision } from '@/types'
import { Button } from '@/components/common/Button'
import { Field, TextArea } from '@/components/common/Form'

/**
 * The decision a reviewer makes on a verification task.
 *
 * Two rules are enforced here rather than only in the service, because they are
 * about honesty in the record and a reviewer deserves to be told before they
 * submit: dismissing a finding or asking for a retest always needs a written
 * reason, and confirming is the only decision that can be made from the
 * evidence alone.
 */

interface Option {
  value: VerificationDecision
  label: string
  blurb: string
  /** Decision closes the task. */
  terminal: boolean
}

const OPTIONS: readonly Option[] = [
  {
    value: 'confirmed',
    label: 'Confirmed',
    blurb: 'Real vulnerability. Moves the finding to confirmed and counts towards the risk score.',
    terminal: true,
  },
  {
    value: 'false_positive',
    label: 'False positive',
    blurb: 'Scanner inference was wrong. Reason required — this is the record of why.',
    terminal: true,
  },
  {
    value: 'needs_retest',
    label: 'Needs retest',
    blurb: 'Cannot be settled from here. Sends the finding back for a targeted scan.',
    terminal: false,
  },
]

const REASON_REQUIRED: readonly VerificationDecision[] = ['false_positive', 'needs_retest']
const REASON_MIN_LENGTH = 8

export interface VerificationDecisionFormProps {
  onSubmit: (input: { decision: VerificationDecision; notes: string }) => void
  pending?: boolean
  disabled?: boolean
  disabledReason?: string
  error?: string | null
}

export function VerificationDecisionForm({
  onSubmit,
  pending = false,
  disabled = false,
  disabledReason,
  error,
}: VerificationDecisionFormProps) {
  const [decision, setDecision] = useState<VerificationDecision>('confirmed')
  const [notes, setNotes] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const notesId = useId()

  const reasonRequired = REASON_REQUIRED.includes(decision)
  const selected = OPTIONS.find((option) => option.value === decision)
  const reasonTooShort = reasonRequired && notes.trim().length < REASON_MIN_LENGTH

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (reasonTooShort) {
      setLocalError(`Give at least ${REASON_MIN_LENGTH} characters of reasoning.`)
      return
    }
    setLocalError(null)
    onSubmit({ decision, notes: notes.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={disabled || pending} className="space-y-2">
        <legend className="text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">
          Decision
        </legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={
              'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ' +
              (decision === option.value
                ? 'border-accent-border bg-accent-soft'
                : 'border-border-base hover:border-border-strong')
            }
          >
            <input
              type="radio"
              name="verification-decision"
              value={option.value}
              checked={decision === option.value}
              onChange={() => setDecision(option.value)}
              className="mt-1 accent-accent"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-fg">{option.label}</span>
                {option.terminal ? null : (
                  <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-warning uppercase">
                    stays open
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-fg-muted">{option.blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field
        label="Notes"
        htmlFor={notesId}
        hint={
          reasonRequired
            ? `Required for “${selected?.label}” — what you tried and what you saw.`
            : 'Optional for a confirmed finding, but it saves the next reviewer repeating your work.'
        }
        error={reasonTooShort ? `At least ${REASON_MIN_LENGTH} characters.` : undefined}
      >
        <TextArea
          id={notesId}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          placeholder="Re-ran the request with a single quote appended; response changed to a 500 with a driver error, confirming the parameter reaches the query."
        />
      </Field>

      {error || localError ? (
        <p role="alert" className="text-xs text-danger">
          {localError ?? error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={disabled}>
          Record decision
        </Button>
        {disabled && disabledReason ? (
          <span className="text-xs text-fg-subtle">{disabledReason}</span>
        ) : null}
      </div>
    </form>
  )
}