import {
  formatMoney,
  formatMonth,
  monthRange,
  percentChange,
  todayIn,
  type CategoryTotal,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PiggyBankIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { BudgetMeter } from '@/components/budget-meter'
import { CategoryIcon } from '@/components/category-icon'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCategoryLookup } from '@/hooks/use-lookups'
import { selectedMonth } from '@/lib/insights'
import { budgetsQuery, categoryTotalsQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'

const sum = (totals: CategoryTotal[]) => totals.reduce((acc, t) => acc + t.totalMinor, 0)

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function InsightsPage() {
  const household = useActiveHousehold()
  const [searchParams, setSearchParams] = useSearchParams()
  const today = todayIn(household.timezone)
  const month = selectedMonth(searchParams.get('month'), today)
  const range = monthRange(`${month}-01`)
  const previousRange = monthRange(`${month}-01`, -1)
  const previousMonth = previousRange.from.slice(0, 7)
  const nextMonth = monthRange(`${month}-01`, 1).from.slice(0, 7)
  const isCurrentMonth = month === today.slice(0, 7)

  const totals = useSuspenseQuery(categoryTotalsQuery(household.id, range)).data
  const previousTotals = useSuspenseQuery(categoryTotalsQuery(household.id, previousRange)).data
  const budgets = useSuspenseQuery(budgetsQuery(household.id)).data
  const categories = useCategoryLookup(household.id)

  const total = sum(totals)
  const previousTotal = sum(previousTotals)
  const change = percentChange(total, previousTotal)
  const byCategory = [...totals].sort((a, b) => b.totalMinor - a.totalMinor)
  const largest = byCategory[0]?.totalMinor ?? 0
  const spentByCategory = new Map(totals.map((t) => [t.categoryId, t.totalMinor]))
  const budgetRows = budgets
    .map((b) => ({
      budget: b,
      category: categories.get(b.category_id),
      spent: spentByCategory.get(b.category_id) ?? 0,
    }))
    .sort(
      (a, b) => b.spent / b.budget.monthly_amount_minor - a.spent / a.budget.monthly_amount_minor,
    )

  function goTo(target: string) {
    setSearchParams(target === today.slice(0, 7) ? {} : { month: target }, { replace: true })
  }

  const expensesLink = (params: Record<string, string>) =>
    `/?${new URLSearchParams({ from: range.from, to: range.to, ...params }).toString()}`

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goTo(previousMonth)}
            aria-label={`Show ${formatMonth(previousMonth)}`}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goTo(nextMonth)}
            disabled={isCurrentMonth}
            aria-label={`Show ${formatMonth(nextMonth)}`}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </div>

      {/* KPI row: a headline number with its comparison, not a chart. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl border p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">
            Spent {isCurrentMonth ? 'this month' : `in ${formatMonth(month)}`}
          </p>
          <p className="text-4xl font-semibold tracking-tight">
            {formatMoney(total, household.currency)}
          </p>
          {change !== null && (
            <p
              className={cn(
                'flex items-center gap-1 text-sm font-medium',
                change > 0 ? 'text-delta-bad' : 'text-delta-good',
              )}
            >
              {change > 0 ? (
                <TrendingUpIcon className="size-4" aria-hidden />
              ) : (
                <TrendingDownIcon className="size-4" aria-hidden />
              )}
              {change > 0 ? '+' : ''}
              {Math.round(change)}% vs {isCurrentMonth ? 'all of ' : ''}
              {formatMonth(previousMonth)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 rounded-xl border p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">{formatMonth(previousMonth)}</p>
          <p className="text-2xl font-semibold tracking-tight">
            {formatMoney(previousTotal, household.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {previousTotals.reduce((n, t) => n + t.expenseCount, 0)} expenses
          </p>
        </div>
      </div>

      <Card title="By category">
        {byCategory.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No spending recorded in {formatMonth(month)}.
          </p>
        ) : (
          // A ranked bar list: every value is also written out, so nothing depends on hover.
          <ul className="flex flex-col gap-1">
            {byCategory.map((t) => {
              const category = categories.get(t.categoryId)
              const share = total > 0 ? Math.round((t.totalMinor / total) * 100) : 0
              return (
                <li key={t.categoryId}>
                  <Link
                    to={expensesLink({ category: t.categoryId })}
                    className="-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <CategoryIcon icon={category?.icon} className="size-6 bg-transparent" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {category?.name ?? 'Unknown'}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(t.totalMinor, household.currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pl-8">
                      <div className="h-2.5 flex-1">
                        <div
                          className="h-full min-w-1 rounded-r-[4px] bg-viz-bar"
                          style={{ width: `${(t.totalMinor / largest) * 100}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {share}% · {t.expenseCount} {t.expenseCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Budgets"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/budgets">{budgets.length ? 'Manage' : 'Set budgets'}</Link>
          </Button>
        }
      >
        {budgetRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <PiggyBankIcon className="size-8 text-muted-foreground" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              Set a monthly budget for categories like fuel or groceries to see how close you are.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {budgetRows.map(({ budget, category, spent }) => (
              <li key={budget.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{category?.name ?? 'Unknown'}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    <span className="font-semibold text-foreground">
                      {formatMoney(spent, budget.currency)}
                    </span>
                    {' of '}
                    {formatMoney(budget.monthly_amount_minor, budget.currency)}
                  </span>
                </div>
                <BudgetMeter
                  spentMinor={spent}
                  budgetMinor={budget.monthly_amount_minor}
                  currency={budget.currency}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
