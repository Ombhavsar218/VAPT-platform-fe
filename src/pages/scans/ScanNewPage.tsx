import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  CircleAlert,
  Clock,
  FlaskConical,
  Gauge,
  Globe,
  ListChecks,
  Lock,
  Play,
  ServerCog,
  ShieldCheck,
} from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card, CardHeader } from '@/components/common/Card'
import { Checkbox } from '@/components/common/Form'
import { PageHeader } from '@/components/common/PageHeader'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { queryKeys } from '@/services/queryKeys'
import { projectService } from '@/services/projects'
import { referenceService, targetService, type TargetDetail } from '@/services/targets'
import { estimateScan, scanService, type ScanEstimate } from '@/services/scans'
import { ApiError } from '@/services/transport'
import { SIMULATION_SPEED } from '@/services/scanSimulation'
import type { ScanProfile, ScanProfileId, ScannerModule } from '@/types'
import { ENVIRONMENT_META } from '@/utils/severity'
import { cn } from '@/utils/cn'
import { formatDate, formatElapsed, formatNumber } from '@/utils/format'

/**
 * Scan configuration.
 *
 * Six steps, in the order an engagement actually goes: what is in scope, what
 * may be tested, how hard, under whose authority, which checks, then a review
 * that has to state the cost before anything is sent at a customer.
 *
 * The wizard deliberately does not hold its state in a URL or a query cache.
 * A half-configured scan is not a resource anyone can link to, and losing it to
 * a refresh mid-step is cheap; a started scan is a real record, which is why the
 * review step is the only place a write happens.
 */

const STEP_ORDER = [
  'project',
  'target',
  'profile',
  'scope',
  'modules',
  'review',
] as const

type StepId = (typeof STEP_ORDER)[number]

const STEPS: Record<StepId, { label: string; hint: string }> = {
  project: { label: 'Project', hint: 'Which engagement this run belongs to' },
  target: { label: 'Target', hint: 'What may be tested' },
  profile: { label: 'Profile', hint: 'How hard to push' },
  scope: { label: 'Authorisation', hint: 'Under whose authority' },
  modules: { label: 'Checks', hint: 'Which modules run' },
  review: { label: 'Review', hint: 'Confirm and start' },
}

