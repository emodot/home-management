import { safeNextPath, setActiveHousehold } from '@home/shared'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { getSessionUser } from '@/lib/auth'
import { queryClient } from '@/lib/query-client'
import { householdsQuery, profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

function signInRedirect(request: Request) {
  const url = new URL(request.url)
  const next = url.pathname + url.search
  return redirect(next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`)
}

async function requireUser(request: Request) {
  const user = await getSessionUser()
  if (!user) throw signInRedirect(request)
  return user
}

/** Every signed-in route. Children read the user with `useCurrentUser()`. */
export async function authedLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  return { user: { id: user.id, email: user.email ?? '' } }
}

/** The main app: needs at least one household, and makes sure one is active. */
export async function appLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const [profile, households] = await Promise.all([
    queryClient.query(profileQuery(user.id)),
    queryClient.query(householdsQuery(user.id)),
  ])

  const first = households[0]
  if (!first) throw redirect('/onboarding')

  if (!households.some((h) => h.id === profile.active_household_id)) {
    await setActiveHousehold(supabase, user.id, first.id)
    queryClient.setQueryData(profileQuery(user.id).queryKey, {
      ...profile,
      active_household_id: first.id,
    })
  }
  return null
}

/** First run: only for users who don't belong to a household yet. */
export async function onboardingLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const [households] = await Promise.all([
    queryClient.query(householdsQuery(user.id)),
    queryClient.query(profileQuery(user.id)),
  ])
  if (households.length > 0) throw redirect('/')
  return null
}

export async function signInLoader({ request }: LoaderFunctionArgs) {
  const next = safeNextPath(new URL(request.url).searchParams.get('next'))
  if (await getSessionUser()) throw redirect(next)
  return { next }
}

/**
 * Magic links and OAuth land here. supabase-js reads the session from the URL while
 * initialising, so by the time getSession() resolves we're either signed in or have an error.
 */
export async function authCallbackLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const next = safeNextPath(url.searchParams.get('next'))
  if (await getSessionUser()) throw redirect(next)

  // Errors arrive in the hash (implicit flow) or the query string (OAuth).
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const message =
    hash.get('error_description') ??
    url.searchParams.get('error_description') ??
    'This sign-in link is invalid or has expired.'
  return { message, next }
}
