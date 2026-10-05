import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor, Moon, Palette, Sun } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card, CardHeader } from '@/components/common/Card'
import { ErrorState } from '@/components/common/ErrorState'
import { Field, Select, Switch, TextInput } from '@/components/common/Form'
import { PageHeader } from '@/components/common/PageHeader'
import { Spinner } from '@/components/common/Spinner'
import { Tabs } from '@/components/common/Tabs'
import { useAuth } from '@/hooks/useAuth'
import { useTheme, type ThemeMode } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { queryKeys } from '@/services/queryKeys'
import { settingsService, type SettingsData } from '@/services/settings'
import { ApiError } from '@/services/transport'
import type { WorkspaceSettings } from '@/types'
import { formatRelativeTime } from '@/utils/format'

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'scanner', label: 'Scanner defaults' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'workspace', label: 'Workspace' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/**
 * Settings (`/settings`).
 *
 * Six sections that share one screen but not one owner. Profile and appearance
 * belong to the signed-in member and apply immediately; everything else is shared
 * workspace policy that is drafted locally and saved as one audited change. The
 * split drives the whole interaction — the first two save themselves, the rest
 * have an explicit Save and a dirty indicator.
 */
export function SettingsPage() {
  const [section, setSection] = useState<SectionId>('profile')
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.settings.read(),
    queryFn: () => settingsService.read(),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Your profile, how the workspace looks, and the defaults a new scan inherits."
      />

      <Tabs
        items={SECTIONS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={section}
        onChange={(id) => setSection(id as SectionId)}
        showCounts={false}
      />

      {isPending ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-[13px] text-fg-muted">
          <Spinner />
          Loading settings…
        </div>
      ) : null}

      {/*
        Only a genuine failure shows the error card. Keying this on `!data` as
        well would put "Could not load settings" on screen during the first
        render, before the request has had a chance to fail.
      */}
      {isError ? (
        <Card>
          <ErrorState
            title="Could not load settings"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : null}

      {data ? (
        <>
          {section === 'profile' ? <ProfileSection data={data} /> : null}
          {section === 'appearance' ? <AppearanceSection /> : null}
          {section === 'scanner' ? <ScannerSection data={data} /> : null}
          {section === 'notifications' ? <NotificationsSection data={data} /> : null}
          {section === 'security' ? <SecuritySection data={data} /> : null}
          {section === 'workspace' ? <WorkspaceSection data={data} /> : null}
        </>
      ) : null}
    </div>
  )
}

function SectionCard({
  title,
  description,
  children,
  actions,
}: {
  title: string
  description: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <Card flush>
      <div className="border-b border-border-base px-5 py-4">
        <CardHeader title={title} description={description} actions={actions} />
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

function ProfileSection({ data }: { data: SettingsData }) {
  const { user, syncUser } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () => settingsService.updateProfile(user?.id ?? 'usr-001', { name, email }),
    onSuccess: (updated) => {
      setFieldErrors({})
      // The session holds its own copy of the user, so without this the topbar
      // and the next reload would both revert to the values from sign-in.
      syncUser({ name: updated.name, email: updated.email })
      void queryClient.invalidateQueries({ queryKey: queryKeys.reference.users() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.read() })
      toast.success('Profile saved', `You are now ${updated.name}.`)
    },
    onError: (caught) => {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0) {
        setFieldErrors(caught.fields)
        return
      }
      toast.error(
        'Could not save your profile',
        caught instanceof Error ? caught.message : 'Unknown error.',
      )
    },
  })

  const dirty = name !== (user?.name ?? '') || email !== (user?.email ?? '')

  return (
    <SectionCard
      title="Your profile"
      description="How you appear to the rest of the workspace, and on anything you author."
      actions={
        <Button
          variant="primary"
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          Save profile
        </Button>
      }
    >
      <Field label="Name" htmlFor="settings-name" required error={fieldErrors.name}>
        <TextInput
          id="settings-name"
          value={name}
          invalid={Boolean(fieldErrors.name)}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field
        label="Email"
        htmlFor="settings-email"
        required
        error={fieldErrors.email}
        hint="Notifications are delivered to this address."
      >
        <TextInput
          id="settings-email"
          type="email"
          value={email}
          invalid={Boolean(fieldErrors.email)}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <p className="text-[12px] text-fg-subtle">
        Signed in as {user?.role.replace('_', ' ')} in {data.settings.shortName}. Your role and MFA
        enrolment are managed by an admin under{' '}
        <span className="text-fg-muted">Administration → Users</span>.
      </p>
    </SectionCard>
  )
}