export function ScanNewPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [rawStepIndex, setRawStepIndex] = useState(0)
  const [projectId, setProjectId] = useState(searchParams.get('project') ?? '')
  const [targetId, setTargetId] = useState('')
  const [profileId, setProfileId] = useState<ScanProfileId | ''>('')
  const [moduleIds, setModuleIds] = useState<string[]>([])
  const [authorised, setAuthorised] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const projectsQuery = useQuery({
    queryKey: queryKeys.reference.projects(),
    queryFn: () => projectService.options(),
    staleTime: 5 * 60_000,
  })

  const profilesQuery = useQuery({
    queryKey: queryKeys.reference.scanProfiles(),
    queryFn: () => referenceService.scanProfiles(),
    staleTime: 60 * 60_000,
  })

  const modulesQuery = useQuery({
    queryKey: queryKeys.reference.modules(),
    queryFn: () => referenceService.modules(),
    staleTime: 60 * 60_000,
  })

  const targetsQuery = useQuery({
    queryKey: queryKeys.scans.scannableTargets(projectId || null),
    queryFn: () => scanService.scannableTargets(projectId || undefined),
    enabled: projectId !== '',
  })

  const targetQuery = useQuery({
    queryKey: queryKeys.targets.detail(targetId),
    queryFn: () => targetService.detail(targetId),
    enabled: targetId !== '',
  })

  const profile: ScanProfile | undefined = useMemo(
    () => profilesQuery.data?.find((entry) => entry.id === profileId),
    [profilesQuery.data, profileId],
  )

  const modules: ScannerModule[] = useMemo(() => modulesQuery.data ?? [], [modulesQuery.data])

  const estimate = useMemo(() => {
    if (!profile || !targetQuery.data || moduleIds.length === 0) return null
    return estimateScan({
      profile,
      target: targetQuery.data,
      modules,
      moduleIds,
      endpointCount: targetQuery.data.endpointCount,
      technologyCount: targetQuery.data.technologies.length,
    })
  }, [profile, targetQuery.data, moduleIds, modules])

  const startMutation = useMutation({
    mutationFn: () =>
      scanService.start({
        projectId,
        targetId,
        profileId: profileId as ScanProfileId,
        moduleIds,
        initiatedBy: user?.id ?? 'usr-001',
      }),
    onSuccess: (scan) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scans.root })
      toast.success(
        `Scan ${scan.id} queued`,
        `The run starts as soon as a worker is free. Estimated ${formatElapsed(
          Math.round((profile?.estimatedMinutes ?? 0) * 60),
        )} of scanner time.`,
      )
      navigate(`/scans/${scan.id}`)
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        toast.error('This scan cannot be started yet', error.message)
        // Field errors belong to a specific step; send the operator back to it.
        if (error.fields.targetId) setRawStepIndex(1)
        else if (error.fields.profileId || error.fields.moduleIds) setRawStepIndex(2)
        return
      }
      toast.error('Could not start the scan', 'Something went wrong. Please try again.')
    },
  })

  /* ------------------------------------------------------------------ steps */

  const stepIndex = Math.min(rawStepIndex, STEP_ORDER.length - 1)
  const step = STEPS[STEP_ORDER[stepIndex] ?? 'project']
  const lastStep = stepIndex === STEP_ORDER.length - 1

  const selectedTarget = targetsQuery.data?.find((entry) => entry.id === targetId)

  const canAdvance = ((): boolean => {
    switch (stepIndex) {
      case 0:
        return projectId !== ''
      case 1:
        return targetId !== '' && selectedTarget?.authorised === true
      case 2:
        return profileId !== ''
      case 3:
        return authorised && targetQuery.data?.scope.authorizationConfirmed === true
      case 4:
        return moduleIds.length > 0
      default:
        return true
    }
  })()

  function selectProfile(next: ScanProfile) {
    setProfileId(next.id)
    setErrors((current) => ({ ...current, profileId: '' }))
    // A profile carries a default module set; honour it as the starting point
    // rather than leaving the operator with an empty checkbox list.
    setModuleIds(next.moduleIds.filter((id) => modules.some((module) => module.id === id)))
  }

  function toggleModule(moduleId: string) {
    setModuleIds((current) =>
      current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId],
    )
    setErrors((current) => ({ ...current, moduleIds: '' }))
  }

  function goNext() {
    if (lastStep) {
      startMutation.mutate()
      return
    }
    setRawStepIndex((index) => index + 1)
  }

  function goBack() {
    setRawStepIndex((index) => Math.max(0, index - 1))
  }

  /* ------------------------------------------------------------------ render */

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="New scan"
        description="Configure a run. Nothing is sent at a target until the review step."
        actions={
          <Button variant="ghost" onClick={() => navigate('/scans')}>
            Cancel
          </Button>
        }
      />

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STEP_ORDER.map((id, index) => {
          const state = index === stepIndex ? 'current' : index < stepIndex ? 'done' : 'pending'
          return (
            <li key={id}>
              <button
                type="button"
                // Completed steps stay clickable so an operator can go back
                // without losing what they already chose.
                disabled={index > stepIndex}
                onClick={() => setRawStepIndex(index)}
                className={cn(
                  'w-full rounded-card border px-3 py-2.5 text-left transition-colors',
                  state === 'current' && 'border-accent bg-accent-soft',
                  state === 'done' && 'border-border-base bg-surface hover:border-border-strong',
                  state === 'pending' && 'border-border-base bg-surface opacity-60',
                  index > stepIndex && 'cursor-default',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                      state === 'current' && 'border-accent bg-accent text-accent-fg',
                      state === 'done' && 'border-success bg-success text-white',
                      state === 'pending' && 'border-border-strong text-fg-subtle',
                    )}
                  >
                    {state === 'done' ? <Check className="size-2.5" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[13px] font-medium',
                      state === 'current' ? 'text-fg' : 'text-fg-muted',
                    )}
                  >
                    {STEPS[id].label}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <Card>
        <CardHeader
          title={`Step ${stepIndex + 1} of ${STEP_ORDER.length} · ${step.label}`}
          description={step.hint}
        />

        <div className="mt-5">
          {stepIndex === 0 ? (
            <ProjectStep
              projects={projectsQuery.data ?? []}
              value={projectId}
              onChange={setProjectId}
              error={errors.projectId}
              loading={projectsQuery.isPending}
            />
          ) : null}

          {stepIndex === 1 ? (
            <TargetStep
              targets={targetsQuery.data ?? []}
              value={targetId}
              onChange={setTargetId}
              error={errors.targetId}
              loading={targetsQuery.isPending}
            />
          ) : null}

          {stepIndex === 2 ? (
            <ProfileStep
              profiles={profilesQuery.data ?? []}
              value={profileId}
              onSelect={selectProfile}
              error={errors.profileId}
            />
          ) : null}

          {stepIndex === 3 ? (
            <ScopeStep
              target={targetQuery.data}
              checked={authorised}
              onChange={setAuthorised}
              error={errors.targetId}
            />
          ) : null}

          {stepIndex === 4 ? (
            <ModuleStep
              modules={modules}
              profile={profile}
              selected={moduleIds}
              onToggle={toggleModule}
              error={errors.moduleIds}
            />
          ) : null}

          {stepIndex === 5 ? (
            <ReviewStep
              projectName={
                projectsQuery.data?.find((entry) => entry.id === projectId)?.name ?? '—'
              }
              target={targetQuery.data}
              profile={profile}
              modules={modules}
              moduleIds={moduleIds}
              estimate={estimate}
            />
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-base pt-4">
          <Button
            variant="secondary"
            leadingIcon={<ArrowLeft className="size-4" />}
            disabled={stepIndex === 0 || startMutation.isPending}
            onClick={goBack}
          >
            Back
          </Button>

          <div className="flex items-center gap-3">
            {!lastStep && !canAdvance ? (
              <p className="hidden text-[13px] text-fg-subtle sm:block">{advanceHint(stepIndex)}</p>
            ) : null}
            <Button
              variant={lastStep ? 'primary' : 'secondary'}
              disabled={!canAdvance}
              loading={startMutation.isPending}
              trailingIcon={lastStep ? undefined : <ArrowRight className="size-4" />}
              leadingIcon={lastStep ? <Play className="size-4" /> : undefined}
              onClick={goNext}
            >
              {lastStep ? 'Start scan' : 'Continue'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function advanceHint(stepIndex: number): string {
  switch (stepIndex) {
    case 0:
      return 'Choose a project to continue'
    case 1:
      return 'Choose an authorised target'
    case 2:
      return 'Choose a profile'
    case 3:
      return 'Confirm the authorisation record'
    case 4:
      return 'Select at least one check'
    default:
      return ''
  }
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

function StepChoice({
  selected,
  onSelect,
  disabled,
  children,
}: {
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        'block cursor-pointer rounded-card border p-4 transition-colors',
        selected
          ? 'border-accent bg-accent-soft'
          : 'border-border-base bg-surface hover:border-border-strong',
        disabled && 'cursor-not-allowed opacity-50 hover:border-border-base',
      )}
    >
      <input
        type="radio"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      {children}
    </label>
  )
}

function ProjectStep({
  projects,
  value,
  onChange,
  error,
  loading,
}: {
  projects: Array<{ id: string; name: string; client: string; status: string; assessmentType: string }>
  value: string
  onChange: (id: string) => void
  error?: string
  loading: boolean
}) {
  if (loading) return <p className="text-[13px] text-fg-subtle">Loading projects…</p>
  if (projects.length === 0) {
    return (
      <p className="text-[13px] text-fg-muted">
        No projects exist yet, so there is nothing to scope a scan to.
      </p>
    )
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Project</legend>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {projects.map((project) => (
          <StepChoice
            key={project.id}
            selected={value === project.id}
            onSelect={() => onChange(project.id)}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-fg">{project.name}</span>
                <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                  {project.client} · {project.assessmentType.replace(/_/g, ' ')}
                </span>
              </span>
              {value === project.id ? (
                <BadgeCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
              ) : null}
            </span>
          </StepChoice>
        ))}
      </div>
      {error ? <FieldError message={error} /> : null}
    </fieldset>
  )
}

function TargetStep({
  targets,
  value,
  onChange,
  error,
  loading,
}: {
  targets: Array<{
    id: string
    name: string
    baseUrl: string
    environment: string
    authorised: boolean
    inFlight: boolean
    endpointCount: number
  }>
  value: string
  onChange: (id: string) => void
  error?: string
  loading: boolean
}) {
  if (loading) return <p className="text-[13px] text-fg-subtle">Loading targets…</p>
  if (targets.length === 0) {
    return (
      <p className="text-[13px] text-fg-muted">
        This project has no targets. Add one and record its written authorisation first.
      </p>
    )
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Target</legend>
      <div className="space-y-2.5">
        {targets.map((target) => {
          const blocked = !target.authorised
          return (
            <StepChoice
              key={target.id}
              selected={value === target.id}
              onSelect={() => onChange(target.id)}
              disabled={blocked}
            >
              <span className="flex flex-wrap items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">{target.name}</span>
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        target.environment === 'production'
                          ? 'border-danger/35 bg-danger/12 text-danger'
                          : 'border-border-base bg-surface-2 text-fg-subtle',
                      )}
                    >
                      {target.environment}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-fg-subtle">
                    {target.baseUrl}
                  </span>
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    {formatNumber(target.endpointCount)} endpoints on file
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  {blocked ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-danger">
                      <Ban className="size-3.5" aria-hidden="true" />
                      No authorisation
                    </span>
                  ) : target.inFlight ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-warning">
                      <Clock className="size-3.5" aria-hidden="true" />
                      Run in progress
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      Authorised
                    </span>
                  )}
                </span>
              </span>
            </StepChoice>
          )
        })}
      </div>
      {error ? <FieldError message={error} /> : null}
    </fieldset>
  )
}

