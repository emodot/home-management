import { acceptInvite } from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLoaderData, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks/use-household'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { householdsQuery, profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import type { InviteLoaderData } from './loaders'

export function InvitePage() {
  const data = useLoaderData<InviteLoaderData>()
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const accept = useMutation({
    mutationFn: (token: string) => acceptInvite(supabase, { token }),
    onSuccess: async (invite) => {
      await Promise.all([
        queryClient.invalidateQueries(householdsQuery(user.id)),
        queryClient.invalidateQueries(profileQuery(user.id)),
      ])
      toast.success(`Welcome to ${invite.householdName}`)
      await navigate('/', { replace: true })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (data.status === 'error') {
    return (
      <AuthCard title="Invite unavailable" description={data.message}>
        <Button asChild className="w-full">
          <Link to="/">Go to Home</Link>
        </Button>
      </AuthCard>
    )
  }

  const { invite, token } = data

  if (invite.alreadyMember) {
    return (
      <AuthCard
        title={`You're already in ${invite.householdName}`}
        description="You're a member of this household already."
      >
        <Button className="w-full" onClick={() => accept.mutate(token)} disabled={accept.isPending}>
          Open {invite.householdName}
        </Button>
      </AuthCard>
    )
  }

  if (!invite.emailMatches) {
    return (
      <AuthCard
        title="This invite is for someone else"
        description={
          <>
            It was sent to <span className="font-medium text-foreground">{invite.email}</span>, but
            you&apos;re signed in as{' '}
            <span className="font-medium text-foreground">{user.email}</span>. Sign in with the
            invited address to accept it.
          </>
        }
      >
        <Button
          className="w-full"
          // The auth listener brings you back to this invite after signing in again.
          onClick={() => void signOut().catch((error: unknown) => toast.error(errorMessage(error)))}
        >
          Sign out and switch account
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={`Join ${invite.householdName}`}
      description={
        invite.inviterName
          ? `${invite.inviterName} invited you to help manage ${invite.householdName}. Members can see and edit all of its expenses, tasks and providers.`
          : `You've been invited to help manage ${invite.householdName}.`
      }
    >
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={() => accept.mutate(token)} disabled={accept.isPending}>
          {accept.isPending ? 'Joining…' : 'Join household'}
        </Button>
        <Button variant="ghost" className="w-full" asChild>
          <Link to="/">Not now</Link>
        </Button>
      </div>
    </AuthCard>
  )
}
