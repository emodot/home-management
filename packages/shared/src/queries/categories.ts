import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { categoryInputSchema, type CategoryInput } from '../schemas/expenses.ts'

export type Category = Tables<'expense_categories'>

/** All categories, archived included (old expenses still show them), in display order. */
export async function listCategories(client: HomeClient, householdId: string): Promise<Category[]> {
  return unwrap(
    await client
      .from('expense_categories')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order')
      .order('name'),
  )
}

export async function createCategory(
  client: HomeClient,
  householdId: string,
  input: CategoryInput,
  sortOrder: number,
): Promise<Category> {
  const { name, icon } = categoryInputSchema.parse(input)
  return unwrap(
    await client
      .from('expense_categories')
      .insert({ household_id: householdId, name, icon, sort_order: sortOrder })
      .select('*')
      .single(),
  )
}

export async function updateCategory(
  client: HomeClient,
  id: string,
  changes: Partial<CategoryInput> & { isArchived?: boolean },
): Promise<Category> {
  const parsed = categoryInputSchema.partial().parse(changes)
  return unwrap(
    await client
      .from('expense_categories')
      .update({
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.icon !== undefined && { icon: parsed.icon }),
        ...(changes.isArchived !== undefined && { is_archived: changes.isArchived }),
      })
      .eq('id', id)
      .select('*')
      .single(),
  )
}

/** Saves a new display order: `ids` from first to last. */
export async function reorderCategories(
  client: HomeClient,
  householdId: string,
  ids: string[],
): Promise<void> {
  unwrap(
    await client.rpc('reorder_expense_categories', { p_household_id: householdId, p_ids: ids }),
  )
}
