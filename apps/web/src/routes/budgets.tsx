import {
  addMonths,
  budgetInputSchema,
  categoryTree,
  formatMoney,
  formatMonth,
  monthRange,
  setBudget,
  spendingByCategory,
  todayIn,
  totalBudgetMinor,
  type Category,
} from '@home/shared'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { BudgetMeter } from '@/components/budget-meter'
import { CategoryIcon } from '@/components/category-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveHousehold } from '@/hooks/use-household'
import { formatAmountInput } from '@/lib/amount'
import { errorMessage } from '@/lib/errors'
import { budgetMonthParam } from '@/lib/insights'
import { budgetsKey, budgetsQuery, categoriesQuery, categoryTotalsQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

function BudgetRow({
  category,
  label = category.name,
  isSub = false,
  note,
  budgetMinor,
  spentMinor,
  spentLabel,
  currency,
  readOnly,
  onSave,
}: {
  category: Category
  /** Defaults to the category's name; "Parent › Sub" when shown without its parent. */
  label?: string
  /** Indented under its parent. */
  isSub?: boolean
  note?: string
  budgetMinor: number | undefined
  spentMinor: number
  /** "spent this month", "spent in October 2026". */
  spentLabel: string
  currency: string
  /** Past months show their budget but can't change it. */
  readOnly: boolean
  onSave: (amountMinor: number | null) => void
}) {
  const saved = budgetMinor === undefined ? '' : formatAmountInput(budgetMinor)
  const [value, setValue] = useState(saved)
  const [error, setError] = useState<string | null>(null)

  // Follow saved changes (e.g. from another member) unless the field is being edited.
  const [lastSaved, setLastSaved] = useState(saved)
  if (saved !== lastSaved) {
    setLastSaved(saved)
    setValue(saved)
  }

  function commit() {
    const parsed = budgetInputSchema.safeParse(value)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid amount')
      return
    }
    setError(null)
    setValue(parsed.data === null ? '' : formatAmountInput(parsed.data))
    if (parsed.data !== (budgetMinor ?? null)) onSave(parsed.data)
  }

  return (
    <li
      className={
        isSub ? 'flex flex-col gap-3 py-3 pr-4 pl-7 sm:pl-12' : 'flex flex-col gap-3 px-4 py-4'
      }
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={category.icon} className={isSub ? 'size-7' : undefined} />
        <div className="min-w-0 flex-1">
          <p className={isSub ? 'truncate text-sm font-medium' : 'truncate font-medium'}>{label}</p>
          <p className="text-sm text-muted-foreground">
            {formatMoney(spentMinor, currency)} {spentLabel}
          </p>
        </div>
        {readOnly ? (
          <p className="shrink-0 text-right text-sm tabular-nums">
            {budgetMinor === undefined ? (
              <span className="text-muted-foreground">No budget</span>
            ) : (
              <span className="font-medium">{formatMoney(budgetMinor, currency)}</span>
            )}
          </p>
        ) : (
          <div className="relative w-36 shrink-0">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              ₦
            </span>
            <Input
              inputMode="decimal"
              placeholder="No budget"
              aria-label={`Monthly budget for ${label}`}
              aria-invalid={!!error}
              className="pl-7 text-right tabular-nums"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {budgetMinor !== undefined && (
        <BudgetMeter spentMinor={spentMinor} budgetMinor={budgetMinor} currency={currency} />
      )}
    </li>
  )
}

export function BudgetsPage() {
  const household = useActiveHousehold()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const thisMonth = todayIn(household.timezone).slice(0, 7)
  const month = budgetMonthParam(searchParams.get('month'), thisMonth)
  const isPast = month < thisMonth
  const range = monthRange(`${month}-01`)
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const budgets = useSuspenseQuery(budgetsQuery(household.id, month)).data
  const totals = useSuspenseQuery(categoryTotalsQuery(household.id, range)).data
  const spentLabel =
    month === thisMonth ? 'spent this month' : isPast ? `spent in ${formatMonth(month)}` : 'so far'

  function goTo(target: string) {
    setSearchParams(target === thisMonth ? {} : { month: target }, { replace: true })
  }

  const budgetByCategory = new Map(budgets.map((b) => [b.category_id, b.monthly_amount_minor]))
  // A top-level category's budget includes its sub-categories' spending; a sub's is its own.
  const lookup = new Map(categories.map((c) => [c.id, c]))
  const spentByCategory = spendingByCategory(totals, lookup)
  // Archived categories stay listed only while they still have a budget, so it can be removed.
  const listed = (c: Category) => !c.is_archived || budgetByCategory.has(c.id)
  const totalBudget = totalBudgetMinor(budgets, lookup)

  const { queryKey } = budgetsQuery(household.id, month)
  const save = useMutation({
    mutationFn: ({ categoryId, amountMinor }: { categoryId: string; amountMinor: number | null }) =>
      setBudget(supabase, household.id, categoryId, month, amountMinor),
    onMutate: async ({ categoryId, amountMinor }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old = []) => {
        const others = old.filter((b) => b.category_id !== categoryId)
        return amountMinor === null
          ? others
          : [
              ...others,
              {
                id: old.find((b) => b.category_id === categoryId)?.id ?? `pending-${categoryId}`,
                household_id: household.id,
                category_id: categoryId,
                monthly_amount_minor: amountMinor,
                currency: household.currency,
                starts_on: `${month}-01`,
              },
            ]
      })
      return { previous }
    },
    onSuccess: (_data, { amountMinor }) =>
      toast.success(amountMinor === null ? 'Budget removed' : 'Budget saved'),
    onError: (error, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
      toast.error(`Couldn't save the budget. ${errorMessage(error)}`)
    },
    // A change carries forward, so later months' budgets change too.
    onSettled: () => queryClient.invalidateQueries({ queryKey: budgetsKey(household.id) }),
  })

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => goTo(addMonths(month, -1))}
              aria-label={`Show ${formatMonth(addMonths(month, -1))}`}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => goTo(addMonths(month, 1))}
              aria-label={`Show ${formatMonth(addMonths(month, 1))}`}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {isPast
            ? `The budgets ${formatMonth(month)} had. Past months can't be changed.`
            : `A budget set for ${month === thisMonth ? 'this month' : formatMonth(month)} applies from then on, until you change it. Leave a field empty for no budget.`}{' '}
          A category's budget includes what's spent on its sub-categories. Spending counts toward
          the month an expense is for. Bars turn amber at 80% and red when you go over.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {totalBudget > 0 && (
            <p>
              Total budget for {formatMonth(month)}:{' '}
              <span className="font-semibold">{formatMoney(totalBudget, household.currency)}</span>
            </p>
          )}
          {month !== thisMonth && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => goTo(thisMonth)}>
              Back to this month
            </Button>
          )}
          {month === thisMonth && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => goTo(addMonths(thisMonth, 1))}
            >
              Plan {formatMonth(addMonths(thisMonth, 1))}
            </Button>
          )}
        </div>
      </div>
      <ul className="divide-y rounded-xl border">
        {categoryTree(categories).flatMap(({ category, children }) => {
          const subs = children.filter(listed)
          const showParent = listed(category)
          const parentBudget = budgetByCategory.get(category.id)
          const subBudgets = subs.reduce((sum, c) => sum + (budgetByCategory.get(c.id) ?? 0), 0)
          const row = (c: Category, props: { isSub?: boolean; label?: string; note?: string }) => (
            <BudgetRow
              key={c.id}
              category={c}
              {...props}
              budgetMinor={budgetByCategory.get(c.id)}
              spentMinor={spentByCategory.get(c.id) ?? 0}
              spentLabel={spentLabel}
              currency={household.currency}
              readOnly={isPast}
              onSave={(amountMinor) => save.mutate({ categoryId: c.id, amountMinor })}
            />
          )
          return [
            showParent &&
              row(category, {
                note:
                  parentBudget !== undefined && subBudgets > parentBudget
                    ? `Its sub-category budgets add up to ${formatMoney(subBudgets, household.currency)}, more than this budget.`
                    : undefined,
              }),
            ...subs.map((c) =>
              row(c, showParent ? { isSub: true } : { label: `${category.name} › ${c.name}` }),
            ),
          ]
        })}
      </ul>
    </div>
  )
}
