import {
  EXPENSE_PAGE_SIZE,
  expenseFiltersToParams,
  getCategoryTotals,
  getExpense,
  getProfile,
  getProviderTotals,
  getReceiptUrls,
  listBudgets,
  listCategories,
  listExpenses,
  listMembers,
  listMyHouseholds,
  listPendingExpenses,
  listPendingInvites,
  listProviders,
  listReceipts,
  listRecentlyDeleted,
  listRecurringExpenses,
  type ExpenseFilters,
} from '@home/shared'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { supabase } from './supabase'

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(supabase, userId),
  })

export const householdsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['households', userId],
    queryFn: () => listMyHouseholds(supabase),
  })

/** Everything scoped to one household lives under this key, so it can be dropped in one go. */
export const householdKey = (householdId: string) => ['household', householdId] as const

export const membersQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'members'],
    queryFn: () => listMembers(supabase, householdId),
  })

export const pendingInvitesQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'invites'],
    queryFn: () => listPendingInvites(supabase, householdId),
  })

export const categoriesQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'categories'],
    queryFn: () => listCategories(supabase, householdId),
  })

/** Prefix for every expense-related query, so one invalidation refreshes lists and details. */
export const expensesKey = (householdId: string) =>
  [...householdKey(householdId), 'expenses'] as const

export const expenseListQuery = (householdId: string, filters: ExpenseFilters) =>
  infiniteQueryOptions({
    queryKey: [...expensesKey(householdId), 'list', expenseFiltersToParams(filters)],
    queryFn: ({ pageParam }) => listExpenses(supabase, householdId, filters, { offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < EXPENSE_PAGE_SIZE ? undefined : pages.length * EXPENSE_PAGE_SIZE,
  })

export const expenseQuery = (householdId: string, expenseId: string) =>
  queryOptions({
    queryKey: [...expensesKey(householdId), 'detail', expenseId],
    queryFn: () => getExpense(supabase, expenseId),
  })

export const receiptsQuery = (householdId: string, expenseId: string) =>
  queryOptions({
    queryKey: [...expensesKey(householdId), 'receipts', expenseId],
    queryFn: () => listReceipts(supabase, expenseId),
  })

/** Signed URLs live 10 minutes; refresh them well before that. */
export const receiptUrlsQuery = (householdId: string, paths: string[]) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'receipt-urls', paths],
    queryFn: () => getReceiptUrls(supabase, paths),
    staleTime: 5 * 60_000,
    gcTime: 8 * 60_000,
    enabled: paths.length > 0,
  })

export const recentlyDeletedQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...expensesKey(householdId), 'deleted'],
    queryFn: () => listRecentlyDeleted(supabase, householdId),
  })

/** Under expensesKey so any expense change refreshes the dashboard. */
export const categoryTotalsQuery = (householdId: string, range: { from: string; to: string }) =>
  queryOptions({
    queryKey: [...expensesKey(householdId), 'totals', range.from, range.to],
    queryFn: () => getCategoryTotals(supabase, householdId, range),
  })

export const budgetsQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'budgets'],
    queryFn: () => listBudgets(supabase, householdId),
  })

export const pendingExpensesQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...expensesKey(householdId), 'pending'],
    queryFn: () => listPendingExpenses(supabase, householdId),
  })

export const recurringExpensesQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'recurring'],
    queryFn: () => listRecurringExpenses(supabase, householdId),
  })

export const providersQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'providers'],
    queryFn: () => listProviders(supabase, householdId),
  })

/** Under expensesKey so expense changes refresh provider totals. */
export const providerTotalsQuery = (
  householdId: string,
  range: { from?: string; to?: string } = {},
) =>
  queryOptions({
    queryKey: [
      ...expensesKey(householdId),
      'provider-totals',
      range.from ?? null,
      range.to ?? null,
    ],
    queryFn: () => getProviderTotals(supabase, householdId, range),
  })
