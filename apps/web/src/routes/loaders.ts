import {
  acceptInvite,
  AppError,
  inviteTokenSchema,
  monthRange,
  parseExpenseFilters,
  todayIn,
  yearRange,
  safeNextPath,
  setActiveHousehold,
  type InviteDetails,
} from '@home/shared'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { pickActiveHousehold } from '@/hooks/use-household'
import { getSessionUser } from '@/lib/auth'
import { queryClient } from '@/lib/query-client'
import { errorMessage } from '@/lib/errors'
import { selectedMonth } from '@/lib/insights'
import {
  activityFeedQuery,
  adminAccountsQuery,
  adminHouseholdQuery,
  adminHouseholdsQuery,
  adminOverviewQuery,
  adminUsersQuery,
  budgetsQuery,
  categoriesQuery,
  categoryTotalsQuery,
  expenseListQuery,
  expenseQuery,
  householdsQuery,
  isAppAdminQuery,
  membersQuery,
  pendingExpensesQuery,
  pendingInvitesQuery,
  profileQuery,
  providersQuery,
  providerTotalsQuery,
  providerTasksQuery,
  receiptsQuery,
  recentlyDeletedQuery,
  taskCompletionQuery,
  taskHistoryQuery,
  taskQuery,
  tasksQuery,
  recurringExpensesQuery,
} from '@/lib/queries'
import { supabase } from '@/lib/supabase'

function signInRedirect(request: Request) {
  const url = new URL(request.url)
  const next = url.pathname + url.search
  // The admin area has its own sign-in page.
  const signIn = url.pathname.startsWith('/admin') ? '/admin/sign-in' : '/sign-in'
  const home = signIn === '/sign-in' ? '/' : '/admin'
  return redirect(next === home ? signIn : `${signIn}?next=${encodeURIComponent(next)}`)
}

/** Admin accounts are admin-only: the regular app sends them to the admin area. */
async function redirectAdmins(userId: string) {
  if (await queryClient.query(isAppAdminQuery(userId))) throw redirect('/admin')
}

async function requireUser(request: Request) {
  const user = await getSessionUser()
  if (!user) throw signInRedirect(request)
  return user
}

/** Every signed-in route. Children read the user with `useCurrentUser()`. */
export async function authedLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  // new_email is set while an email change waits for confirmation.
  return { user: { id: user.id, email: user.email ?? '', newEmail: user.new_email ?? null } }
}

/** The main app: needs at least one household, and makes sure one is active. */
export async function appLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  await redirectAdmins(user.id)
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
      queryClient.query(pendingExpensesQuery(householdId)),
      queryClient.query(providersQuery(householdId)),
    ])
  }
  return null
}

export async function expenseFormLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  const completionId = new URL(request.url).searchParams.get('completion')
  if (householdId) {
    await Promise.all([
      completionId && UUID.test(completionId)
        ? queryClient.query(taskCompletionQuery(householdId, completionId))
        : null,
      queryClient.query(providersQuery(householdId)),
      queryClient.query(categoriesQuery(householdId)),
      queryClient.query(membersQuery(householdId)),
    ])
  }
  return null
}

/**
 * For pages about one record (links from emails, shared URLs): returns the household that owns
 * the record, making it the active household first if it isn't. 404 if the user can't see it.
 */
async function householdOfRecord(
  request: Request,
  table: 'expenses' | 'tasks' | 'providers',
  id: string,
): Promise<string> {
  const { user, householdId: activeId } = await requireHousehold(request)
  if (!UUID.test(id)) throw notFound()
  const { data } = await supabase.from(table).select('household_id').eq('id', id).maybeSingle()
  // RLS hides other households' records, so this also covers "not yours".
  if (!data) throw notFound()
  if (data.household_id !== activeId) {
    await setActiveHousehold(supabase, user.id, data.household_id)
    queryClient.setQueryData(profileQuery(user.id).queryKey, (profile) =>
      profile ? { ...profile, active_household_id: data.household_id } : profile,
    )
  }
  return data.household_id
}

export async function expenseDetailLoader({ request, params }: LoaderFunctionArgs) {
  const expenseId = params.expenseId ?? ''
  const householdId = await householdOfRecord(request, 'expenses', expenseId)
  const [expense] = await Promise.all([
    queryClient.query(expenseQuery(householdId, expenseId)),
    queryClient.query(receiptsQuery(householdId, expenseId)),
    queryClient.query(tasksQuery(householdId)),
    queryClient.query(providersQuery(householdId)),
    queryClient.query(categoriesQuery(householdId)),
    queryClient.query(membersQuery(householdId)),
  ])
  if (!expense) throw notFound()
  return null
}

export async function insightsLoader({ request }: LoaderFunctionArgs) {
  const { user, householdId } = await requireHousehold(request)
  if (householdId) {
    const households = await queryClient.query(householdsQuery(user.id))
    const timezone = households.find((h) => h.id === householdId)?.timezone
    const month = selectedMonth(new URL(request.url).searchParams.get('month'), todayIn(timezone))
    await Promise.all([
      queryClient.query(categoryTotalsQuery(householdId, monthRange(`${month}-01`))),
      queryClient.query(categoryTotalsQuery(householdId, monthRange(`${month}-01`, -1))),
      queryClient.query(providerTotalsQuery(householdId, monthRange(`${month}-01`))),
      queryClient.query(providersQuery(householdId)),
      queryClient.query(budgetsQuery(householdId)),
      queryClient.query(categoriesQuery(householdId)),
    ])
  }
  return null
}

