import { Link, useLoaderData } from 'react-router'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import type { authCallbackLoader } from './loaders'

/** Only rendered when sign-in failed; success redirects in the loader. */
export function AuthCallbackPage() {
  const { message, next } = useLoaderData<typeof authCallbackLoader>()
  const signInHref = next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`

  return (
    <AuthCard title="Couldn't sign you in" description={message}>
      <Button asChild className="w-full">
        <Link to={signInHref}>Try again</Link>
      </Button>
    </AuthCard>
  )
}
