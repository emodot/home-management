import {
  acceptInvite,
  AppError,
  inviteTokenSchema,
  parseExpenseFilters,
  safeNextPath,
  setActiveHousehold,
  type InviteDetails,
} from '@home/shared'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { pickActiveHousehold } from '@/hooks/use-household'
import { getSessionUser } from '@/lib/auth'
import { queryClient } from '@/lib/query-client'
import { errorMessage } from '@/lib/errors'
import {
  categoriesQuery,
  expenseListQuery,
  expenseQuery,
  householdsQuery,
  membersQuery,
  pendingInvitesQuery,
  profileQuery,
  receiptsQuery,
  recentlyDeletedQuery,
} from '@/lib/queries'
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

/** Same choice as AppLayout, for loaders that need the household up front. */
async function activeHouseholdId(userId: string) {
  const [profile, households] = await Promise.all([
    queryClient.query(profileQuery(userId)),
    queryClient.query(householdsQuery(userId)),
  ])
  return pickActiveHousehold(profile, households)?.id
}

/** For pages inside the app: the user and their active household (undefined only mid-redirect). */
async function requireHousehold(request: Request) {
  const user = await requireUser(request)
  return { user, householdId: await activeHouseholdId(user.id) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function notFound(): Response {
  return new Response('Not found', { status: 404, statusText: 'Not found' })
}

export async function membersLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) {
    await Promise.all([
      queryClient.query(membersQuery(householdId)),
      queryClient.query(pendingInvitesQuery(householdId)),
    ])
  }
  return null
}

export async function expensesLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) {
    const filters = parseExpenseFilters(Object.fromEntries(new URL(request.url).searchParams))
    await Promise.all([
      queryClient.query(categoriesQuery(householdId)),
      queryClient.query(membersQuery(householdId)),
      queryClient.infiniteQuery(expenseListQuery(householdId, filters)),
    ])
  }
  return null
}

export async function expenseFormLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) {
    await Promise.all([
      queryClient.query(categoriesQuery(householdId)),
      queryClient.query(membersQuery(householdId)),
    ])
  }
  return null
}

export async function expenseDetailLoader({ request, params }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  const expenseId = params.expenseId ?? ''
  if (!UUID.test(expenseId)) throw notFound()
  if (householdId) {
    const [expense] = await Promise.all([
      queryClient.query(expenseQuery(householdId, expenseId)),
      queryClient.query(receiptsQuery(householdId, expenseId)),
      queryClient.query(categoriesQuery(householdId)),
      queryClient.query(membersQuery(householdId)),
    ])
    // RLS hides other households' expenses, so this also covers "not yours".
    if (!expense) throw notFound()
  }
  return null
}

export async function categoriesLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) await queryClient.query(categoriesQuery(householdId))
  return null
}

export async function recentlyDeletedLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) await queryClient.query(recentlyDeletedQuery(householdId))
  return null
}

export type InviteLoaderData =
  { status: 'ok'; token: string; invite: InviteDetails } | { status: 'error'; message: string }

/** Looks the invite up (without accepting) so the page can ask "Join X?". */
export async function inviteLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<InviteLoaderData> {
  await requireUser(request)
  const token = inviteTokenSchema.safeParse(params.token)
  if (!token.success) {
    return { status: 'error', message: new AppError('invite_not_found').message }
  }
  try {
    const invite = await acceptInvite(supabase, { token: token.data, preview: true })
    return { status: 'ok', token: token.data, invite }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
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
  return { next, forInvite: next.startsWith('/invite/') }
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
