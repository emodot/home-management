import {
  budgetInputSchema,
  categoryTree,
  formatMoney,
  monthRange,
  setBudget,
  spendingByCategory,
  todayIn,
  totalBudgetMinor,
  type Category,
} from '@home/shared'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { BudgetMeter } from '@/components/budget-meter'
import { CategoryIcon } from '@/components/category-icon'
import { Input } from '@/components/ui/input'
import { useActiveHousehold } from '@/hooks/use-household'
import { formatAmountInput } from '@/lib/amount'
import { errorMessage } from '@/lib/errors'
import { budgetsQuery, categoriesQuery, categoryTotalsQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

function BudgetRow({
  category,
  label = category.name,
  isSub = false,
  note,
  budgetMinor,
  spentMinor,
  currency,
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
  currency: string
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
            {formatMoney(spentMinor, currency)} spent this month
          </p>
        </div>
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
  const range = monthRange(todayIn(household.timezone))
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const budgets = useSuspenseQuery(budgetsQuery(household.id)).data
  const totals = useSuspenseQuery(categoryTotalsQuery(household.id, range)).data

  const budgetByCategory = new Map(budgets.map((b) => [b.category_id, b.monthly_amount_minor]))
  // A top-level category's budget includes its sub-categories' spending; a sub's is its own.
  const lookup = new Map(categories.map((c) => [c.id, c]))
  const spentByCategory = spendingByCategory(totals, lookup)
  // Archived categories stay listed only while they still have a budget, so it can be removed.
  const listed = (c: Category) => !c.is_archived || budgetByCategory.has(c.id)
  const totalBudget = totalBudgetMinor(budgets, lookup)

  const { queryKey } = budgetsQuery(household.id)
  const save = useMutation({
    mutationFn: ({ categoryId, amountMinor }: { categoryId: string; amountMinor: number | null }) =>
      setBudget(supabase, household.id, categoryId, amountMinor),
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
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          Monthly limits per category or sub-category. A category's budget includes what's spent on
          its sub-categories. Bars turn amber at 80% and red when you go over. Leave a field empty
          for no budget.
        </p>
        {totalBudget > 0 && (
          <p className="text-sm">
            Total monthly budget:{' '}
            <span className="font-semibold">{formatMoney(totalBudget, household.currency)}</span>
          </p>
        )}
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
              currency={household.currency}
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
