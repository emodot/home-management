import { formatDate, formatRelativeTime, householdNameSchema } from '@home/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AdminPager, AdminSearch, StatTile } from '@/components/admin'
import { EmptyState } from '@/components/empty-state'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/user-avatar'
import { useDeleteHousehold, useRenameHousehold } from '@/hooks/use-admin'
import { adminHouseholdQuery, adminHouseholdsQuery } from '@/lib/queries'

export function AdminHouseholdsPage() {
  const [params] = useSearchParams()
  const search = params.get('q') ?? ''
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const households = useQuery(adminHouseholdsQuery(search, page))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Households</h1>
      <AdminSearch label="Search by name" />
      {households.isError ? (
        <p className="text-sm text-destructive">Couldn’t load households. Try again.</p>
      ) : !households.data ? null : households.data.items.length === 0 ? (
        <EmptyState title={search ? 'No households match' : 'No households yet'} size="sm" />
      ) : (
        <>
          <ul
            className={`divide-y rounded-xl border transition-opacity ${households.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            {households.data.items.map((h) => (
              <li key={h.id}>
                <Link
                  to={`/admin/households/${h.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {h.memberCount} {h.memberCount === 1 ? 'member' : 'members'} ·{' '}
                      {h.expenseCount} expenses · {h.taskCount} tasks ·{' '}
                      {h.lastActivityAt
                        ? `active ${formatRelativeTime(h.lastActivityAt)}`
                        : 'no activity'}
                    </p>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <AdminPager total={households.data.total} count={households.data.items.length} />
        </>
      )}
    </div>
  )
}

export function AdminHouseholdPage() {
  const { householdId = '' } = useParams()
  const household = useSuspenseQuery(adminHouseholdQuery(householdId)).data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link to="/admin/households">
            <ArrowLeftIcon aria-hidden />
            Households
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{household.name}</h1>
        <p className="text-sm text-muted-foreground">
          Created {formatDate(household.createdAt.slice(0, 10))} ·{' '}
          {household.lastActivityAt
            ? `last active ${formatRelativeTime(household.lastActivityAt)}`
            : 'no activity yet'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Expenses" value={household.counts.expenses} />
        <StatTile label="Receipts" value={household.counts.receipts} />
        <StatTile label="Tasks" value={household.counts.tasks} />
        <StatTile label="Providers" value={household.counts.providers} />
        <StatTile label="Pending invites" value={household.counts.pendingInvites} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          {household.members.length} {household.members.length === 1 ? 'member' : 'members'}
        </h2>
        <ul className="divide-y rounded-xl border">
          {household.members.map((m) => (
            <li key={m.userId}>
              <Link
                to={`/admin/users?q=${encodeURIComponent(m.email)}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <UserAvatar name={m.fullName ?? m.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.fullName ?? m.email}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {m.fullName ? `${m.email} · ` : ''}joined {formatRelativeTime(m.joinedAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <RenameForm householdId={household.id} name={household.name} />
      <DeleteHousehold householdId={household.id} name={household.name} />
    </div>
  )
}

function RenameForm({ householdId, name }: { householdId: string; name: string }) {
  const rename = useRenameHousehold()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = householdNameSchema.safeParse(value)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name')
      return
    }
    setError(null)
    rename.mutate({ householdId, name: parsed.data })
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
      <h2 className="font-semibold">Rename</h2>
      <form onSubmit={submit} noValidate>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="household-name" className="sr-only">
            Household name
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="household-name"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!!error}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={rename.isPending || value.trim() === name}
            >
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <FieldError errors={error ? [{ message: error }] : []} />
        </Field>
      </form>
    </section>
  )
}

function DeleteHousehold({ householdId, name }: { householdId: string; name: string }) {
  const navigate = useNavigate()
  const deleteHousehold = useDeleteHousehold()
  const [typed, setTyped] = useState('')

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Delete household</h2>
        <p className="text-sm text-muted-foreground">
          Permanently deletes the household and everything in it, including receipt files. Its
          members keep their accounts.
        </p>
      </div>
      <AlertDialog onOpenChange={() => setTyped('')}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="w-fit text-destructive hover:text-destructive">
            Delete household…
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Type the household&apos;s name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={name}
            aria-label={`Type ${name} to confirm`}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={typed.trim() !== name || deleteHousehold.isPending}
              onClick={() =>
                deleteHousehold.mutate(
                  { householdId, name },
                  { onSuccess: () => void navigate('/admin/households', { replace: true }) },
                )
              }
            >
              {deleteHousehold.isPending ? 'Deleting…' : 'Delete household'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