/* -------------------------------------------------------------------------- */
/* Appearance                                                                  */
/* -------------------------------------------------------------------------- */

const THEME_OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const

function AppearanceSection() {
  const { mode, resolvedTheme, setMode } = useTheme()

  return (
    <SectionCard
      title="Appearance"
      description="Applies immediately and is remembered on this device."
    >
      <fieldset>
        <legend className="text-[13px] font-medium text-fg">Theme</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = mode === option.id
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(option.id as ThemeMode)}
                className={
                  'inline-flex items-center gap-2 rounded-badge border px-3 py-2 text-[13px] font-medium transition-colors ' +
                  (selected
                    ? 'border-accent bg-accent/10 text-accent-text'
                    : 'border-border-base bg-surface text-fg-muted hover:border-border-strong')
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <p className="flex items-center gap-2 text-[12px] text-fg-subtle">
        <Palette className="size-3.5" aria-hidden="true" />
        Currently rendering in {resolvedTheme} mode{mode === 'system' ? ' (following your OS)' : ''}.
      </p>
    </SectionCard>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared workspace draft                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Wraps the shared sections so they all get the same draft state, dirty tracking
 * and one audited save. Sections edit a copy; nothing reaches the store until
 * Save is pressed.
 */
function useWorkspaceDraft(data: SettingsData) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [draft, setDraft] = useState<WorkspaceSettings>(data.settings)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () => settingsService.updateWorkspace(draft, user?.id ?? 'usr-001'),
    onSuccess: (saved) => {
      setFieldErrors({})
      setDraft(saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.root })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.root })
      toast.success('Settings saved', `Updated by ${user?.name ?? 'you'}.`)
    },
    onError: (caught) => {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0) {
        setFieldErrors(caught.fields)
        return
      }
      toast.error(
        'Could not save settings',
        caught instanceof Error ? caught.message : 'Unknown error.',
      )
    },
  })

  const patch = (mutate: (current: WorkspaceSettings) => WorkspaceSettings) =>
    setDraft((current) => mutate(current))

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings)

  return { draft, patch, save, dirty, fieldErrors, setDraft }
}

function DirtyActions({
  dirty,
  saving,
  onSave,
  onRevert,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onRevert: () => void
}) {
  if (!dirty) {
    return <span className="text-[12px] text-fg-subtle">No unsaved changes</span>
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-[12px] text-warning">Unsaved changes</span>
      <Button variant="ghost" size="sm" onClick={onRevert} disabled={saving}>
        Revert
      </Button>
      <Button variant="primary" size="sm" loading={saving} onClick={onSave}>
        Save
      </Button>
    </span>
  )
}

