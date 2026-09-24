import { createBrowserRouter } from 'react-router'
import { AppLayout } from '@/components/app-layout'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { RootLayout } from '@/components/root-layout'
import { RouteError } from '@/components/route-error'
import { AuthCallbackPage } from '@/routes/auth-callback'
import { ExpensesPage } from '@/routes/expenses'
import { InvitePage } from '@/routes/invite'
import {
  appLoader,
  authCallbackLoader,
  authedLoader,
  inviteLoader,
  membersLoader,
  onboardingLoader,
  signInLoader,
} from '@/routes/loaders'
import { MembersPage } from '@/routes/members'
import { NewHouseholdPage } from '@/routes/new-household'
import { NotFoundPage } from '@/routes/not-found'
import { OnboardingPage } from '@/routes/onboarding'
import { SignInPage } from '@/routes/sign-in'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <FullPageSpinner />,
    children: [
      { path: 'sign-in', loader: signInLoader, element: <SignInPage /> },
      { path: 'auth/callback', loader: authCallbackLoader, element: <AuthCallbackPage /> },
      {
        // Everything below requires a session.
        id: 'authed',
        loader: authedLoader,
        children: [
          { path: 'onboarding', loader: onboardingLoader, element: <OnboardingPage /> },
          // Works with or without a household (new users join through here).
          { path: 'invite/:token', loader: inviteLoader, element: <InvitePage /> },
          {
            // Requires a household; redirects to onboarding otherwise.
            id: 'app',
            loader: appLoader,
            element: <AppLayout />,
            children: [
              { index: true, element: <ExpensesPage /> },
              { path: 'households/new', element: <NewHouseholdPage /> },
              { path: 'members', loader: membersLoader, element: <MembersPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
