import { ReceiptTextIcon } from 'lucide-react'
import { useActiveHousehold } from '@/hooks/use-household'

// Placeholder home screen; the expenses list arrives in M3.
export function ExpensesPage() {
  const household = useActiveHousehold()

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
        <ReceiptTextIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">No expenses in {household.name} yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Expense tracking with receipt uploads is coming in the next milestone.
        </p>
      </div>
    </section>
  )
}