function ScannerSection({ data }: { data: SettingsData }) {
  const { draft, patch, save, dirty, fieldErrors, setDraft } = useWorkspaceDraft(data)
  const scanner = draft.scanner

  return (
    <SectionCard
      title="Scanner defaults"
      description="What a new scan starts with. Every value can still be overridden per run."
      actions={
        <DirtyActions
          dirty={dirty}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onRevert={() => setDraft(data.settings)}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Scan profile" htmlFor="settings-profile" error={fieldErrors['scanner.profileId']}>
          <Select
            id="settings-profile"
            value={scanner.profileId}
            onChange={(event) =>
              patch((current) => ({
                ...current,
                scanner: {
                  ...current.scanner,
                  profileId: event.target.value as WorkspaceSettings['scanner']['profileId'],
                },
              }))
            }
            options={data.profiles.map((profile) => ({
              value: profile.id,
              label: `${profile.name} (${profile.moduleCount} modules)`,
            }))}
          />
        </Field>
        <Field
          label="Assessment type"
          htmlFor="settings-assessment"
          error={fieldErrors['scanner.assessmentType']}
        >
          <Select
            id="settings-assessment"
            value={scanner.assessmentType}
            onChange={(event) =>
              patch((current) => ({
                ...current,
                scanner: {
                  ...current.scanner,
                  assessmentType: event.target
                    .value as WorkspaceSettings['scanner']['assessmentType'],
                },
              }))
            }
            options={data.assessmentTypes.map((type) => ({ value: type, label: type }))}
          />
        </Field>
      </div>

      <Field
        label="Maximum concurrent runs"
        htmlFor="settings-concurrency"
        error={fieldErrors['scanner.maxConcurrentScans']}
        hint="How many scans the workspace will hold in flight at once."
      >
        <TextInput
          id="settings-concurrency"
          type="number"
          min={1}
          max={12}
          value={scanner.maxConcurrentScans}
          onChange={(event) =>
            patch((current) => ({
              ...current,
              scanner: { ...current.scanner, maxConcurrentScans: Number(event.target.value) },
            }))
          }
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Scheduling window opens"
          htmlFor="settings-window-start"
          error={fieldErrors['scanner.scheduleStartHour']}
          hint="Hour in the workspace timezone (0–23)."
        >
          <TextInput
            id="settings-window-start"
            type="number"
            min={0}
            max={23}
            value={scanner.scheduleStartHour}
            onChange={(event) =>
              patch((current) => ({
                ...current,
                scanner: { ...current.scanner, scheduleStartHour: Number(event.target.value) },
              }))
            }
          />
        </Field>
        <Field label="Scheduling window closes" htmlFor="settings-window-end">
          <TextInput
            id="settings-window-end"
            type="number"
            min={0}
            max={23}
            value={scanner.scheduleEndHour}
            onChange={(event) =>
              patch((current) => ({
                ...current,
                scanner: { ...current.scanner, scheduleEndHour: Number(event.target.value) },
              }))
            }
          />
        </Field>
      </div>

      <Switch
        id="settings-autostart"
        checked={scanner.autoStart}
        label="Start queued runs automatically"
        description="A queued scan begins as soon as a worker frees up."
        onChange={(checked) =>
          patch((current) => ({ ...current, scanner: { ...current.scanner, autoStart: checked } }))
        }
      />
      <Switch
        id="settings-autoretest"
        checked={scanner.autoRetestFixed}
        label="Re-test fixed findings automatically"
        description="When a target is rescanned, findings previously marked fixed are queued for retest instead of closing silently."
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            scanner: { ...current.scanner, autoRetestFixed: checked },
          }))
        }
      />
    </SectionCard>
  )
}

function NotificationsSection({ data }: { data: SettingsData }) {
  const { draft, patch, save, dirty, fieldErrors, setDraft } = useWorkspaceDraft(data)
  const notifications = draft.notifications

  return (
    <SectionCard
      title="Notifications"
      description="What the workspace tells you about, and where."
      actions={
        <DirtyActions
          dirty={dirty}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onRevert={() => setDraft(data.settings)}
        />
      }
    >
      <Field
        label="Delivery address"
        htmlFor="settings-email-notifications"
        required
        error={fieldErrors['notifications.email']}
      >
        <TextInput
          id="settings-email-notifications"
          type="email"
          value={notifications.email}
          invalid={Boolean(fieldErrors['notifications.email'])}
          onChange={(event) =>
            patch((current) => ({
              ...current,
              notifications: { ...current.notifications, email: event.target.value },
            }))
          }
        />
      </Field>

      <Switch
        id="notify-scan-started"
        checked={notifications.scanStarted}
        label="Scan started"
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            notifications: { ...current.notifications, scanStarted: checked },
          }))
        }
      />
      <Switch
        id="notify-scan-completed"
        checked={notifications.scanCompleted}
        label="Scan completed"
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            notifications: { ...current.notifications, scanCompleted: checked },
          }))
        }
      />
      <Switch
        id="notify-scan-failed"
        checked={notifications.scanFailed}
        label="Scan failed"
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            notifications: { ...current.notifications, scanFailed: checked },
          }))
        }
      />
      <Switch
        id="notify-verification"
        checked={notifications.verificationAssigned}
        label="Verification assigned to me"
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            notifications: { ...current.notifications, verificationAssigned: checked },
          }))
        }
      />
      <Switch
        id="notify-report"
        checked={notifications.reportReady}
        label="Report ready to review"
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            notifications: { ...current.notifications, reportReady: checked },
          }))
        }
      />
      <Switch
        id="notify-digest"
        checked={notifications.dailyDigest}
        label="Daily digest"
        description="One summary of queue depth and failed jobs each morning."
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            notifications: { ...current.notifications, dailyDigest: checked },
          }))
        }
      />
    </SectionCard>
  )
}

