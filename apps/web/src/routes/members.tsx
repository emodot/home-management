import {
  formatRelativeTime,
  inviteFormSchema,
  type InviteFormInput,
  type PendingInvite,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { MailIcon, RotateCwIcon, XIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { LeaveHouseholdDialog } from '@/components/leave-household-dialog'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { useRevokeInvite, useSendInvite } from '@/hooks/use-members'
import { errorCode, errorMessage } from '@/lib/errors'
import { membersQuery, pendingInvitesQuery } from '@/lib/queries'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function MembersPage() {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const invites = useSuspenseQuery(pendingInvitesQuery(household.id)).data

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in {household.name} can see and edit everything in it.
        </p>
      </div>

      <Section title={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}>
        <ul className="divide-y rounded-xl border">
          {members.map(({ user_id, joined_at, profile }) => {
            const name = profile.full_name ?? profile.email
            return (
              <li key={user_id} className="flex items-center gap-3 px-4 py-3">
                <UserAvatar name={name} avatarUrl={profile.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {name}
                    {user_id === user.id && (
                      <Badge variant="secondary" className="ml-2 align-middle">
                        You
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {profile.full_name ? `${profile.email} · ` : ''}joined{' '}
                    {formatRelativeTime(joined_at)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section
        title="Invite someone"
        description="They'll get an email with a link to join. Links expire after 7 days."
      >
        <InviteForm householdId={household.id} />
      </Section>

      {invites.length > 0 && (
        <Section title="Pending invites">
          <ul className="divide-y rounded-xl border">
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} householdId={household.id} />
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Leave household"
        description={
          members.length === 1
            ? "You're the only member. Leaving will permanently delete this household and everything in it."
            : 'You will lose access until someone invites you again.'
        }
      >
        <div>
          <LeaveHouseholdDialog household={household} isLastMember={members.length === 1} />
        </div>
      </Section>
    </div>
  )
}

function InviteForm({ householdId }: { householdId: string }) {
  const sendInvite = useSendInvite(householdId)
  const form = useForm<InviteFormInput>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      const result = await sendInvite.mutateAsync(email)
      toast.success(`${result.resent ? 'Invite resent' : 'Invite sent'} to ${result.email}`)
      form.reset()
    } catch (error) {
      if (errorCode(error) === 'already_member') {
        form.setError('email', { message: errorMessage(error) })
      } else {
        toast.error(errorMessage(error))
      }
    }
  })

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="invite-email" className="sr-only">
          Email address
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@example.com"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
          <Button type="submit" disabled={isSubmitting}>
            <MailIcon aria-hidden />
            {isSubmitting ? 'Sending…' : 'Invite'}
          </Button>
        </div>
        <FieldError errors={[errors.email]} />
        <FieldDescription className="sr-only">
          They&apos;ll get an email with a link to join.
        </FieldDescription>
      </Field>
    </form>
  )
}

function InviteRow({ invite, householdId }: { invite: PendingInvite; householdId: string }) {
  const sendInvite = useSendInvite(householdId)
  const revokeInvite = useRevokeInvite(householdId)
  const expired = new Date(invite.expires_at) <= new Date()
  const inviter = invite.inviter?.full_name ?? invite.inviter?.email

  function resend() {
    sendInvite.mutate(invite.email, {
      onSuccess: () => toast.success(`New invite link sent to ${invite.email}`),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  function revoke() {
    revokeInvite.mutate(invite)
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium">{invite.email}</p>
        <p className="text-sm text-muted-foreground">
          {inviter ? `Invited by ${inviter} · ` : ''}
          {expired ? (
            <Badge variant="outline" className="text-destructive">
              Expired
            </Badge>
          ) : (
            `expires ${formatRelativeTime(invite.expires_at)}`
          )}
        </p>
      </div>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={resend} disabled={sendInvite.isPending}>
          <RotateCwIcon aria-hidden />
          {sendInvite.isPending ? 'Sending…' : 'Resend'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={revoke}
          disabled={revokeInvite.isPending}
          aria-label={`Cancel invite to ${invite.email}`}
        >
          <XIcon aria-hidden />
          Cancel
        </Button>
      </div>
    </li>
  )
}
