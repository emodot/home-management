import { createBrowserRouter } from 'react-router'
import { AppLayout } from '@/components/app-layout'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { RootLayout } from '@/components/root-layout'
import { RouteError } from '@/components/route-error'
import { AuthCallbackPage } from '@/routes/auth-callback'
import { ExpensesPage } from '@/routes/expenses'
import { BudgetsPage } from '@/routes/budgets'
import { CategoriesPage } from '@/routes/categories'
import { ExpenseDetailPage } from '@/routes/expense-detail'
import { EditExpensePage } from '@/routes/expense-edit'
import { NewExpensePage } from '@/routes/expense-new'
import { InsightsPage } from '@/routes/insights'
import { InvitePage } from '@/routes/invite'
import {
  appLoader,
  authCallbackLoader,
  authedLoader,
  budgetsLoader,
  categoriesLoader,
  expenseDetailLoader,
  expenseFormLoader,
  expensesLoader,
  insightsLoader,
  inviteLoader,
  membersLoader,
  onboardingLoader,
  recentlyDeletedLoader,
  recurringLoader,
  signInLoader,
} from '@/routes/loaders'
import { MembersPage } from '@/routes/members'
import { MorePage } from '@/routes/more'
import { NewHouseholdPage } from '@/routes/new-household'
import { NotFoundPage } from '@/routes/not-found'
import { OnboardingPage } from '@/routes/onboarding'
import { RecentlyDeletedPage } from '@/routes/recently-deleted'
import { RecurringPage } from '@/routes/recurring'
import { EditRecurringPage, NewRecurringPage } from '@/routes/recurring-form'
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
              {
                // Errors in a page (e.g. an unknown expense) render inside the layout.
                errorElement: <RouteError inline />,
                children: [
                  { index: true, loader: expensesLoader, element: <ExpensesPage /> },
                  { path: 'expenses/new', loader: expenseFormLoader, element: <NewExpensePage /> },
                  {
                    path: 'expenses/:expenseId',
                    loader: expenseDetailLoader,
                    element: <ExpenseDetailPage />,
                  },
                  {
                    path: 'expenses/:expenseId/edit',
                    loader: expenseDetailLoader,
                    element: <EditExpensePage />,
                  },
                  { path: 'insights', loader: insightsLoader, element: <InsightsPage /> },
                  { path: 'budgets', loader: budgetsLoader, element: <BudgetsPage /> },
                  { path: 'recurring', loader: recurringLoader, element: <RecurringPage /> },
                  { path: 'recurring/new', loader: recurringLoader, element: <NewRecurringPage /> },
                  {
                    path: 'recurring/:billId/edit',
                    loader: recurringLoader,
                    element: <EditRecurringPage />,
                  },
                  { path: 'categories', loader: categoriesLoader, element: <CategoriesPage /> },
                  {
                    path: 'recently-deleted',
                    loader: recentlyDeletedLoader,
                    element: <RecentlyDeletedPage />,
                  },
                  { path: 'members', loader: membersLoader, element: <MembersPage /> },
                  { path: 'households/new', element: <NewHouseholdPage /> },
                  { path: 'more', element: <MorePage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
