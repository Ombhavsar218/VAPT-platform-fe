import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Checkbox, Field, TextArea, TextInput } from '@/components/common/Form'
import { InlineError } from '@/components/common/ErrorState'
import { useToast } from '@/hooks/useToast'
import { queryKeys } from '@/services/queryKeys'
import { targetService } from '@/services/targets'
import { ApiError } from '@/services/transport'
import type { ScopeConfig } from '@/types'
import { isScopeDirty } from './scopeDiff'

export interface ScopeEditorProps {
  targetId: string
  scope: ScopeConfig
}

function toText(paths: string[]): string {
  return paths.join('\n')
}

function parse(raw: string): string[] {
  return raw
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/**
 * Scope and authorisation editor.
 *
 * Scope is written one path per line, which is how the rest of the app shows it.
 * Authorisation can be recorded but not withdrawn here — see `updateScope` for
 * why, and keep the checkbox disabled once it is on.
 */
export function ScopeEditor({ targetId, scope }: ScopeEditorProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [allowed, setAllowed] = useState(() => toText(scope.allowedPaths))
  const [excluded, setExcluded] = useState(() => toText(scope.excludedPaths))
  const [allowedDomains, setAllowedDomains] = useState(() => toText(scope.allowedDomains))
  const [excludedDomains, setExcludedDomains] = useState(() => toText(scope.excludedDomains))
  const [note, setNote] = useState(scope.authorizationNote)
  const [confirmed, setConfirmed] = useState(scope.authorizationConfirmed)
  const [error, setError] = useState<string | null>(null)

  const draft = useMemo<ScopeConfig>(
    () => ({
      allowedPaths: parse(allowed),
      excludedPaths: parse(excluded),
      allowedDomains: parse(allowedDomains),
      excludedDomains: parse(excludedDomains),
      authorizationConfirmed: confirmed,
      authorizationNote: note,
    }),
    [allowed, excluded, allowedDomains, excludedDomains, confirmed, note],
  )

  const dirty = isScopeDirty(draft, scope)

  const mutation = useMutation({
    mutationFn: () => targetService.updateScope(targetId, draft),
    onSuccess: (updated) => {
      setError(null)
      toast.success('Scope updated', `${updated.scope.allowedPaths.length} allowed path(s) recorded.`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.targets.detail(targetId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.targets.root })
    },
    onError: (caught: unknown) => {
      if (caught instanceof ApiError) {
        setError(
          Object.values(caught.fields)[0] ?? caught.message,
        )
        return
      }
      setError('Something went wrong while saving the scope.')
    },
  })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field
          label="Allowed paths"
          htmlFor={`scope-allowed-${targetId}`}
          required
          hint="One path per line. Matched as a prefix, so /api covers every route beneath it."
        >
          <TextArea
            id={`scope-allowed-${targetId}`}
            rows={6}
            className="font-mono text-[13px]"
            value={allowed}
            onChange={(event) => setAllowed(event.target.value)}
          />
        </Field>

        <Field
          label="Excluded paths"
          htmlFor={`scope-excluded-${targetId}`}
          hint="Excluded after the allow list is matched, so a sensitive path can be carved out."
        >
          <TextArea
            id={`scope-excluded-${targetId}`}
            rows={6}
            className="font-mono text-[13px]"
            value={excluded}
            onChange={(event) => setExcluded(event.target.value)}
          />
        </Field>

        <Field
          label="Allowed domains"
          htmlFor={`scope-allowed-domains-${targetId}`}
          hint="Hosts the crawler may follow off the base URL."
        >
          <TextArea
            id={`scope-allowed-domains-${targetId}`}
            rows={3}
            className="font-mono text-[13px]"
            value={allowedDomains}
            onChange={(event) => setAllowedDomains(event.target.value)}
          />
        </Field>

        <Field
          label="Excluded domains"
          htmlFor={`scope-excluded-domains-${targetId}`}
          hint="Third-party or out-of-scope hosts that must never be requested."
        >
          <TextArea
            id={`scope-excluded-domains-${targetId}`}
            rows={3}
            className="font-mono text-[13px]"
            value={excludedDomains}
            onChange={(event) => setExcludedDomains(event.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-3 border-t border-border-base pt-5">
        <div>
          <h3 className="text-[13px] font-semibold text-fg">Authorisation</h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            The reference is kept with the target for the life of the engagement. A confirmation
            cannot be cleared from this screen — re-issue the note instead.
          </p>
        </div>

        <Field label="Authorisation reference" htmlFor={`scope-note-${targetId}`}>
          <TextInput
            id={`scope-note-${targetId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="SOW-2291 §4.2 — signed 2026-09-14"
          />
        </Field>

        <Checkbox
          id={`scope-confirmed-${targetId}`}
          checked={confirmed}
          disabled={scope.authorizationConfirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          label="Written client authorisation confirmed"
          description={
            scope.authorizationConfirmed
              ? 'Confirmed. This cannot be withdrawn here.'
              : 'Until this is confirmed, no scan can be queued against this target.'
          }
        />
      </div>

      {error ? <InlineError message={error} /> : null}

      <div className="flex items-center justify-end gap-3 border-t border-border-base pt-4">
        <p className="mr-auto text-xs text-fg-subtle">
          {dirty ? 'Unsaved changes.' : 'Scope matches the saved record.'}
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            setAllowed(toText(scope.allowedPaths))
            setExcluded(toText(scope.excludedPaths))
            setAllowedDomains(toText(scope.allowedDomains))
            setExcludedDomains(toText(scope.excludedDomains))
            setNote(scope.authorizationNote)
            setConfirmed(scope.authorizationConfirmed)
            setError(null)
          }}
          disabled={!dirty || mutation.isPending}
        >
          Revert
        </Button>
        <Button
          variant="primary"
          leadingIcon={<Save className="size-4" />}
          loading={mutation.isPending}
          disabled={!dirty}
          onClick={() => mutation.mutate()}
        >
          Save scope
        </Button>
      </div>
    </div>
  )
}
