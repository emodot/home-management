import {
  expenseFiltersToParams,
  expensesToCsv,
  formatDate,
  formatMoney,
  formatMonth,
  listAllExpenses,
  monthOf,
  parseExpenseFilters,
  todayIn,
  type Expense,
  type ExpenseFilters,
} from '@home/shared'
import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { DownloadIcon, PaperclipIcon, PlusIcon, ReceiptTextIcon, SearchIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { EmptyState } from '@/components/empty-state'
import { ExpenseFiltersSheet, FilterChips } from '@/components/expense-filters'
import { PendingExpenses } from '@/components/pending-expenses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveHousehold } from '@/hooks/use-household'
import { useProviderLookup } from '@/hooks/use-providers'
import { downloadTextFile, slugify } from '@/lib/download'
import { errorMessage } from '@/lib/errors'
import { describeFilters } from '@/lib/expense-filter-labels'
import { useCategoryLookup, useMemberNames } from '@/hooks/use-lookups'
import {
  categoriesQuery,
  expenseListQuery,
  membersQuery,
  pendingExpensesQuery,
} from '@/lib/queries'
import { supabase } from '@/lib/supabase'

interface MonthGroup {
  month: string
  expenses: Expense[]
  totalMinor: number
  /** False while more of this month may still be on the next page. */
  complete: boolean
}

function groupByMonth(expenses: Expense[], hasMore: boolean): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const expense of expenses) {
    const month = monthOf(expense.occurredOn)
    let group = groups.at(-1)
    if (group?.month !== month) {
      group = { month, expenses: [], totalMinor: 0, complete: true }
      groups.push(group)
    }
    group.expenses.push(expense)
    group.totalMinor += expense.amountMinor
  }
  const last = groups.at(-1)
  if (last && hasMore) last.complete = false
  return groups
}

/** Keeps the search box responsive and only updates the URL after typing pauses. */
function useDebouncedSearch(value: string | undefined, onChange: (q: string) => void) {
  const [text, setText] = useState(value ?? '')
  const emit = useEffectEvent(onChange)

  // Follow outside changes to the URL (back/forward, "Clear all"), but don't fight the user's
  // typing: "diesel " and "diesel" are the same search.
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    if ((value ?? '') !== text.trim()) setText(value ?? '')
  }

  useEffect(() => {
    if (text.trim() === (value ?? '')) return
    const timer = setTimeout(() => emit(text), 300)
    return () => clearTimeout(timer)
  }, [text, value])

  return [text, setText] as const
}