function ProfileStep({
  profiles,
  value,
  onSelect,
  error,
}: {
  profiles: ScanProfile[]
  value: string
  onSelect: (profile: ScanProfile) => void
  error?: string
}) {
  if (profiles.length === 0) {
    return <p className="text-[13px] text-fg-subtle">Loading profiles…</p>
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Scan profile</legend>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {profiles.map((profile) => (
          <StepChoice
            key={profile.id}
            selected={value === profile.id}
            onSelect={() => onSelect(profile)}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-fg">{profile.name}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-fg-subtle">
                  {profile.description}
                </span>
              </span>
              {value === profile.id ? (
                <BadgeCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
              ) : null}
            </span>

            <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                ~{profile.estimatedMinutes} min
              </span>
              <span className="inline-flex items-center gap-1 capitalize">
                <Gauge className="size-3" aria-hidden="true" />
                {profile.intensity}
              </span>
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3" aria-hidden="true" />
                {profile.moduleIds.length} checks
              </span>
            </span>

            <span className="mt-2 flex flex-wrap gap-1.5">
              {profile.capabilities.slice(0, 4).map((capability) => (
                <span
                  key={capability}
                  className="rounded border border-border-base bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted"
                >
                  {capability}
                </span>
              ))}
              {profile.capabilities.length > 4 ? (
                <span className="text-[10px] text-fg-subtle">
                  +{profile.capabilities.length - 4} more
                </span>
              ) : null}
            </span>
          </StepChoice>
        ))}
      </div>
      {error ? <FieldError message={error} /> : null}
    </fieldset>
  )
}