function SecuritySection({ data }: { data: SettingsData }) {
  const { draft, patch, save, dirty, fieldErrors, setDraft } = useWorkspaceDraft(data)
  const security = draft.security

  return (
    <SectionCard
      title="Security"
      description="Workspace-wide guardrails. These are UI acknowledgements only — a real deployment must enforce them server-side."
      actions={
        <DirtyActions
          dirty={dirty}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onRevert={() => setDraft(data.settings)}
        />
      }
    >
      <Switch
        id="security-mfa-export"
        checked={security.requireMfaForExports}
        label="Require a second factor to export"
        description="Blocks a report download from an account without MFA."
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            security: { ...current.security, requireMfaForExports: checked },
          }))
        }
      />
      <Switch
        id="security-authorisation"
        checked={security.requireAuthorisation}
        label="Require confirmed authorisation on every target"
        description="A target cannot be scanned until its authorisation has been acknowledged."
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            security: { ...current.security, requireAuthorisation: checked },
          }))
        }
      />
      <Switch
        id="security-rate-limit"
        checked={security.warnOnRateLimitOverride}
        label="Warn when a run exceeds the workspace rate ceiling"
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            security: { ...current.security, warnOnRateLimitOverride: checked },
          }))
        }
      />
      <Switch
        id="security-signin-notify"
        checked={security.notifyOnNewSignIn}
        label="Notify on a new sign-in"
        onChange={(checked) =>
          patch((current) => ({
            ...current,
            security: { ...current.security, notifyOnNewSignIn: checked },
          }))
        }
      />

      <Field
        label="Idle sign-out"
        htmlFor="settings-timeout"
        error={fieldErrors['security.sessionTimeoutMinutes']}
        hint="Minutes of inactivity before sign-out. Use 0 to disable."
      >
        <TextInput
          id="settings-timeout"
          type="number"
          min={0}
          max={1440}
          value={security.sessionTimeoutMinutes}
          invalid={Boolean(fieldErrors['security.sessionTimeoutMinutes'])}
          onChange={(event) =>
            patch((current) => ({
              ...current,
              security: {
                ...current.security,
                sessionTimeoutMinutes: Number(event.target.value),
              },
            }))
          }
        />
      </Field>
    </SectionCard>
  )
}

function WorkspaceSection({ data }: { data: SettingsData }) {
  const { draft, patch, save, dirty, fieldErrors, setDraft } = useWorkspaceDraft(data)

  return (
    <SectionCard
      title="Workspace"
      description="Identity and formatting shared by every member. The short label appears in the sidebar and on report covers."
      actions={
        <DirtyActions
          dirty={dirty}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onRevert={() => setDraft(data.settings)}
        />
      }
    >
      <Field label="Workspace name" htmlFor="settings-workspace-name" required error={fieldErrors['settings.name']}>
        <TextInput
          id="settings-workspace-name"
          value={draft.name}
          invalid={Boolean(fieldErrors['settings.name'])}
          onChange={(event) => patch((current) => ({ ...current, name: event.target.value }))}
        />
      </Field>
      <Field
        label="Short label"
        htmlFor="settings-short-name"
        required
        error={fieldErrors['settings.shortName']}
      >
        <TextInput
          id="settings-short-name"
          value={draft.shortName}
          invalid={Boolean(fieldErrors['settings.shortName'])}
          onChange={(event) => patch((current) => ({ ...current, shortName: event.target.value }))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Timezone" htmlFor="settings-timezone">
          <Select
            id="settings-timezone"
            value={draft.timezone}
            onChange={(event) => patch((current) => ({ ...current, timezone: event.target.value }))}
            options={data.timezones.map((zone) => ({ value: zone, label: zone }))}
          />
        </Field>
        <Field label="Locale" htmlFor="settings-locale">
          <Select
            id="settings-locale"
            value={draft.defaultLocale}
            onChange={(event) =>
              patch((current) => ({ ...current, defaultLocale: event.target.value }))
            }
            options={data.locales.map((locale) => ({ value: locale.code, label: locale.label }))}
          />
        </Field>
      </div>

      <p className="text-[12px] text-fg-subtle">
        Registered as {data.organizationName} · last changed{' '}
        {formatRelativeTime(draft.updatedAt)} by {draft.updatedBy}.
      </p>
    </SectionCard>
  )
}