/** Downloads every expense matching the current filters (not just the loaded pages) as CSV. */
function ExportButton({ filters }: { filters: ExpenseFilters }) {
  const household = useActiveHousehold()
  const categories = useCategoryLookup(household.id)
  const memberNames = useMemberNames(household.id)
  const providers = useProviderLookup(household.id)
  const [busy, setBusy] = useState(false)

  async function exportCsv() {
    setBusy(true)
    try {
      const expenses = await listAllExpenses(supabase, household.id, filters)
      const csv = expensesToCsv(expenses, {
        category: (id) => categories.get(id)?.name ?? '',
        person: (id) => (id ? (memberNames.get(id) ?? 'Former member') : ''),
        provider: (id) => (id ? (providers.get(id)?.name ?? '') : ''),
      })
      downloadTextFile(
        `expenses-${slugify(household.name)}-${todayIn(household.timezone)}.csv`,
        csv,
      )
      toast.success(`Exported ${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`)
    } catch (error) {
      toast.error(`Couldn't export. ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={busy}>
      <DownloadIcon aria-hidden />
      {busy ? 'Exporting…' : 'Export'}
    </Button>
  )
}

export function ExpensesPage() {
  const household = useActiveHousehold()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseExpenseFilters(Object.fromEntries(searchParams))

  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const categoryLookup = useCategoryLookup(household.id)
  const memberNames = useMemberNames(household.id)
  const providerLookup = useProviderLookup(household.id)
  const providerNames = useMemo(
    () => new Map([...providerLookup].map(([id, p]) => [id, p.name])),
    [providerLookup],
  )
  const list = useSuspenseInfiniteQuery(expenseListQuery(household.id, filters))
  const pendingCount = useSuspenseQuery(pendingExpensesQuery(household.id)).data.length

  const expenses = useMemo(() => list.data.pages.flat(), [list.data])
  const groups = useMemo(
    () => groupByMonth(expenses, list.hasNextPage),
    [expenses, list.hasNextPage],
  )

  function applyFilters(next: ExpenseFilters) {
    setSearchParams(expenseFiltersToParams(next), { replace: true })
  }

  const [search, setSearch] = useDebouncedSearch(filters.q, (q) =>
    applyFilters({ ...filters, q: q.trim() || undefined }),
  )

  const chips = describeFilters(filters, {
    categories: categoryLookup,
    memberNames,
    providerNames,
    today: todayIn(household.timezone),
  })
  const hasFilters = chips.length > 0 || !!filters.q

  // Load the next page when the end of the list scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (expenses.length === 0 && !hasFilters && pendingCount === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <EmptyState
          icon={ReceiptTextIcon}
          title="Track your first expense"
          action={
            <Button asChild>
              <Link to="/expenses/new">
                <PlusIcon aria-hidden />
                Add expense
              </Link>
            </Button>
          }
        >
          Log what {household.name} spends on power, diesel, repairs and more, and keep every
          receipt in one place.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <div className="flex gap-2">
          {expenses.length > 0 && <ExportButton filters={filters} />}
          <ExpenseFiltersSheet
            filters={filters}
            // The search box owns `q`; the sheet only changes the other filters.
            onApply={(next) => applyFilters({ ...next, q: filters.q })}
            categories={categories}
            members={members.map((m) => ({
              id: m.user_id,
              name: m.profile.full_name ?? m.profile.email,
            }))}
            providers={[...providerLookup.values()]
              .filter((p) => p.deleted_at === null)
              .map((p) => ({ id: p.id, name: p.name }))}
            timezone={household.timezone}
          />
        </div>
      </div>

      <PendingExpenses />

      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search descriptions and notes"
          aria-label="Search expenses"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <FilterChips
        chips={chips}
        onRemove={(key) =>
          applyFilters(
            key === 'period'
              ? { ...filters, from: undefined, to: undefined }
              : { ...filters, [key]: undefined },
          )
        }
        // The search box picks up the cleared `q` from the URL once the navigation lands.
        onClear={() => applyFilters({})}
      />

      {expenses.length === 0 && !hasFilters ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Confirmed expenses will show up here.
        </p>
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No expenses match"
          size="sm"
          action={
            <Button variant="outline" onClick={() => applyFilters({})}>
              Clear filters
            </Button>
          }
        >
          Try a different search or fewer filters.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.month} aria-labelledby={`month-${group.month}`}>
              <div className="sticky top-14 z-10 -mx-4 flex items-baseline justify-between bg-background/95 px-4 py-2 backdrop-blur md:mx-0 md:px-0">
                <h2 id={`month-${group.month}`} className="text-sm font-semibold">
                  {formatMonth(group.month)}
                </h2>
                {group.complete && (
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">
                    {formatMoney(group.totalMinor, household.currency)}
                  </span>
                )}
              </div>
              <ul className="divide-y overflow-hidden rounded-xl border">
                {group.expenses.map((expense) => {
                  const category = categoryLookup.get(expense.categoryId)
                  const payer = expense.paidBy
                    ? (memberNames.get(expense.paidBy) ?? 'Former member')
                    : null
                  return (
                    <li key={expense.id}>
                      <Link
                        to={`/expenses/${expense.id}`}
                        className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                      >
                        <CategoryIcon icon={category?.icon} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{expense.description}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {[
                              category?.name,
                              formatDate(expense.occurredOn, { day: 'numeric', month: 'short' }),
                              payer,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-semibold tabular-nums">
                            {formatMoney(expense.amountMinor, expense.currency)}
                          </span>
                          {expense.receiptCount > 0 && (
                            <PaperclipIcon
                              className="size-3.5 text-muted-foreground"
                              aria-label={`${expense.receiptCount} receipt${expense.receiptCount === 1 ? '' : 's'}`}
                            />
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          <div ref={sentinel} />
          {list.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
