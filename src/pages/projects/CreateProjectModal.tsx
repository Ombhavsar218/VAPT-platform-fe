import { useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/common/Button'
import { Field, Select, TextArea, TextInput } from '@/components/common/Form'
import { Modal } from '@/components/common/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { projectService, userService } from '@/services/projects'
import { queryKeys } from '@/services/queryKeys'
import { ApiError } from '@/services/transport'
import { ASSESSMENT_TYPES, PROJECT_STATUSES, type AssessmentType, type ProjectStatus } from '@/types'
import { ASSESSMENT_TYPE_LABELS, PROJECT_STATUS_META } from '@/utils/severity'

interface FormState {
  name: string
  client: string
  description: string
  assessmentType: AssessmentType
  status: ProjectStatus
  startDate: string
  endDate: string
  owner: string
}

const DEFAULT_WINDOW_DAYS = 21

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Owner defaults to the signed-in analyst; the window runs three weeks. */
function initialForm(ownerId?: string): FormState {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + DEFAULT_WINDOW_DAYS)

  return {
    name: '',
    client: '',
    description: '',
    assessmentType: 'web_application',
    status: 'planning',
    startDate: isoDate(start),
    endDate: isoDate(end),
    owner: ownerId ?? '',
  }
}

export interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  onCreated?: (projectId: string) => void
}

/**
 * Create-project dialog.
 *
 * The form body lives in a child that only mounts while the dialog is open, so
 * the draft resets by unmounting instead of being patched by an effect after the
 * fact. Field-level messages come back from the service as a DRF-style `fields`
 * object and are rendered against the inputs.
 */
export function CreateProjectModal({ open, onClose, onCreated }: CreateProjectModalProps) {
  if (!open) return null
  return <CreateProjectDialog onClose={onClose} onCreated={onCreated} />
}

function CreateProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated?: (projectId: string) => void
}) {
  const ids = {
    name: useId(),
    client: useId(),
    description: useId(),
    assessmentType: useId(),
    status: useId(),
    startDate: useId(),
    endDate: useId(),
    owner: useId(),
  }

  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [form, setForm] = useState<FormState>(() => initialForm(user?.id))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const usersQuery = useQuery({
    queryKey: queryKeys.reference.users(),
    queryFn: () => userService.list(),
    staleTime: 5 * 60_000,
  })

  const owners = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((member) => member.role !== 'viewer')
        .map((member) => ({ value: member.id, label: `${member.name} — ${member.role.replace('_', ' ')}` })),
    [usersQuery.data],
  )

  const mutation = useMutation({
    mutationFn: projectService.create,
    onSuccess: (project) => {
      toast.success('Project created', `${project.name} is ready for targets.`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.root })
      void queryClient.invalidateQueries({ queryKey: queryKeys.counts() })
      onCreated?.(project.id)
      onClose()
      navigate(`/projects/${project.id}`)
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        toast.error('Could not create the project', error.message)
        return
      }
      toast.error('Could not create the project', 'Something went wrong. Please try again.')
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
    mutation.mutate({ ...form })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New project"
      description="An engagement groups targets, scans, findings and reports for one client scope."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={mutation.isPending}>
            Create project
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Project name" htmlFor={ids.name} required error={errors.name}>
            <TextInput
              id={ids.name}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Northwind Retail — Storefront Reassessment"
              invalid={Boolean(errors.name)}
              autoComplete="off"
            />
          </Field>

          <Field label="Client" htmlFor={ids.client} required error={errors.client}>
            <TextInput
              id={ids.client}
              value={form.client}
              onChange={(event) => update('client', event.target.value)}
              placeholder="Northwind Retail"
              invalid={Boolean(errors.client)}
              autoComplete="organization"
            />
          </Field>
        </div>

        <Field
          label="Description"
          htmlFor={ids.description}
          hint="Scope intent, deliverables and any constraint the analyst should know about."
        >
          <TextArea
            id={ids.description}
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            rows={3}
            placeholder="Re-test of the storefront after the Q3 release, focused on checkout and account management."
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Assessment type" htmlFor={ids.assessmentType}>
            <Select
              id={ids.assessmentType}
              value={form.assessmentType}
              onChange={(event) => update('assessmentType', event.target.value as AssessmentType)}
              options={ASSESSMENT_TYPES.map((type) => ({
                value: type,
                label: ASSESSMENT_TYPE_LABELS[type],
              }))}
            />
          </Field>

          <Field label="Status" htmlFor={ids.status}>
            <Select
              id={ids.status}
              value={form.status}
              onChange={(event) => update('status', event.target.value as ProjectStatus)}
              options={PROJECT_STATUSES.map((status) => ({
                value: status,
                label: PROJECT_STATUS_META[status].label,
              }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor={ids.startDate} error={errors.startDate}>
            <TextInput
              id={ids.startDate}
              type="date"
              value={form.startDate}
              onChange={(event) => update('startDate', event.target.value)}
              invalid={Boolean(errors.startDate)}
            />
          </Field>

          <Field label="End date" htmlFor={ids.endDate} error={errors.endDate}>
            <TextInput
              id={ids.endDate}
              type="date"
              value={form.endDate}
              onChange={(event) => update('endDate', event.target.value)}
              invalid={Boolean(errors.endDate)}
            />
          </Field>
        </div>

        <Field
          label="Owner"
          htmlFor={ids.owner}
          required
          hint="The lead analyst accountable for this engagement."
          error={errors.owner}
        >
          <Select
            id={ids.owner}
            value={form.owner}
            onChange={(event) => update('owner', event.target.value)}
            options={owners}
            placeholder="Select an owner"
            invalid={Boolean(errors.owner)}
          />
        </Field>
      </form>
    </Modal>
  )
}