function ScopeStep({
  target,
  checked,
  onChange,
  error,
}: {
  target: TargetDetail | undefined
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
}) {
  if (!target) {
    return <p className="text-[13px] text-fg-subtle">Choose a target first.</p>
  }

  const { scope } = target

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-card border p-4',
          scope.authorizationConfirmed
            ? 'border-success/35 bg-success/10'
            : 'border-danger/35 bg-danger/8',
        )}
      >
        <p className="flex items-start gap-2.5">
          {scope.authorizationConfirmed ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <Lock className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span
              className={cn(
                'block text-[13px] font-semibold',
                scope.authorizationConfirmed ? 'text-success' : 'text-danger',
              )}
            >
              {scope.authorizationConfirmed
                ? 'Written authorisation on file'
                : 'No written authorisation on file'}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-fg-muted">
              {scope.authorizationNote || 'No authorisation note has been recorded against this target.'}
            </span>
          </span>
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ScopeList
          title="In scope"
          icon={<Globe className="size-3.5" aria-hidden="true" />}
          items={scope.allowedDomains}
          empty="No explicit domain allow-list; the target host is used."
        />
        <ScopeList
          title="Never touch"
          icon={<Ban className="size-3.5" aria-hidden="true" />}
          items={scope.excludedDomains}
          empty="No domains excluded."
        />
        <ScopeList
          title="Allowed paths"
          icon={<ServerCog className="size-3.5" aria-hidden="true" />}
          items={scope.allowedPaths}
          empty="Whole application is in scope."
        />
        <ScopeList
          title="Excluded paths"
          icon={<Ban className="size-3.5" aria-hidden="true" />}
          items={scope.excludedPaths}
          empty="No paths excluded."
        />
      </dl>

      <div className="rounded-card border border-border-base bg-surface-2 p-4">
        <Checkbox
          id="confirm-authorisation"
          checked={checked}
          disabled={!scope.authorizationConfirmed}
          onChange={(event) => onChange(event.target.checked)}
          label="I confirm this run is covered by the recorded written authorisation"
          description="The scanner refuses to run without this. It is logged against the engagement on submit."
        />
        {error ? <FieldError message={error} className="mt-2.5" /> : null}
      </div>
    </div>
  )
}

