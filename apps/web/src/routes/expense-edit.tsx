import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { ExpenseForm } from '@/components/expense-form'
import { useUpdateExpense } from '@/hooks/use-expenses'
import { useActiveHousehold } from '@/hooks/use-household'
import { formatAmountInput } from '@/lib/amount'
import { categoriesQuery, expenseQuery, membersQuery } from '@/lib/queries'

export function EditExpensePage() {
  const { expenseId = '' } = useParams()
  const household = useActiveHousehold()
  const expense = useSuspenseQuery(expenseQuery(household.id, expenseId)).data
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const update = useUpdateExpense(household.id, expenseId)
  const navigate = useNavigate()

  if (!expense) throw new Response('Expense not found', { status: 404 })

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit expense</h1>
      <ExpenseForm
        categories={categories}
        members={members}
        submitLabel="Save changes"
        defaultValues={{
          amount: formatAmountInput(expense.amountMinor),
          occurredOn: expense.occurredOn,
          categoryId: expense.categoryId,
          description: expense.description,
          paidBy: expense.paidBy,
          providerId: expense.providerId,
          notes: expense.notes,
        }}
        onCancel={() => void navigate(-1)}
        onSubmit={async (input) => {
          // Optimistic: the detail page shows the change immediately.
          update.mutate(input)
          await navigate(`/expenses/${expense.id}`, { replace: true })
        }}
      />
    </div>
  )
}
