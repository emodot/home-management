import { todayIn } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ExpenseForm } from '@/components/expense-form'
import { useCreateExpense } from '@/hooks/use-expenses'
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { categoriesQuery, membersQuery } from '@/lib/queries'

export function NewExpensePage() {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const create = useCreateExpense(household.id)
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add expense</h1>
      <ExpenseForm
        withReceipts
        categories={categories}
        members={members}
        submitLabel="Save expense"
        defaultValues={{
          amount: '',
          occurredOn: todayIn(household.timezone),
          categoryId: '',
          description: '',
          paidBy: user.id,
          providerId: null,
          notes: null,
        }}
        onCancel={() => void navigate(-1)}
        onSubmit={async (input, files) => {
          try {
            const id = await create.mutateAsync({ input, files })
            toast.success('Expense added', {
              action: { label: 'View', onClick: () => void navigate(`/expenses/${id}`) },
            })
            await navigate('/', { replace: true })
          } catch (error) {
            toast.error(`Couldn't save the expense. ${errorMessage(error)}`)
          }
        }}
      />
    </div>
  )
}