function ScopeList({
  title,
  icon,
  items,
  empty,
}: {
  title: string
  icon: ReactNode
  items: string[]
  empty: string
}) {
  return (
    <div className="rounded-card border border-border-base bg-surface-2 p-3.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        {icon}
        {title}
      </dt>
      <dd className="mt-2 space-y-1">
        {items.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">{empty}</p>
        ) : (
          items.map((item) => (
            <p key={item} className="truncate font-mono text-xs text-fg-muted" title={item}>
              {item}
            </p>
          ))
        )}
      </dd>
    </div>
  )
}

function ModuleStep({
  modules,
  profile,
  selected,
  onToggle,
  error,
}: {
  modules: ScannerModule[]
  profile: ScanProfile | undefined
  selected: string[]
  onToggle: (moduleId: string) => void
  error?: string
}) {
  if (!profile) return <p className="text-[13px] text-fg-subtle">Choose a profile first.</p>

  const available = modules.filter((module) => profile.moduleIds.includes(module.id))
  const byCategory = new Map<string, ScannerModule[]>()
  for (const module of available) {
    const bucket = byCategory.get(module.category)
    if (bucket) bucket.push(module)
    else byCategory.set(module.category, [module])
  }

  const selectedTests = available
    .filter((module) => selected.includes(module.id))
    .reduce((sum, module) => sum + module.testCount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          {selected.length} of {available.length} checks selected ·{' '}
          <span className="tabular-nums">{formatNumber(selectedTests)}</span> tests queued
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleAll(available, selected, onToggle)}
          >
            {selected.length === available.length ? 'Clear all' : 'Select all'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {[...byCategory.entries()].map(([category, categoryModules]) => (
          <fieldset key={category} className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
              {category}
            </legend>
            <div className="space-y-2">
              {categoryModules.map((module) => (
                <label
                  key={module.id}
                  className={cn(
                    'block cursor-pointer rounded-card border p-3.5 transition-colors',
                    selected.includes(module.id)
                      ? 'border-accent bg-accent-soft'
                      : 'border-border-base bg-surface hover:border-border-strong',
                  )}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(module.id)}
                      onChange={() => onToggle(module.id)}
                      className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-fg">{module.name}</span>
                        {module.status === 'experimental' ? (
                          <span className="inline-flex items-center gap-1 rounded border border-warning/35 bg-warning/12 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                            <FlaskConical className="size-2.5" aria-hidden="true" />
                            Experimental
                          </span>
                        ) : null}
                        <span className="font-mono text-[10px] text-fg-subtle">v{module.version}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-fg-subtle">
                        {module.description}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
                        <span className="tabular-nums">{formatNumber(module.testCount)} tests</span>
                        {module.owaspCategories.map((category_) => (
                          <span key={category_} className="text-fg-subtle">
                            {category_}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {error ? <FieldError message={error} /> : null}
    </div>
  )
}

function onToggleAll(
  available: ScannerModule[],
  selected: string[],
  onToggle: (moduleId: string) => void,
) {
  const allSelected = available.every((module) => selected.includes(module.id))
  for (const module of available) {
    if (allSelected && selected.includes(module.id)) onToggle(module.id)
    else if (!allSelected && !selected.includes(module.id)) onToggle(module.id)
  }
}

function ReviewStep({
  projectName,
  target,
  profile,
  modules,
  moduleIds,
  estimate,
}: {
  projectName: string
  target: TargetDetail | undefined
  profile: ScanProfile | undefined
  modules: ScannerModule[]
  moduleIds: string[]
  estimate: ScanEstimate | null
}) {
  if (!target || !profile) {
    return <p className="text-[13px] text-fg-subtle">The draft is incomplete.</p>
  }

  const chosen = modules.filter((module) => moduleIds.includes(module.id))

  return (
    <div className="space-y-4">
      <dl className="divide-y divide-[var(--border)] rounded-card border border-border-base bg-surface-2 px-4">
        <ReviewRow label="Project" value={projectName} />
        <ReviewRow
          label="Target"
          value={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px]">{target.baseUrl}</span>
              <span className="text-[11px] text-fg-subtle">
                {ENVIRONMENT_META[target.environment]?.label ?? target.environment}
              </span>
            </span>
          }
        />
        <ReviewRow
          label="Profile"
          value={
            <span>
              {profile.name}
              <span className="ml-2 text-[11px] capitalize text-fg-subtle">{profile.intensity}</span>
            </span>
          }
        />
        <ReviewRow
          label="Checks"
          value={
            <span>
              {moduleIds.length} of {profile.moduleIds.length} modules
              <span className="ml-2 text-[11px] text-fg-subtle">
                {chosen
                  .slice(0, 6)
                  .map((module) => module.name)
                  .join(', ')}
                {chosen.length > 6 ? ` +${chosen.length - 6} more` : ''}
              </span>
            </span>
          }
        />
        <ReviewRow
          label="Authorisation"
          value={
            <span className="inline-flex items-center gap-1.5 text-success">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {target.scope.authorizationNote || 'Recorded on the target'}
            </span>
          }
        />
        <ReviewRow label="Last scanned" value={formatDate(target.lastScanAt)} />
      </dl>

      {estimate ? (
        <div className="rounded-card border border-accent-border bg-accent-soft p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <CircleAlert className="size-4 text-accent" aria-hidden="true" />
            What this run will cost
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReviewStat label="Scanner time" value={formatElapsed(estimate.estimatedSeconds)} />
            <ReviewStat
              label={`Real time (${SIMULATION_SPEED}× demo)`}
              value={formatElapsed(estimate.realSeconds)}
            />
            <ReviewStat label="Requests" value={formatNumber(estimate.requestCount)} />
            <ReviewStat label="Tests" value={formatNumber(estimate.testCount)} />
          </dl>
          {estimate.notes.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {estimate.notes.map((note) => (
                <li key={note} className="flex gap-2 text-[13px] leading-relaxed text-fg-muted">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  {note}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-[13px] leading-relaxed text-fg-muted">
        Starting the run queues it behind any other job on the target and records a{' '}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-fg">
          scan.started
        </code>{' '}
        audit entry. Nothing is sent at the target until a worker picks the job up.
      </p>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] text-fg sm:col-span-2">{value}</dd>
    </div>
  )
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-fg">{value}</dd>
    </div>
  )
}

function FieldError({ message, className }: { message: string; className?: string }) {
  return (
    <p role="alert" className={cn('flex items-center gap-1.5 text-[13px] text-danger', className)}>
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}
