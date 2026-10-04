import { useId, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { Button } from '@/components/common/Button'
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/common/Form'
import { Modal } from '@/components/common/Modal'
import { useToast } from '@/hooks/useToast'
import { projectService } from '@/services/projects'
import { queryKeys } from '@/services/queryKeys'
import { targetService } from '@/services/targets'
import { ApiError } from '@/services/transport'
import { ENVIRONMENTS, TARGET_TYPES, type Environment, type TargetType } from '@/types'
import { ENVIRONMENT_META } from '@/utils/severity'
import { hostnameOf } from '@/utils/format'

interface FormState {
  name: string
  baseUrl: string
  type: TargetType
  environment: Environment
  projectId: string
  description: string
  tags: string
  allowedPaths: string
  excludedPaths: string
  authorizationNote: string
  authorizationConfirmed: boolean
}

function initialForm(defaultProjectId?: string): FormState {
  return {
    name: '',
    baseUrl: '',
    type: 'web_application',
    environment: 'production',
    projectId: defaultProjectId ?? '',
    description: '',
    tags: '',
    allowedPaths: '/',
    excludedPaths: '',
    authorizationNote: '',
    authorizationConfirmed: false,
  }
}

const TYPE_LABELS: Record<TargetType, string> = {
  web_application: 'Web application',
  api: 'API',
  web_service: 'Web service',
}

/** Scope paths are entered one per line; commas and surrounding slivers are tolerated. */
function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export interface AddTargetModalProps {
  open: boolean
  onClose: () => void
  /** Pass the register's `project` filter to pre-select an engagement. */
  defaultProjectId?: string
  onCreated?: (targetId: string) => void
}

/**
 * Add-target dialog.
 *
 * Scope and written authorisation are collected in the same step as the URL,
 * because a target without an explicit authorisation record is not a valid scan
 * input — the service refuses it rather than letting it be queued by accident.
 */
export function AddTargetModal({ open, onClose, defaultProjectId, onCreated }: AddTargetModalProps) {
  if (!open) return null
  return <AddTargetDialog onClose={onClose} defaultProjectId={defaultProjectId} onCreated={onCreated} />
}

function AddTargetDialog({
  onClose,
  defaultProjectId,
  onCreated,
}: {
  onClose: () => void
  defaultProjectId?: string
  onCreated?: (targetId: string) => void
}) {
  const ids = {
    name: useId(),
    baseUrl: useId(),
    type: useId(),
    environment: useId(),
    projectId: useId(),
    description: useId(),
    tags: useId(),
    allowedPaths: useId(),
    excludedPaths: useId(),
    authorizationNote: useId(),
    authorizationConfirmed: useId(),
  }

  const toast = useToast()
  // The body mounts only while the dialog is open, so the draft starts clean
  // without an effect writing to state after the fact.
  const [form, setForm] = useState<FormState>(() => initialForm(defaultProjectId))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const projectsQuery = useQuery({
    queryKey: queryKeys.reference.projects(),
    queryFn: () => projectService.options(),
    staleTime: 5 * 60_000,
  })

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned — no engagement yet' },
      ...(projectsQuery.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.name} (${project.client})`,
      })),
    ],
    [projectsQuery.data],
  )

  const allowedCount = useMemo(() => parseList(form.allowedPaths).length, [form.allowedPaths])
  const excludedCount = useMemo(() => parseList(form.excludedPaths).length, [form.excludedPaths])
  const host = useMemo(() => {
    const trimmed = form.baseUrl.trim()
    if (!trimmed) return null
    try {
      return hostnameOf(trimmed)
    } catch {
      return null
    }
  }, [form.baseUrl])

  const mutation = useMutation({
    mutationFn: targetService.create,
    onSuccess: (target) => {
      toast.success('Target added', `${target.name} is in scope with ${parseList(form.allowedPaths).length} allowed path(s).`)
      onCreated?.(target.id)
      onClose()
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        toast.error('Could not add the target', error.message)
        return
      }
      toast.error('Could not add the target', 'Something went wrong. Please try again.')
    },
  })

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setErrors({})
    mutation.mutate({
      name: form.name,
      baseUrl: form.baseUrl,
      type: form.type,
      environment: form.environment,
      projectId: form.projectId || null,
      description: form.description,
      tags: parseList(form.tags),
      allowedPaths: parseList(form.allowedPaths),
      excludedPaths: parseList(form.excludedPaths),
      authorizationConfirmed: form.authorizationConfirmed,
      authorizationNote: form.authorizationNote,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add target"
      description="Register an authorised asset and record its scope. Only confirmed targets can be scanned."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={mutation.isPending}
            disabled={!form.authorizationConfirmed}
          >
            Add target
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Target name" htmlFor={ids.name} required error={errors.name}>
              <TextInput
                id={ids.name}
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Storefront — checkout"
                invalid={Boolean(errors.name)}
                autoComplete="off"
              />
            </Field>

            <Field
              label="Base URL"
              htmlFor={ids.baseUrl}
              required
              error={errors.baseUrl}
              hint={host ? `Host recorded as ${host}.` : 'Include the scheme, e.g. https://shop.example.com.'}
            >
              <TextInput
                id={ids.baseUrl}
                value={form.baseUrl}
                onChange={(event) => update('baseUrl', event.target.value)}
                placeholder="https://shop.example.com"
                invalid={Boolean(errors.baseUrl)}
                autoComplete="url"
                inputMode="url"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Type" htmlFor={ids.type}>
              <Select
                id={ids.type}
                value={form.type}
                onChange={(event) => update('type', event.target.value as TargetType)}
                options={TARGET_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }))}
              />
            </Field>

            <Field
              label="Environment"
              htmlFor={ids.environment}
              hint={
                form.environment === 'production'
                  ? 'Production assets are treated as high consequence.'
                  : undefined
              }
            >
              <Select
                id={ids.environment}
                value={form.environment}
                onChange={(event) => update('environment', event.target.value as Environment)}
                options={ENVIRONMENTS.map((environment) => ({
                  value: environment,
                  label: ENVIRONMENT_META[environment].label,
                }))}
              />
            </Field>

            <Field label="Engagement" htmlFor={ids.projectId}>
              <Select
                id={ids.projectId}
                value={form.projectId}
                onChange={(event) => update('projectId', event.target.value)}
                options={projectOptions}
              />
            </Field>
          </div>

          <Field
            label="Description"
            htmlFor={ids.description}
            hint="What this system is, who owns it, and anything the scanner should know."
          >
            <TextArea
              id={ids.description}
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
              rows={2}
              placeholder="Customer-facing storefront. Production traffic is rate limited; avoid sustained high-volume crawling."
            />
          </Field>

          <Field
            label="Tags"
            htmlFor={ids.tags}
            hint="Optional. Comma separated, e.g. pci, customer-facing, third-party."
          >
            <TextInput
              id={ids.tags}
              value={form.tags}
              onChange={(event) => update('tags', event.target.value)}
              placeholder="pci, customer-facing"
            />
          </Field>
        </section>

        <section className="space-y-4 border-t border-border-base pt-5">
          <div>
            <h3 className="text-[13px] font-semibold text-fg">Scope</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              One path per line. Paths are matched as prefixes, so <code className="font-mono">/api</code>{' '}
              covers every API route beneath it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Allowed paths"
              htmlFor={ids.allowedPaths}
              required
              error={errors.allowedPaths}
              hint={`${allowedCount} path${allowedCount === 1 ? '' : 's'} in scope.`}
            >
              <TextArea
                id={ids.allowedPaths}
                value={form.allowedPaths}
                onChange={(event) => update('allowedPaths', event.target.value)}
                rows={4}
                className="font-mono text-[13px]"
                invalid={Boolean(errors.allowedPaths)}
              />
            </Field>

            <Field
              label="Excluded paths"
              htmlFor={ids.excludedPaths}
              hint={`${excludedCount} path${excludedCount === 1 ? '' : 's'} excluded from the crawl.`}
            >
              <TextArea
                id={ids.excludedPaths}
                value={form.excludedPaths}
                onChange={(event) => update('excludedPaths', event.target.value)}
                rows={4}
                className="font-mono text-[13px]"
                placeholder={'/admin\n/logout'}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3 border-t border-border-base pt-5">
          <div>
            <h3 className="text-[13px] font-semibold text-fg">Authorisation</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              Record the written permission that allows testing this asset. The note is kept with the target
              for the duration of the engagement.
            </p>
          </div>

          <Field
            label="Authorisation reference"
            htmlFor={ids.authorizationNote}
            hint="Ticket, contract clause or email reference approving this test window."
          >
            <TextInput
              id={ids.authorizationNote}
              value={form.authorizationNote}
              onChange={(event) => update('authorizationNote', event.target.value)}
              placeholder="SOW-2291 §4.2 — signed 2026-09-14"
            />
          </Field>

          <Checkbox
            id={ids.authorizationConfirmed}
            checked={form.authorizationConfirmed}
            onChange={(event) => update('authorizationConfirmed', event.target.checked)}
            label="I confirm written client authorisation covers testing this target"
            description="Required before any scan can be queued against this asset."
          />
          {errors.authorizationConfirmed ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.authorizationConfirmed}
            </p>
          ) : null}
        </section>
      </form>
    </Modal>
  )
}
