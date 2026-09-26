import {
  formatRelativeTime,
  inviteFormSchema,
  type InviteFormInput,
  type PendingInvite,
  type SendInviteResult,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { LinkIcon, MailIcon, RotateCwIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { InviteLinkDialog, type InviteLink } from '@/components/invite-link-dialog'
import { LeaveHouseholdDialog } from '@/components/leave-household-dialog'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
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
  const [link, setLink] = useState<InviteLink | null>(null)
  // Only household admins invite people; super-admins decide who is a household admin.
  const isAdmin = members.some((m) => m.user_id === user.id && m.role === 'admin')
  const onlyAdmin = isAdmin && members.filter((m) => m.role === 'admin').length === 1

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
          {members.map(({ user_id, joined_at, role, profile }) => {
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
                    {role === 'admin' && (
                      <Badge variant="outline" className="ml-2 align-middle">
                        Household admin
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

      {isAdmin ? (
        <Section
          title="Invite someone"
          description="Share a link on WhatsApp or anywhere else, or email it. Each link lets one person join and expires after 7 days."
        >
          <InviteForm householdId={household.id} onLink={setLink} />
        </Section>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Want someone else to join? Ask a household admin to invite them.
        </p>
      )}

      {isAdmin && invites.length > 0 && (
        <Section title="Pending invites">
          <ul className="divide-y rounded-xl border">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                householdId={household.id}
                onLink={setLink}
              />
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Leave household"
        description={
          onlyAdmin && members.length > 1
            ? "You're the only household admin, so you can't leave while others are here. Ask the Home administrator to make someone else an admin first."
            : 'You will lose access until a household admin invites you again.'
        }
      >
        {!(onlyAdmin && members.length > 1) && (
          <div>
            <LeaveHouseholdDialog household={household} />
          </div>
        )}
      </Section>

      <InviteLinkDialog
        link={link}
        householdName={household.name}
        timezone={household.timezone}
        onClose={() => setLink(null)}
      />
    </div>
  )
}

function toLink(result: SendInviteResult): InviteLink {
  return {
    url: result.inviteUrl,
    expiresAt: result.expiresAt,
    email: result.email,
    emailed: result.emailed,
  }
}

function InviteForm({
  householdId,
  onLink,
}: {
  householdId: string
  onLink: (link: InviteLink) => void
}) {
  const createLink = useSendInvite(householdId)
  const sendInvite = useSendInvite(householdId)
  const form = useForm<InviteFormInput>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  function create() {
    createLink.mutate(
      {},
      {
        onSuccess: (result) => onLink(toLink(result)),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      const result = await sendInvite.mutateAsync({ email })
      form.reset()
      if (result.emailed) {
        toast.success(`${result.resent ? 'Invite resent' : 'Invite sent'} to ${email}`, {
          action: {
            label: 'Copy link',
            onClick: () => void navigator.clipboard.writeText(result.inviteUrl),
          },
        })
      } else {
        // The invite exists; offer the link instead.
        onLink(toLink(result))
      }
    } catch (error) {
      if (errorCode(error) === 'already_member') {
        form.setError('email', { message: errorMessage(error) })
      } else {
        toast.error(errorMessage(error))
      }
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <Button className="w-fit" onClick={create} disabled={createLink.isPending}>
        <LinkIcon aria-hidden />
        {createLink.isPending ? 'Creating…' : 'Create invite link'}
      </Button>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="invite-email" className="text-sm font-normal text-muted-foreground">
            Or email an invite
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
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              <MailIcon aria-hidden />
              {isSubmitting ? 'Sending…' : 'Send'}
            </Button>
          </div>
          <FieldError errors={[errors.email]} />
        </Field>
      </form>
    </div>
  )
}

function InviteRow({
  invite,
  householdId,
  onLink,
}: {
  invite: PendingInvite
  householdId: string
  onLink: (link: InviteLink) => void
}) {
  const newLink = useSendInvite(householdId)
  const resend = useSendInvite(householdId)
  const revokeInvite = useRevokeInvite(householdId)
  const expired = new Date(invite.expires_at) <= new Date()
  const inviter = invite.inviter?.full_name ?? invite.inviter?.email
  const label = invite.email ?? 'Invite link'

  function makeNewLink() {
    newLink.mutate(
      { inviteId: invite.id },
      {
        onSuccess: (result) => onLink({ ...toLink(result), emailed: false, email: null }),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  function resendEmail(email: string) {
    resend.mutate(
      { email },
      {
        onSuccess: (result) => {
          if (result.emailed) toast.success(`New invite link sent to ${email}`)
          else onLink(toLink(result))
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          {inviter ? `Created by ${inviter} · ` : ''}
          {expired ? (
            <Badge variant="outline" className="text-destructive">
              Expired
            </Badge>
          ) : (
            `expires ${formatRelativeTime(invite.expires_at)}`
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={makeNewLink}
          disabled={newLink.isPending}
          title="Makes a new link to copy; the previous link stops working"
        >
          <LinkIcon aria-hidden />
          {newLink.isPending ? 'Creating…' : 'New link'}
        </Button>
        {invite.email && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resendEmail(invite.email ?? '')}
            disabled={resend.isPending}
          >
            <RotateCwIcon aria-hidden />
            {resend.isPending ? 'Sending…' : 'Resend'}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => revokeInvite.mutate(invite)}
          disabled={revokeInvite.isPending}
          aria-label={invite.email ? `Cancel invite to ${invite.email}` : 'Cancel invite link'}
        >
          <XIcon aria-hidden />
          Cancel
        </Button>
      </div>
    </li>
  )
}
