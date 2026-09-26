import {
  addAdminSchema,
  formatRelativeTime,
  type AddAdminInput,
  type AdminAccount,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { CopyIcon, KeyRoundIcon, UserPlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/user-avatar'
import { useAddAdmin, useRemoveAdmin } from '@/hooks/use-admin'
import { useCurrentUser } from '@/hooks/use-household'
import { adminAccountsQuery } from '@/lib/queries'

export function AdminAdminsPage() {
  const admins = useSuspenseQuery(adminAccountsQuery()).data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admins</h1>
          <p className="text-sm text-muted-foreground">
            Admin accounts only work here, not in the household app.
          </p>
        </div>
        <AddAdminDialog />
      </div>
      <ul className="divide-y rounded-xl border">
        {admins.map((admin) => (
          <AdminRow key={admin.id} admin={admin} />
        ))}
      </ul>
    </div>
  )
}

function AdminRow({ admin }: { admin: AdminAccount }) {
  const me = useCurrentUser()
  const remove = useRemoveAdmin()
  const isMe = admin.id === me.id
  const alsoMember = admin.householdCount > 0

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <UserAvatar name={admin.fullName ?? admin.email} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{admin.fullName ?? admin.email}</span>
          {isMe && <Badge variant="secondary">You</Badge>}
        </p>
        {admin.fullName && <p className="truncate text-sm text-muted-foreground">{admin.email}</p>}
        <p className="text-xs text-muted-foreground">
          Admin since {formatRelativeTime(admin.adminSince)}
          {admin.lastSignInAt
            ? ` · last signed in ${formatRelativeTime(admin.lastSignInAt)}`
            : ' · never signed in'}
          {alsoMember &&
            ` · also a member of ${admin.householdCount} ${admin.householdCount === 1 ? 'household' : 'households'}`}
        </p>
      </div>
      {!isMe && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              Remove
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {admin.email} as an admin?</AlertDialogTitle>
              <AlertDialogDescription>
                {alsoMember
                  ? 'They lose access to the admin area but keep their regular account and households.'
                  : 'Their admin-only account will be deleted. You can add them again later.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => remove.mutate({ userId: admin.id, email: admin.email })}
              >
                Remove admin
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  )
}

/** A readable temporary password: 4 groups of 4 letters and digits (no look-alikes). */
function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-')
}

function AddAdminDialog() {
  const add = useAddAdmin()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<AddAdminInput>({ fullName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof AddAdminInput, string>>>({})
  const [created, setCreated] = useState<AddAdminInput | null>(null)

  function reset(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setValues({ fullName: '', email: '', password: generatePassword() })
      setErrors({})
      setCreated(null)
    }
  }

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = addAdminSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({})
    add.mutate(parsed.data, { onSuccess: () => setCreated(parsed.data) })
  }

  const signInUrl = `${window.location.origin}/admin/sign-in`
  const details = created
    ? `Admin sign-in: ${signInUrl}\nEmail: ${created.email}\nTemporary password: ${created.password}`
    : ''

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon aria-hidden />
          Add admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Admin account created</DialogTitle>
              <DialogDescription>
                Share these with {created.fullName} privately. They&apos;ll choose their own
                password the first time they sign in.
              </DialogDescription>
            </DialogHeader>
            <pre className="rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {details}
            </pre>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(details)
                    .then(() => toast.success('Copied'))
                    .catch(() => toast.error("Couldn't copy. Select the text and copy it."))
                }
              >
                <CopyIcon aria-hidden />
                Copy details
              </Button>
              <Button onClick={() => reset(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Add an admin</DialogTitle>
              <DialogDescription>
                Creates a separate admin account. Use an email that isn&apos;t already used for a
                household account.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="my-4">
              <Field data-invalid={!!errors.fullName}>
                <FieldLabel htmlFor="admin-name">Name</FieldLabel>
                <Input
                  id="admin-name"
                  value={values.fullName}
                  onChange={(e) => setValues({ ...values, fullName: e.target.value })}
                  aria-invalid={!!errors.fullName}
                />
                <FieldError errors={errors.fullName ? [{ message: errors.fullName }] : []} />
              </Field>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="admin-email">Email</FieldLabel>
                <Input
                  id="admin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={values.email}
                  onChange={(e) => setValues({ ...values, email: e.target.value })}
                  aria-invalid={!!errors.email}
                />
                <FieldError errors={errors.email ? [{ message: errors.email }] : []} />
              </Field>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="admin-password">Temporary password</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="admin-password"
                    autoComplete="off"
                    className="font-mono"
                    value={values.password}
                    onChange={(e) => setValues({ ...values, password: e.target.value })}
                    aria-invalid={!!errors.password}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setValues({ ...values, password: generatePassword() })}
                  >
                    <KeyRoundIcon aria-hidden />
                    New
                  </Button>
                </div>
                <FieldDescription>They must change it when they first sign in.</FieldDescription>
                <FieldError errors={errors.password ? [{ message: errors.password }] : []} />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => reset(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={add.isPending}>
                {add.isPending ? 'Creating…' : 'Create admin'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
