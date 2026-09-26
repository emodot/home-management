import { formatRelativeTime, getAdminUser, type AdminUser } from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { BanIcon, CircleCheckIcon, EllipsisIcon, KeyRoundIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { AdminPager, AdminSearch } from '@/components/admin'
import { EmptyState } from '@/components/empty-state'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/user-avatar'
import { useDeleteUser, useSendPasswordReset, useSetUserDisabled } from '@/hooks/use-admin'
import { useCurrentUser } from '@/hooks/use-household'
import { adminKey, adminUsersQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

export function AdminUsersPage() {
  const [params] = useSearchParams()
  const search = params.get('q') ?? ''
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const users = useQuery(adminUsersQuery(search, page))
  const [deleting, setDeleting] = useState<AdminUser | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <AdminSearch label="Search by name or email" />
      {users.isError ? (
        <p className="text-sm text-destructive">Couldn’t load users. Try again.</p>
      ) : !users.data ? null : users.data.items.length === 0 ? (
        <EmptyState title={search ? 'No users match' : 'No users yet'} size="sm" />
      ) : (
        <>
          <ul
            className={`divide-y rounded-xl border transition-opacity ${users.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            {users.data.items.map((u) => (
              <UserRow key={u.id} user={u} onDelete={() => setDeleting(u)} />
            ))}
          </ul>
          <AdminPager total={users.data.total} count={users.data.items.length} />
        </>
      )}
      {deleting && <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

function UserRow({ user, onDelete }: { user: AdminUser; onDelete: () => void }) {
  const me = useCurrentUser()
  const isMe = user.id === me.id
  const setDisabled = useSetUserDisabled()
  const sendReset = useSendPasswordReset()
  const disabled = user.bannedUntil !== null

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <UserAvatar name={user.fullName ?? user.email} avatarUrl={user.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{user.fullName ?? user.email}</span>
          {isMe && <Badge variant="secondary">You</Badge>}
          {user.isAdmin && <Badge variant="outline">Admin</Badge>}
          {disabled && (
            <Badge variant="outline" className="text-destructive">
              Disabled
            </Badge>
          )}
        </p>
        {user.fullName && <p className="truncate text-sm text-muted-foreground">{user.email}</p>}
        <p className="text-xs text-muted-foreground">
          {user.householdCount} {user.householdCount === 1 ? 'household' : 'households'} · joined{' '}
          {formatRelativeTime(user.createdAt)}
          {user.lastSignInAt ? ` · last signed in ${formatRelativeTime(user.lastSignInAt)}` : ''}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${user.email}`}>
            <EllipsisIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => sendReset.mutate({ userId: user.id, email: user.email })}
          >
            <KeyRoundIcon aria-hidden />
            Send password reset
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isMe}
            onSelect={() =>
              setDisabled.mutate({ userId: user.id, email: user.email, disabled: !disabled })
            }
          >
            {disabled ? <CircleCheckIcon aria-hidden /> : <BanIcon aria-hidden />}
            {disabled ? 'Re-enable account' : 'Disable account'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={isMe} onSelect={onDelete}>
            <Trash2Icon aria-hidden />
            Delete account…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

/** Shows what deleting the account will also delete, and asks for the email to confirm. */
function DeleteUserDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const deleteUser = useDeleteUser()
  const detail = useQuery({
    queryKey: [...adminKey, 'user', user.id],
    queryFn: () => getAdminUser(supabase, user.id),
  })
  const alone = detail.data?.households.filter((h) => h.memberCount === 1) ?? []
  const shared = detail.data?.households.filter((h) => h.memberCount > 1) ?? []

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              <p>This permanently deletes the account and can&apos;t be undone.</p>
              {detail.isPending ? (
                <p>Checking their households…</p>
              ) : (
                <>
                  {alone.length > 0 && (
                    <p>
                      They&apos;re the only member of{' '}
                      <span className="font-medium text-foreground">
                        {alone.map((h) => h.name).join(', ')}
                      </span>
                      , so {alone.length === 1 ? 'it' : 'those'} will be deleted too, with every
                      expense, receipt, task and provider in {alone.length === 1 ? 'it' : 'them'}.
                    </p>
                  )}
                  {shared.length > 0 && (
                    <p>
                      They&apos;ll be removed from {shared.map((h) => h.name).join(', ')}; what they
                      added there stays.
                    </p>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={user.email}
          aria-label={`Type ${user.email} to confirm`}
          autoComplete="off"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={
              typed.trim().toLowerCase() !== user.email.toLowerCase() || deleteUser.isPending
            }
            onClick={() =>
              deleteUser.mutate({ userId: user.id, email: user.email }, { onSuccess: onClose })
            }
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete account'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
