import {
  addMonths,
  formatDate,
  formatMoney,
  formatMonth,
  monthOf,
  monthRange,
  todayIn,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HandCoinsIcon,
  PlusIcon,
  RepeatIcon,
  Trash2Icon,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { IncomeForm } from '@/components/income-form'
import { PendingIncome } from '@/components/pending-income'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCurrentUser, useActiveHousehold } from '@/hooks/use-household'
import { useCreateIncome, useDeleteIncome, useUpdateIncome } from '@/hooks/use-income'
import { useMemberNames } from '@/hooks/use-lookups'
import { formatAmountInput } from '@/lib/amount'
import { countsTowardLabel } from '@/lib/budget-month'
import { errorMessage } from '@/lib/errors'
import { budgetMonthParam } from '@/lib/insights'
import {
  categoryTotalsQuery,
  incomeEntryQuery,
  incomeMonthQuery,
  incomeTotalsQuery,
  membersQuery,
} from '@/lib/queries'
import { cn } from '@/lib/utils'

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-base font-semibold tracking-tight break-all tabular-nums sm:text-2xl',
          className,
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Income counting toward a month, with that month's spending and net. Household admins only. */
export function IncomePage() {
  const household = useActiveHousehold()
  const [searchParams, setSearchParams] = useSearchParams()
  const thisMonth = todayIn(household.timezone).slice(0, 7)
  const month = budgetMonthParam(searchParams.get('month'), thisMonth)
  const range = monthRange(`${month}-01`)
  const entries = useSuspenseQuery(incomeMonthQuery(household.id, month)).data
  const received = useSuspenseQuery(incomeTotalsQuery(household.id, range)).data
  const spentTotals = useSuspenseQuery(categoryTotalsQuery(household.id, range)).data
  const memberNames = useMemberNames(household.id)

  const income = received.reduce((sum, t) => sum + t.totalMinor, 0)
  const spent = spentTotals.reduce((sum, t) => sum + t.totalMinor, 0)
  const net = income - spent

  function goTo(target: string) {
    setSearchParams(target === thisMonth ? {} : { month: target }, { replace: true })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
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
      <p className="-mt-3 text-sm text-muted-foreground">
        Only household admins can see income. It counts toward the month it&apos;s for, like
        expenses.
      </p>

      <PendingIncome />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Income" value={formatMoney(income, household.currency)} />
        <Stat label="Spent" value={formatMoney(spent, household.currency)} />
        <Stat
          label="Net"
          value={formatMoney(net, household.currency)}
          className={net < 0 ? 'text-delta-bad' : net > 0 ? 'text-delta-good' : undefined}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">
          {entries.length === 0
            ? 'Entries'
            : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}
        </h2>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/income/recurring">
              <RepeatIcon aria-hidden />
              Regular income
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to={month === thisMonth ? '/income/new' : `/income/new?month=${month}`}>
              <PlusIcon aria-hidden />
              Add income
            </Link>
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={HandCoinsIcon} title={`No income for ${formatMonth(month)}`} size="sm">
          Record salary, business takings or rent received to see what&apos;s left after spending.
        </EmptyState>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                to={`/income/${entry.id}/edit`}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <HandCoinsIcon className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{entry.source}</span>
                    {countsTowardLabel({
                      occurredOn: entry.receivedOn,
                      budgetMonth: entry.budgetMonth,
                    }) && (
                      <Badge variant="secondary" className="shrink-0">
                        {countsTowardLabel({
                          occurredOn: entry.receivedOn,
                          budgetMonth: entry.budgetMonth,
                        })}
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[
                      formatDate(entry.receivedOn, { day: 'numeric', month: 'short' }),
                      entry.receivedBy && (memberNames.get(entry.receivedBy) ?? 'Former member'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-delta-good tabular-nums">
                  +{formatMoney(entry.amountMinor, entry.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function NewIncomePage() {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const create = useCreateIncome(household.id)
  const navigate = useNavigate()
  const today = todayIn(household.timezone)
  // Opened from another month's page: count toward that month.
  const month = budgetMonthParam(useSearchParams()[0].get('month'), today)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add income</h1>
      <IncomeForm
        members={members}
        submitLabel="Save income"
        defaultValues={{
          amount: '',
          receivedOn: today,
          budgetMonth: month,
          source: '',
          receivedBy: user.id,
          notes: null,
        }}
        onCancel={() => void navigate(-1)}
        onSubmit={async (input) => {
          try {
            await create.mutateAsync(input)
            toast.success('Income added')
            const target = input.budgetMonth ?? monthOf(input.receivedOn)
            await navigate(target === today.slice(0, 7) ? '/income' : `/income?month=${target}`, {
              replace: true,
            })
          } catch (error) {
            toast.error(`Couldn't save the income. ${errorMessage(error)}`)
          }
        }}
      />
    </div>
  )
}

export function EditIncomePage() {
  const household = useActiveHousehold()
  const { incomeId = '' } = useParams()
  const entry = useSuspenseQuery(incomeEntryQuery(household.id, incomeId)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const update = useUpdateIncome(household.id, incomeId)
  const remove = useDeleteIncome(household.id)
  const navigate = useNavigate()

  if (!entry || entry.deletedAt) throw new Response('Income not found', { status: 404 })
  const backTo = `/income?month=${entry.budgetMonth}`

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit income</h1>
      <IncomeForm
        members={members}
        submitLabel="Save changes"
        defaultValues={{
          amount: formatAmountInput(entry.amountMinor),
          receivedOn: entry.receivedOn,
          budgetMonth: entry.budgetMonth,
          source: entry.source,
          receivedBy: entry.receivedBy,
          notes: entry.notes,
        }}
        onCancel={() => void navigate(-1)}
        onSubmit={async (input) => {
          try {
            await update.mutateAsync(input)
            toast.success('Income updated')
            await navigate(`/income?month=${input.budgetMonth ?? monthOf(input.receivedOn)}`, {
              replace: true,
            })
          } catch (error) {
            toast.error(`Couldn't save changes. ${errorMessage(error)}`)
          }
        }}
        extraActions={
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => {
              remove.mutate(entry)
              void navigate(backTo, { replace: true })
            }}
          >
            <Trash2Icon aria-hidden />
            Delete
          </Button>
        }
      />
    </div>
  )
}
