import { budgetInputSchema, formatMoney, monthRange, todayIn, type Category } from '@home/shared'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { setBudget } from '@home/shared'
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
  budgetMinor,
  spentMinor,
  currency,
  onSave,
}: {
  category: Category
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
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={category.icon} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{category.name}</p>
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
            aria-label={`Monthly budget for ${category.name}`}
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
  const spentByCategory = new Map(totals.map((t) => [t.categoryId, t.totalMinor]))
  // Archived categories stay listed only while they still have a budget, so it can be removed.
  const rows = categories.filter((c) => !c.is_archived || budgetByCategory.has(c.id))
  const totalBudget = budgets.reduce((sum, b) => sum + b.monthly_amount_minor, 0)

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
          Monthly limits per category. Bars turn amber at 80% and red when you go over. Leave a
          field empty for no budget.
        </p>
        {totalBudget > 0 && (
          <p className="text-sm">
            Total monthly budget:{' '}
            <span className="font-semibold">{formatMoney(totalBudget, household.currency)}</span>
          </p>
        )}
      </div>
      <ul className="divide-y rounded-xl border">
        {rows.map((category) => (
          <BudgetRow
            key={category.id}
            category={category}
            budgetMinor={budgetByCategory.get(category.id)}
            spentMinor={spentByCategory.get(category.id) ?? 0}
            currency={household.currency}
            onSave={(amountMinor) => save.mutate({ categoryId: category.id, amountMinor })}
          />
        ))}
      </ul>
    </div>
  )
}
