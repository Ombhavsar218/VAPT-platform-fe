import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ErrorState } from '@/components/common/ErrorState'
import { Field, Select, TextInput } from '@/components/common/Form'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Spinner } from '@/components/common/Spinner'
import { MfaBadge, UserStatusBadge } from '@/components/common/StatusBadge'
import { sortFromState, sortToState, useListQuery } from '@/hooks/useListQuery'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import {
  adminService,
  EMPTY_USER_AGGREGATES,
  type UserAggregates,
  type UserRow,
} from '@/services/admin'
import { queryKeys } from '@/services/queryKeys'
import { normalizeListParams } from '@/services/transport'
import { USER_ROLES, type UserRole } from '@/types'
import { formatNumber, formatRelativeTime } from '@/utils/format'
import { ROLE_LABELS } from '@/utils/roles'


function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Workspace members (`/admin/users`).
 *
 * The row is the control surface: role, MFA and account state are all changed
 * in place, because an operator triaging access should not have to open a
 * detail page, find the field and come back. Each mutation is refused when it
 * would be a no-op, which keeps the audit trail free of changes that never
 * happened.
 */
export function AdminUsersPage() {
  const query = useListQuery({ defaults: { pageSize: 12, sort: 'name' } })
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [inviting, setInviting] = useState(false)

  const normalized = normalizeListParams(query.params)
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.userList(normalized),
    queryFn: () => adminService.listUsers(query.params),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.root })
    void queryClient.invalidateQueries({ queryKey: queryKeys.reference.users() })
  }

  const changeRole = useMutation({
    mutationFn: (input: { id: string; role: UserRole }) =>
      adminService.setUserRole(input.id, input.role, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      invalidate()
      toast.success('Role updated', `${row.name} is now ${ROLE_LABELS[row.role]}.`)
    },
    onError: (caught) =>
      toast.error(
        'Could not change the role',
        caught instanceof Error ? caught.message : 'Unknown error.',
      ),
  })

  const changeStatus = useMutation({
    mutationFn: (input: { id: string; status: UserRow['status'] }) =>
      adminService.setUserStatus(input.id, input.status, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      invalidate()
      toast.success('Account updated', `${row.name} is now ${row.status}.`)
    },
    onError: (caught) =>
      toast.error(
        'Could not change the account',
        caught instanceof Error ? caught.message : 'Unknown error.',
      ),
  })

  const changeMfa = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      adminService.setUserMfa(input.id, input.enabled, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      invalidate()
      toast.success(
        'MFA updated',
        `${row.name} now has MFA ${row.mfaEnabled ? 'enabled' : 'disabled'}.`,
      )
    },
    onError: (caught) =>
      toast.error('Could not change MFA', caught instanceof Error ? caught.message : 'Unknown error.'),
  })

  const aggregates: UserAggregates = data?.aggregates ?? EMPTY_USER_AGGREGATES
  const busy =
    changeRole.isPending || changeStatus.isPending || changeMfa.isPending

  const columns = useMemo<Column<UserRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Member',
        primaryOnMobile: true,
        sortValue: (row) => row.name,
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg-muted"
            >
              {initials(row.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">
                {row.name}
                {row.id === user?.id ? (
                  <span className="ml-1.5 text-[11px] font-normal text-fg-subtle">you</span>
                ) : null}
              </p>
              <p className="truncate text-[12px] text-fg-muted">{row.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        sortValue: (row) => row.role,
        cell: (row) => (
          <Select
            aria-label={`Role for ${row.name}`}
            value={row.role}
            disabled={busy}
            onChange={(event) =>
              changeRole.mutate({ id: row.id, role: event.target.value as UserRole })
            }
            options={USER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
            className="min-w-36"
          />
        ),
      },
      {
        key: 'status',
        header: 'Account',
        sortValue: (row) => row.status,
        cell: (row) => (
          <div className="flex flex-col items-start gap-1.5">
            <UserStatusBadge status={row.status} />
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || row.id === user?.id}
              title={
                row.id === user?.id
                  ? 'You cannot change your own account status'
                  : undefined
              }
              onClick={() =>
                changeStatus.mutate({
                  id: row.id,
                  status: row.status === 'suspended' ? 'active' : 'suspended',
                })
              }
            >
              {row.status === 'suspended' ? 'Reactivate' : 'Suspend'}
            </Button>
          </div>
        ),
      },
      {
        key: 'mfa',
        header: 'MFA',
        sortValue: (row) => String(row.mfaEnabled),
        cell: (row) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            title={row.mfaEnabled ? 'Remove the second factor' : 'Enrol a second factor'}
            onClick={() => changeMfa.mutate({ id: row.id, enabled: !row.mfaEnabled })}
          >
            <MfaBadge enabled={row.mfaEnabled} />
          </Button>
        ),
      },
      {
        key: 'workload',
        header: 'Assigned',
        align: 'right',
        hideBelowLg: true,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatNumber(row.openAssignments)} open
            {row.pendingVerifications > 0 ? ` · ${row.pendingVerifications} to verify` : ''}
          </span>
        ),
      },
      {
        key: 'reportsGenerated',
        header: 'Reports',
        align: 'right',
        hideBelowLg: true,
        sortValue: (row) => row.reportsGenerated,
        cell: (row) => (
          <span className="text-[13px] tabular-nums text-fg-muted">
            {formatNumber(row.reportsGenerated)}
          </span>
        ),
      },
      {
        key: 'lastActiveAt',
        header: 'Last active',
        align: 'right',
        sortValue: (row) => row.lastActiveAt,
        cell: (row) => (
          <span className="text-[13px] whitespace-nowrap text-fg-muted">
            {formatRelativeTime(row.lastActiveAt)}
          </span>
        ),
      },
    ],
    [busy, changeRole, changeStatus, changeMfa, user?.id],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Who can reach this workspace, what they may do, and whether they hold a second factor."
        actions={
          <Button
            variant="primary"
            leadingIcon={<UserPlus className="size-4" />}
            onClick={() => setInviting(true)}
          >
            Invite member
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ['Total members', aggregates.total],
            ['Active', aggregates.active],
            ['Invited', aggregates.invited],
            ['Without MFA', aggregates.total - aggregates.mfaEnabled],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} className="p-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-fg">
              {formatNumber(value)}
            </p>
          </Card>
        ))}
      </div>

      {aggregates.total - aggregates.mfaEnabled > 0 ? (
        <p className="text-[13px] text-fg-muted">
          {formatNumber(aggregates.total - aggregates.mfaEnabled)} member
          {aggregates.total - aggregates.mfaEnabled === 1 ? ' has' : 's have'} no second factor.
          Exports and destructive actions can be gated on this under Settings → Security.
        </p>
      ) : null}

      {isError ? (
        <Card>
          <ErrorState
            title="Could not load members"
            message={error instanceof Error ? error.message : 'Unknown error.'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <Card flush>
          <FilterBar
            search={{
              value: query.search,
              onChange: query.setSearch,
              placeholder: 'Search by name or email',
              label: 'Search members',
            }}
            activeCount={query.activeFilterCount}
            onClear={query.clearFilters}
          >
            <FilterSelect
              label="Role"
              value={query.filters.role ?? ''}
              onChange={(value) => query.setFilter('role', value)}
              options={USER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
            />
            <FilterSelect
              label="Account"
              value={query.filters.status ?? ''}
              onChange={(value) => query.setFilter('status', value)}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'invited', label: 'Invited' },
                { value: 'suspended', label: 'Suspended' },
              ]}
            />
            <FilterSelect
              label="MFA"
              value={query.filters.mfa ?? ''}
              onChange={(value) => query.setFilter('mfa', value)}
              options={[
                { value: 'enabled', label: 'Enrolled' },
                { value: 'disabled', label: 'Not enrolled' },
              ]}
            />
          </FilterBar>

          {isPending ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-[13px] text-fg-muted">
              <Spinner />
              Loading members…
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={data?.results ?? []}
              rowKey={(row) => row.id}
              defaultSort={sortToState(query.sort) ?? undefined}
              onSortChange={(next) => query.setSort(sortFromState(next))}
              emptyTitle={query.hasAnyFilter ? 'No members match these filters' : 'No members'}
              emptyDescription={
                query.hasAnyFilter
                  ? 'Try clearing the role, account or MFA filter.'
                  : 'This workspace has no members yet.'
              }
              emptyAction={
                query.hasAnyFilter ? (
                  <Button variant="secondary" onClick={query.clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}

          <div className="border-t border-border-base px-5 py-3">
            <Pagination
              page={normalized.page}
              pageSize={normalized.pageSize}
              total={data?.count ?? 0}
              onPageChange={query.setPage}
              onPageSizeChange={query.setPageSize}
            />
          </div>
        </Card>
      )}

      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        onInvited={() => {
          invalidate()
          setInviting(false)
        }}
      />
    </div>
  )
}

