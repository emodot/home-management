import { foodCategoryIds, foodSpendMinor, formatMoney, monthRange, todayIn } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ChevronRightIcon,
  ClockAlertIcon,
  FlameIcon,
  PackageOpenIcon,
  ShoppingBasketIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useActiveHousehold } from '@/hooks/use-household'
import { categoriesQuery, categoryTotalsQuery } from '@/lib/queries'
import { shoppingListQuery } from '../lib/queries'

function OverviewCard({
  to,
  icon: Icon,
  title,
  children,
  hint,
}: {
  to: string
  icon: LucideIcon
  title: string
  children: ReactNode
  hint: string
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-xl bg-muted p-4 transition-colors hover:bg-accent"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm text-muted-foreground">{title}</span>
        <span className="text-lg font-semibold tracking-tight tabular-nums">{children}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRightIcon
        className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  )
}

/** "Rice, Tomatoes and 3 more" */
function listPreview(names: string[]): string {
  const shown = names.slice(0, 2).join(', ')
  return names.length > 2 ? `${shown} and ${names.length - 2} more` : shown
}

export function KitchenOverviewPage() {
  const household = useActiveHousehold()
  const month = monthRange(todayIn(household.timezone))
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const totals = useSuspenseQuery(categoryTotalsQuery(household.id, month)).data
  const toBuy = useSuspenseQuery(shoppingListQuery(household.id)).data.filter((e) => !e.isChecked)
  const foodSpend = foodSpendMinor(totals, categories)
  const [groceries] = foodCategoryIds(categories)
  const spendLink = groceries
    ? `/?month=${month.from.slice(0, 7)}&category=${groceries}`
    : `/?month=${month.from.slice(0, 7)}`

  return (
    <div className="stagger grid gap-3 sm:grid-cols-2">
      <OverviewCard
        to="/kitchen/list"
        icon={ShoppingBasketIcon}
        title="Shopping list"
        hint={toBuy.length === 0 ? 'Add what you need' : listPreview(toBuy.map((e) => e.name))}
      >
        {toBuy.length === 0 ? 'Empty' : `${toBuy.length} to buy`}
      </OverviewCard>
      <OverviewCard
        to="/kitchen/pantry"
        icon={ClockAlertIcon}
        title="Use soon"
        hint="Nothing expiring in the next 3 days"
      >
        Nothing yet
      </OverviewCard>
      <OverviewCard
        to="/kitchen/pantry"
        icon={PackageOpenIcon}
        title="Low stock"
        hint="Track what's in your kitchen"
      >
        Nothing yet
      </OverviewCard>
      <OverviewCard
        to="/kitchen/gas"
        icon={FlameIcon}
        title="Cooking gas"
        hint="Log your last refill to start tracking"
      >
        Not tracked
      </OverviewCard>
      <OverviewCard
        to={spendLink}
        icon={WalletIcon}
        title="Food spend this month"
        hint="Groceries and cooking gas"
      >
        {formatMoney(foodSpend)}
      </OverviewCard>
    </div>
  )
}
