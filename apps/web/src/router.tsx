import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppLayout } from '@/components/app-layout'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { RootLayout } from '@/components/root-layout'
import { RouteError } from '@/components/route-error'
import {
  activityLoader,
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
  profileLoader,
  providerDetailLoader,
  providersLoader,
  recentlyDeletedLoader,
  recurringLoader,
  signInLoader,
  taskDetailLoader,
  tasksLoader,
} from '@/routes/loaders'
import { NotFoundPage } from '@/routes/not-found'

/**
 * Pages are code-split: each route downloads its page module on first visit, in parallel with
 * its loader. Loaders stay in the main bundle.
 */
function page<M>(load: () => Promise<M>, name: keyof M) {
  return { Component: async () => (await load())[name] as ComponentType }
}

const routes = {
  activity: () => import('@/routes/activity'),
  authCallback: () => import('@/routes/auth-callback'),
  budgets: () => import('@/routes/budgets'),
  categories: () => import('@/routes/categories'),
  expenseDetail: () => import('@/routes/expense-detail'),
  expenseEdit: () => import('@/routes/expense-edit'),
  expenseNew: () => import('@/routes/expense-new'),
  expenses: () => import('@/routes/expenses'),
  insights: () => import('@/routes/insights'),
  invite: () => import('@/routes/invite'),
  members: () => import('@/routes/members'),
  more: () => import('@/routes/more'),
  newHousehold: () => import('@/routes/new-household'),
  onboarding: () => import('@/routes/onboarding'),
  providerDetail: () => import('@/routes/provider-detail'),
  providerForm: () => import('@/routes/provider-form'),
  profile: () => import('@/routes/profile'),
  providers: () => import('@/routes/providers'),
  recentlyDeleted: () => import('@/routes/recently-deleted'),
  recurring: () => import('@/routes/recurring'),
  recurringForm: () => import('@/routes/recurring-form'),
  resetPassword: () => import('@/routes/reset-password'),
  signIn: () => import('@/routes/sign-in'),
  taskDetail: () => import('@/routes/task-detail'),
  taskForm: () => import('@/routes/task-form'),
  tasks: () => import('@/routes/tasks'),
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <FullPageSpinner />,
    children: [
      { path: 'sign-in', loader: signInLoader, lazy: page(routes.signIn, 'SignInPage') },
      {
        path: 'auth/callback',
        loader: authCallbackLoader,
        lazy: page(routes.authCallback, 'AuthCallbackPage'),
      },
      {
        // Everything below requires a session.
        id: 'authed',
        loader: authedLoader,
        children: [
          {
            path: 'onboarding',
            loader: onboardingLoader,
            lazy: page(routes.onboarding, 'OnboardingPage'),
          },
          // Password-reset emails sign you in and land here.
          { path: 'reset-password', lazy: page(routes.resetPassword, 'ResetPasswordPage') },
          // Works with or without a household (new users join through here).
          { path: 'invite/:token', loader: inviteLoader, lazy: page(routes.invite, 'InvitePage') },
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
                  {
                    index: true,
                    loader: expensesLoader,
                    lazy: page(routes.expenses, 'ExpensesPage'),
                  },
                  {
                    path: 'expenses/new',
                    loader: expenseFormLoader,
                    lazy: page(routes.expenseNew, 'NewExpensePage'),
                  },
                  {
                    path: 'expenses/:expenseId',
                    loader: expenseDetailLoader,
                    lazy: page(routes.expenseDetail, 'ExpenseDetailPage'),
                  },
                  {
                    path: 'expenses/:expenseId/edit',
                    loader: expenseDetailLoader,
                    lazy: page(routes.expenseEdit, 'EditExpensePage'),
                  },
                  {
                    path: 'insights',
                    loader: insightsLoader,
                    lazy: page(routes.insights, 'InsightsPage'),
                  },
                  {
                    path: 'activity',
                    loader: activityLoader,
                    lazy: page(routes.activity, 'ActivityPage'),
                  },
                  {
                    path: 'budgets',
                    loader: budgetsLoader,
                    lazy: page(routes.budgets, 'BudgetsPage'),
                  },
                  { path: 'tasks', loader: tasksLoader, lazy: page(routes.tasks, 'TasksPage') },
                  {
                    path: 'tasks/new',
                    loader: tasksLoader,
                    lazy: page(routes.taskForm, 'NewTaskPage'),
                  },
                  {
                    path: 'tasks/:taskId',
                    loader: taskDetailLoader,
                    lazy: page(routes.taskDetail, 'TaskDetailPage'),
                  },
                  {
                    path: 'tasks/:taskId/edit',
                    loader: taskDetailLoader,
                    lazy: page(routes.taskForm, 'EditTaskPage'),
                  },
                  {
                    path: 'providers',
                    loader: providersLoader,
                    lazy: page(routes.providers, 'ProvidersPage'),
                  },
                  {
                    path: 'providers/new',
                    loader: providersLoader,
                    lazy: page(routes.providerForm, 'NewProviderPage'),
                  },
                  {
                    path: 'providers/:providerId',
                    loader: providerDetailLoader,
                    lazy: page(routes.providerDetail, 'ProviderDetailPage'),
                  },
                  {
                    path: 'providers/:providerId/edit',
                    loader: providerDetailLoader,
                    lazy: page(routes.providerForm, 'EditProviderPage'),
                  },
                  {
                    path: 'recurring',
                    loader: recurringLoader,
                    lazy: page(routes.recurring, 'RecurringPage'),
                  },
                  {
                    path: 'recurring/new',
                    loader: recurringLoader,
                    lazy: page(routes.recurringForm, 'NewRecurringPage'),
                  },
                  {
                    path: 'recurring/:billId/edit',
                    loader: recurringLoader,
                    lazy: page(routes.recurringForm, 'EditRecurringPage'),
                  },
                  {
                    path: 'categories',
                    loader: categoriesLoader,
                    lazy: page(routes.categories, 'CategoriesPage'),
                  },
                  {
                    path: 'recently-deleted',
                    loader: recentlyDeletedLoader,
                    lazy: page(routes.recentlyDeleted, 'RecentlyDeletedPage'),
                  },
                  {
                    path: 'members',
                    loader: membersLoader,
                    lazy: page(routes.members, 'MembersPage'),
                  },
                  {
                    path: 'households/new',
                    lazy: page(routes.newHousehold, 'NewHouseholdPage'),
                  },
                  { path: 'more', lazy: page(routes.more, 'MorePage') },
                  {
                    path: 'profile',
                    loader: profileLoader,
                    lazy: page(routes.profile, 'ProfilePage'),
                  },
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
