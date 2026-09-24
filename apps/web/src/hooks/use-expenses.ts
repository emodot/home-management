import {
  createExpense,
  setExpenseDeleted,
  setReceiptDeleted,
  updateExpense,
  uploadReceipt,
  type Expense,
  type ExpenseInput,
  type Receipt,
} from '@home/shared'
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { PreparedReceipt } from '@/lib/images'
import { errorMessage } from '@/lib/errors'
import { expenseQuery, expensesKey, receiptsQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

type ExpensePages = InfiniteData<Expense[], number>

/** Applies `update` to the expense in every cached list and its detail entry. */
function patchCachedExpense(
  queryClient: QueryClient,
  householdId: string,
  expenseId: string,
  update: (expense: Expense) => Expense | null,
) {
  queryClient.setQueriesData<ExpensePages>(
    { queryKey: [...expensesKey(householdId), 'list'] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) =>
          page.flatMap((expense) => {
            if (expense.id !== expenseId) return [expense]
            const next = update(expense)
            return next ? [next] : []
          }),
        ),
      },
  )
  queryClient.setQueryData(expenseQuery(householdId, expenseId).queryKey, (expense) =>
    expense ? (update(expense) ?? { ...expense, deletedAt: new Date().toISOString() }) : expense,
  )
}

/**
 * Uploads receipts for an expense, reporting progress in a toast. Runs outside any component so
 * it keeps going after the form navigates away.
 */
export async function uploadReceiptsInBackground(
  queryClient: QueryClient,
  householdId: string,
  expenseId: string,
  files: PreparedReceipt[],
  openExpense: (expenseId: string) => void,
) {
  if (files.length === 0) return
  const label = files.length === 1 ? 'receipt' : `${files.length} receipts`
  const toastId = toast.loading(`Uploading ${label}…`)

  const results = await Promise.allSettled(
    files.map((file) =>
      uploadReceipt(supabase, {
        householdId,
        expenseId,
        data: file.data,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
      }),
    ),
  )
  await queryClient.invalidateQueries({ queryKey: expensesKey(householdId) })

  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed === 0) {
    toast.success(files.length === 1 ? 'Receipt uploaded' : `${files.length} receipts uploaded`, {
      id: toastId,
    })
  } else {
    toast.error(
      failed === files.length
        ? `Couldn't upload the ${label}.`
        : `${failed} of ${files.length} receipts couldn't be uploaded.`,
      {
        id: toastId,
        action: { label: 'Open', onClick: () => openExpense(expenseId) },
      },
    )
  }
}

function useOpenExpense() {
  const navigate = useNavigate()
  return (expenseId: string) => void navigate(`/expenses/${expenseId}`)
}

export function useCreateExpense(householdId: string) {
  const queryClient = useQueryClient()
  const openExpense = useOpenExpense()
  return useMutation({
    mutationFn: ({ input }: { input: ExpenseInput; files: PreparedReceipt[] }) =>
      createExpense(supabase, householdId, input),
    onSuccess: async (expenseId, { files }) => {
      await queryClient.invalidateQueries({ queryKey: expensesKey(householdId) })
      void uploadReceiptsInBackground(queryClient, householdId, expenseId, files, openExpense)
    },
  })
}

export function useUpdateExpense(householdId: string, expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ExpenseInput) => updateExpense(supabase, expenseId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: expensesKey(householdId) })
      patchCachedExpense(queryClient, householdId, expenseId, (expense) => ({
        ...expense,
        amountMinor: input.amountMinor,
        occurredOn: input.occurredOn,
        categoryId: input.categoryId,
        description: input.description.trim(),
        paidBy: input.paidBy,
        notes: input.notes?.trim() ? input.notes.trim() : null,
      }))
    },
    onError: (error) => toast.error(`Couldn't save changes. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
  })
}

export function useRestoreExpense(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expense: Expense) => setExpenseDeleted(supabase, expense.id, false),
    onSuccess: (_data, expense) => toast.success(`Restored "${expense.description}"`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
  })
}

/** Soft-deletes with an optimistic update and an Undo action in the toast. */
export function useDeleteExpense(householdId: string) {
  const queryClient = useQueryClient()
  const restore = useRestoreExpense(householdId)

  return useMutation({
    mutationFn: (expense: Expense) => setExpenseDeleted(supabase, expense.id, true),
    onMutate: async (expense) => {
      await queryClient.cancelQueries({ queryKey: expensesKey(householdId) })
      patchCachedExpense(queryClient, householdId, expense.id, () => null)
    },
    onSuccess: (_data, expense) => {
      toast.success(`Deleted "${expense.description}"`, {
        action: { label: 'Undo', onClick: () => restore.mutate(expense) },
      })
    },
    onError: (error) => toast.error(`Couldn't delete. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
  })
}

export function useAddReceipts(householdId: string, expenseId: string) {
  const queryClient = useQueryClient()
  const openExpense = useOpenExpense()
  return useMutation({
    mutationFn: (files: PreparedReceipt[]) =>
      uploadReceiptsInBackground(queryClient, householdId, expenseId, files, openExpense),
  })
}

export function useDeleteReceipt(householdId: string, expenseId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = receiptsQuery(householdId, expenseId)

  const restore = useMutation({
    mutationFn: (receipt: Receipt) => setReceiptDeleted(supabase, receipt.id, false),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
  })

  return useMutation({
    mutationFn: (receipt: Receipt) => setReceiptDeleted(supabase, receipt.id, true),
    onMutate: async (receipt) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, (old) => old?.filter((r) => r.id !== receipt.id))
    },
    onSuccess: (_data, receipt) => {
      toast.success('Receipt deleted', {
        action: { label: 'Undo', onClick: () => restore.mutate(receipt) },
      })
    },
    onError: (error) => toast.error(`Couldn't delete the receipt. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
  })
}

export function useRestoreReceipt(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (receipt: Pick<Receipt, 'id' | 'file_name'>) =>
      setReceiptDeleted(supabase, receipt.id, false),
    onSuccess: (_data, receipt) => toast.success(`Restored ${receipt.file_name}`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
  })
}
