import type {
  AssessmentType,
  NotificationPreferences,
  ScanProfile,
  ScanProfileId,
  SecurityPreferences,
  User,
  WorkspaceSettings,
} from '@/types'
import { ASSESSMENT_TYPES, SCAN_PROFILES } from '@/types'

import { nextAuditIndex } from '@/utils/ids'

import { demoStore } from './store'
import { ApiError, notFound, request, requestWrite } from './transport'

/**
 * Workspace settings and the signed-in member's own profile.
 *
 * Split deliberately. Profile fields are the current user's identity and belong
 * to them; everything under `WorkspaceSettings` is shared, admin-owned policy
 * that changes what the whole team sees. One service keeps the audit rules for
 * the shared half in a single place, and the split is visible in the method
 * names.
 */

export interface SettingsData {
  settings: WorkspaceSettings
  organizationName: string
  /** Options for the select inputs, derived rather than hard-coded. */
  profiles: { id: ScanProfileId; name: string; moduleCount: number }[]
  assessmentTypes: readonly AssessmentType[]
  /** Timezones offered in the picker. A real deployment would read a zone list. */
  timezones: string[]
  locales: { code: string; label: string }[]
}

/** The subset a member may change about themselves. */
export interface ProfileUpdate {
  name: string
  email: string
}

function toData(): SettingsData {
  const data = demoStore.snapshot()
  const organization = data.organizations.find(
    (entry) => entry.id === data.workspaceSettings.organizationId,
  )

  return {
    settings: data.workspaceSettings,
    organizationName: organization?.name ?? data.workspaceSettings.name,
    profiles: data.scanProfiles.map((profile: ScanProfile) => ({
      id: profile.id,
      name: profile.name,
      moduleCount: profile.moduleIds.length,
    })),
    assessmentTypes: ASSESSMENT_TYPES,
    timezones: [
      'Europe/London',
      'Europe/Berlin',
      'America/New_York',
      'America/Los_Angeles',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Australia/Sydney',
      'UTC',
    ],
    locales: [
      { code: 'en-GB', label: 'English (United Kingdom)' },
      { code: 'en-US', label: 'English (United States)' },
      { code: 'de-DE', label: 'Deutsch' },
      { code: 'fr-FR', label: 'Français' },
      { code: 'es-ES', label: 'Español' },
      { code: 'ja-JP', label: '日本語' },
    ],
  }
}

function audit(actor: string, entity: string, entityId: string) {
  return {
    id: `aud-${String(nextAuditIndex(demoStore.snapshot().auditLog)).padStart(5, '0')}`,
    timestamp: new Date().toISOString(),
    actor,
    action: 'settings.update',
    entity,
    entityId,
    ipAddress: '10.4.0.12',
    outcome: 'success' as const,
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function validateNotifications(input: Partial<NotificationPreferences>): Record<string, string> {
  const fields: Record<string, string> = {}
  const email = input.email?.trim() ?? ''
  if (email.length === 0) fields['notifications.email'] = 'Enter an email address.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields['notifications.email'] = 'Enter a valid email address.'
  }
  return fields
}

function validateSecurity(input: Partial<SecurityPreferences>): Record<string, string> {
  const fields: Record<string, string> = {}
  const timeout = input.sessionTimeoutMinutes
  if (timeout !== undefined) {
    const parsed = Number(timeout)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1440) {
      fields['security.sessionTimeoutMinutes'] = 'Use 0 to disable, or 1–1440 minutes.'
    }
  }
  return fields
}

export const settingsService = {
  async read(): Promise<SettingsData> {
    return request(() => toData())
  },

  /**
   * Update the signed-in member's own profile.
   *
   * Writes to the user record rather than the session, so a reload keeps the
   * change. The session copy in `useAuth` still holds the seeded user, which is
   * why the settings page shows a note when the two disagree.
   */
  async updateProfile(userId: string, input: ProfileUpdate): Promise<User> {
    return requestWrite(() => {
      const data = demoStore.snapshot()
      const user = data.users.find((entry) => entry.id === userId)
      if (!user) throw notFound('User', userId)

      const name = input.name.trim()
      const email = input.email.trim().toLowerCase()
      const fields: Record<string, string> = {}

      if (name.length < 2) fields.name = 'Enter your name.'
      if (!email.includes('@')) fields.email = 'Enter a valid email address.'
      else if (data.users.some((entry) => entry.id !== userId && entry.email.toLowerCase() === email)) {
        fields.email = 'That email is already in use.'
      }
      if (Object.keys(fields).length > 0) {
        throw new ApiError(400, 'Your profile could not be saved.', fields)
      }

      const snapshot = demoStore.mutate((draft) => {
        const target = draft.users.find((entry) => entry.id === userId)
        if (target) {
          target.name = name
          target.email = email
        }
      })

      const updated = snapshot.users.find((entry) => entry.id === userId)
      if (!updated) throw notFound('User', userId)
      return updated
    })
  },

  /**
   * Save the whole workspace settings object.
   *
   * Sent as a complete object rather than a patch: the form holds every field,
   * so a partial update would let an unrelated omission silently reset a default.
   */
  async updateWorkspace(
    next: WorkspaceSettings,
    actor: string,
  ): Promise<WorkspaceSettings> {
    return requestWrite(() => {
      const fields: Record<string, string> = {
        ...validateNotifications(next.notifications),
        ...validateSecurity(next.security),
      }
      if (next.name.trim().length < 2) fields['settings.name'] = 'Enter the workspace name.'
      if (next.shortName.trim().length < 2) {
        fields['settings.shortName'] = 'Enter a short label.'
      }

      const start = clampInt(next.scanner.scheduleStartHour, 0, 23, 8)
      const end = clampInt(next.scanner.scheduleEndHour, 0, 23, 19)
      if (start >= end) {
        fields['scanner.scheduleStartHour'] = 'The window must start before it ends.'
      }

      if (next.scanner.profileId && !SCAN_PROFILES.includes(next.scanner.profileId)) {
        fields['scanner.profileId'] = 'Choose a scan profile.'
      }
      if (next.scanner.assessmentType && !ASSESSMENT_TYPES.includes(next.scanner.assessmentType)) {
        fields['scanner.assessmentType'] = 'Choose an assessment type.'
      }
      if (
        next.scanner.maxConcurrentScans < 1 ||
        next.scanner.maxConcurrentScans > 12
      ) {
        fields['scanner.maxConcurrentScans'] = 'Use 1–12 concurrent runs.'
      }

      if (Object.keys(fields).length > 0) {
        throw new ApiError(400, 'These settings could not be saved.', fields)
      }

      const snapshot = demoStore.mutate((draft) => {
        draft.workspaceSettings = {
          ...next,
          name: next.name.trim(),
          shortName: next.shortName.trim(),
          scanner: {
            ...next.scanner,
            scheduleStartHour: start,
            scheduleEndHour: end,
          },
          notifications: { ...next.notifications, email: next.notifications.email.trim() },
          updatedAt: new Date().toISOString(),
          updatedBy: actor,
        }
        draft.auditLog.push(audit(actor, 'workspace', draft.workspaceSettings.organizationId))
      })

      return snapshot.workspaceSettings
    })
  },
}
