import { formatDate, formatMoney, predictNextRefill, todayIn } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { FlameIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useActiveHousehold } from '@/hooks/use-household'
import { useMediaQuery } from '@/hooks/use-lookups'
import { membersQuery } from '@/lib/queries'
import { GasStatusCard } from '../components/gas-status-card'
import { RefillForm } from '../components/refill-form'
import { useRemoveGasRefill } from '../hooks/use-gas'
import { gasRefillsQuery } from '../lib/queries'

export function GasPage() {
  const household = useActiveHousehold()
  const refills = useSuspenseQuery(gasRefillsQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const remove = useRemoveGasRefill(household.id)
  const wide = useMediaQuery('(min-width: 768px)')
  const [logging, setLogging] = useState(false)
  const today = todayIn(household.timezone)
  const prediction = predictNextRefill(refills)
  const [last] = refills

  if (!last) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState icon={FlameIcon} title="Log your last refill to start tracking">
          After two refills, you'll see how long a cylinder lasts and when the next refill is due.
        </EmptyState>
        <RefillForm refills={refills} members={members} onDone={() => undefined} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <GasStatusCard last={last} prediction={prediction} today={today} />
      <Button className="self-start" onClick={() => setLogging(true)}>
        <PlusIcon aria-hidden />
        Log a refill
      </Button>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Refills</h2>
        <ul className="list-surface">
          {refills.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{formatDate(r.refilledOn)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.cylinderKg} kg
                  {r.providerName ? ` · ${r.providerName}` : ''}
                </span>
              </span>
              {r.expenseId ? (
                <Link
                  to={`/expenses/${r.expenseId}`}
                  className="font-semibold tabular-nums underline-offset-4 hover:underline"
                >
                  {formatMoney(r.amountMinor)}
                </Link>
              ) : (
                <span className="font-semibold tabular-nums">{formatMoney(r.amountMinor)}</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-mr-1 text-muted-foreground"
                aria-label={`Remove the refill on ${formatDate(r.refilledOn)}`}
                onClick={() => remove.mutate(r.id)}
                disabled={remove.isPending}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={logging} onOpenChange={setLogging}>
        <SheetContent
          side={wide ? 'right' : 'bottom'}
          className={wide ? 'w-full overflow-y-auto sm:max-w-md' : 'max-h-[92dvh] overflow-y-auto'}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Log a refill</SheetTitle>
            <SheetDescription>It's added to expenses under Cooking Gas.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {logging && (
              <RefillForm
                refills={refills}
                members={members}
                onDone={() => setLogging(false)}
                onCancel={() => setLogging(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