export async function budgetsLoader({ request }: LoaderFunctionArgs) {
  const { user, householdId } = await requireHousehold(request)
  if (householdId) {
    const households = await queryClient.query(householdsQuery(user.id))
    const timezone = households.find((h) => h.id === householdId)?.timezone
    await Promise.all([
      queryClient.query(categoryTotalsQuery(householdId, monthRange(todayIn(timezone)))),
      queryClient.query(budgetsQuery(householdId)),
      queryClient.query(categoriesQuery(householdId)),
    ])
  }
  return null
}

export async function recurringLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) {
    await Promise.all([
      queryClient.query(recurringExpensesQuery(householdId)),
      queryClient.query(providersQuery(householdId)),
      queryClient.query(categoriesQuery(householdId)),
      queryClient.query(membersQuery(householdId)),
    ])
  }
  return null
}

export async function providersLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) await queryClient.query(providersQuery(householdId))
  return null
}

export async function providerDetailLoader({ request, params }: LoaderFunctionArgs) {
  const providerId = params.providerId ?? ''
  const householdId = await householdOfRecord(request, 'providers', providerId)
  const user = await requireUser(request)
  const households = await queryClient.query(householdsQuery(user.id))
  const timezone = households.find((h) => h.id === householdId)?.timezone
  await Promise.all([
    queryClient.query(providersQuery(householdId)),
    queryClient.query(providerTotalsQuery(householdId)),
    queryClient.query(providerTotalsQuery(householdId, yearRange(todayIn(timezone)))),
    queryClient.infiniteQuery(expenseListQuery(householdId, { provider: providerId })),
    queryClient.query(providerTasksQuery(householdId, providerId)),
    queryClient.query(categoriesQuery(householdId)),
  ])
  return null
}

export async function tasksLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) {
    await Promise.all([
      queryClient.query(tasksQuery(householdId)),
      queryClient.query(membersQuery(householdId)),
      queryClient.query(providersQuery(householdId)),
      queryClient.query(categoriesQuery(householdId)),
    ])
  }
  return null
}

export async function taskDetailLoader({ request, params }: LoaderFunctionArgs) {
  const taskId = params.taskId ?? ''
  const householdId = await householdOfRecord(request, 'tasks', taskId)
  const [task] = await Promise.all([
    queryClient.query(taskQuery(householdId, taskId)),
    queryClient.query(taskHistoryQuery(householdId, taskId)),
    queryClient.query(membersQuery(householdId)),
    queryClient.query(providersQuery(householdId)),
    queryClient.query(categoriesQuery(householdId)),
  ])
  if (!task) throw notFound()
  return null
}

export async function categoriesLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) await queryClient.query(categoriesQuery(householdId))
  return null
}

export async function recentlyDeletedLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) {
    await Promise.all([
      queryClient.query(recentlyDeletedQuery(householdId)),
      queryClient.query(providersQuery(householdId)),
    ])
  }
  return null
}

export type InviteLoaderData =
  { status: 'ok'; token: string; invite: InviteDetails } | { status: 'error'; message: string }

/** Looks the invite up (without accepting) so the page can ask "Join X?". */
export async function inviteLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<InviteLoaderData> {
  const user = await requireUser(request)
  await redirectAdmins(user.id)
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
  await redirectAdmins(user.id)
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

export async function activityLoader({ request }: LoaderFunctionArgs) {
  const { householdId } = await requireHousehold(request)
  if (householdId) {
    await Promise.all([
      queryClient.infiniteQuery(activityFeedQuery(householdId)),
      queryClient.query(membersQuery(householdId)),
    ])
  }
  return null
}

export async function profileLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  await queryClient.query(profileQuery(user.id))
  return null
}

/** The admin area: app admins only. Everyone else gets a plain 404. */
export async function adminLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  if (!(await queryClient.query(isAppAdminQuery(user.id)))) throw notFound()
  // New admins start with a temporary password and must choose their own first.
  const mustChange = user.user_metadata.must_change_password === true
  if (mustChange && new URL(request.url).pathname !== '/admin/account') {
    throw redirect('/admin/account')
  }
  return { email: user.email ?? '', mustChangePassword: mustChange }
}

/** Already signed in as an admin: straight to the admin area. */
export async function adminSignInLoader({ request }: LoaderFunctionArgs) {
  const next = safeNextPath(new URL(request.url).searchParams.get('next'))
  const user = await getSessionUser()
  if (user && (await queryClient.query(isAppAdminQuery(user.id)))) {
    throw redirect(next.startsWith('/admin') ? next : '/admin')
  }
  return { next: next.startsWith('/admin') ? next : '/admin' }
}

/** Search and page from the URL, shared by the admin lists. */
export function adminListParams(request: Request) {
  const params = new URL(request.url).searchParams
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  return { search: params.get('q') ?? '', page }
}

export async function adminOverviewLoader() {
  await queryClient.query(adminOverviewQuery())
  return null
}

export async function adminUsersLoader({ request }: LoaderFunctionArgs) {
  const { search, page } = adminListParams(request)
  await queryClient.query(adminUsersQuery(search, page))
  return null
}

export async function adminHouseholdsLoader({ request }: LoaderFunctionArgs) {
  const { search, page } = adminListParams(request)
  await queryClient.query(adminHouseholdsQuery(search, page))
  return null
}

export async function adminHouseholdLoader({ params }: LoaderFunctionArgs) {
  const householdId = params.householdId ?? ''
  if (!UUID.test(householdId)) throw notFound()
  await queryClient.query(adminHouseholdQuery(householdId))
  return null
}

export async function adminAccountsLoader() {
  await queryClient.query(adminAccountsQuery())
  return null
}
