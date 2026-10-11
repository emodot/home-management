import {
  foodCategoryIds,
  foodSpendMinor,
  formatDate,
  formatMoney,
  gasStatus,
  isLowStock,
  isOut,
  monthRange,
  predictNextRefill,
  todayIn,
  USE_SOON_DAYS,
  itemsToUseSoon,
} from '@home/shared'
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
import { gasRefillsQuery, pantryQuery, shoppingListQuery } from '../lib/queries'

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
  const pantry = useSuspenseQuery(pantryQuery(household.id)).data
  const soon = itemsToUseSoon(pantry, todayIn(household.timezone))
  const low = pantry.filter((i) => isOut(i) || isLowStock(i))
  const refills = useSuspenseQuery(gasRefillsQuery(household.id)).data
  const gas = predictNextRefill(refills)
  const gasLeft = gas ? gasStatus(gas, todayIn(household.timezone)).daysLeft : null
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
        hint={
          soon.length === 0
            ? `Nothing expiring in the next ${USE_SOON_DAYS} days`
            : listPreview(soon.map((i) => i.name))
        }
      >
        {soon.length === 0 ? 'Nothing' : `${soon.length} to use`}
      </OverviewCard>
      <OverviewCard
        to="/kitchen/pantry"
        icon={PackageOpenIcon}
        title="Low stock"
        hint={
          pantry.length === 0
            ? "Track what's in your kitchen"
            : low.length === 0
              ? 'Nothing running low'
              : listPreview(low.map((i) => i.name))
        }
      >
        {pantry.length === 0
          ? 'Not tracked'
          : low.length === 0
            ? 'All good'
            : `${low.length} running low`}
      </OverviewCard>
      <OverviewCard
        to="/kitchen/gas"
        icon={FlameIcon}
        title="Cooking gas"
        hint={
          refills.length === 0
            ? 'Log your last refill to start tracking'
            : gas
              ? `Next refill around ${formatDate(gas.nextOn)}`
              : 'Log the next refill to see a prediction'
        }
      >
        {gasLeft === null
          ? refills.length === 0
            ? 'Not tracked'
            : 'Tracking'
          : gasLeft < 0
            ? `${-gasLeft} ${gasLeft === -1 ? 'day' : 'days'} overdue`
            : `${gasLeft} ${gasLeft === 1 ? 'day' : 'days'} left`}
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