function InviteModal({
  open,
  onClose,
  onInvited,
}: {
  open: boolean
  onClose: () => void
  onInvited: () => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('analyst')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const invite = useMutation({
    mutationFn: () =>
      adminService.inviteUser({ name, email, role }, user?.id ?? 'usr-001'),
    onSuccess: (row) => {
      toast.success('Invitation recorded', `${row.email} was invited as ${ROLE_LABELS[row.role]}.`)
      setFieldErrors({})
      setName('')
      setEmail('')
      setRole('analyst')
      onInvited()
    },
    onError: (caught) => {
      if (caught instanceof Error && 'fields' in caught) {
        const fields = (caught as { fields: Record<string, string> }).fields
        if (Object.keys(fields).length > 0) {
          setFieldErrors(fields)
          return
        }
      }
      toast.error(
        'Could not send the invitation',
        caught instanceof Error ? caught.message : 'Unknown error.',
      )
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite member"
      description="No email is sent in this build; the invitation is recorded against the audit trail."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={invite.isPending}
            onClick={() => invite.mutate()}
          >
            Send invitation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="invite-name" required error={fieldErrors.name}>
          <TextInput
            id="invite-name"
            value={name}
            invalid={Boolean(fieldErrors.name)}
            placeholder="Rowan Patel"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="invite-email" required error={fieldErrors.email}>
          <TextInput
            id="invite-email"
            type="email"
            value={email}
            invalid={Boolean(fieldErrors.email)}
            placeholder="rowan@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Role" htmlFor="invite-role" required error={fieldErrors.role}>
          <Select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            options={USER_ROLES.map((entry) => ({ value: entry, label: ROLE_LABELS[entry] }))}
          />
        </Field>
      </div>
    </Modal>
  )
}
