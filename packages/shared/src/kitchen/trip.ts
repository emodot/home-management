import type { HomeClient } from '../client.ts'
import { formatMoney } from '../money.ts'
import type { ShoppingListItem } from './list.ts'
import { formatQuantity } from './units.ts'

/** One checked entry as it goes into a finished trip. */
export interface TripLine {
  entryId: string
  /** What was paid for the whole line, or null if not recorded. */
  priceMinor: number | null
  toPantry: boolean
}

export interface FinishTripInput {
  lines: TripLine[]
  /** What was paid in all: the expense amount (can differ from the lines' prices). */
  totalMinor: number
  categoryId: string
  paidOn: string
  paidBy: string
  /** Where the shopping was done (for the expense and the price history). */
  store: string | null
  description: string
  notes: string | null
}

/** "Shopping at Mile 12", or "Shopping" without a store. */
export function tripDescription(store: string | null): string {
  return store ? `Shopping at ${store}` : 'Shopping'
}

const MAX_NOTES = 2000

/** The expense's notes: what was bought, "Tomatoes (2 paint buckets) ₦5,000 · Rice (1 bag)". */
export function tripNotes(
  entries: Pick<ShoppingListItem, 'name' | 'quantity' | 'unit'>[],
  prices: (number | null)[],
): string {
  const notes = entries
    .map((entry, i) => {
      const price = prices[i]
      const line = `${entry.name} (${formatQuantity(entry.quantity, entry.unit)})`
      return price == null ? line : `${line} ${formatMoney(price)}`
    })
    .join(' · ')
  return notes.length > MAX_NOTES ? `${notes.slice(0, MAX_NOTES - 1)}…` : notes
}

/** The total the lines add up to (lines without a price count as nothing). */
export function linesTotalMinor(prices: (number | null)[]): number {
  return prices.reduce<number>((sum, price) => sum + (price ?? 0), 0)
}

const FINISH_ERRORS: Record<string, string> = {
  list_changed:
    'The list changed while you were finishing (someone else may have finished this trip). Check it and try again.',
  nothing_to_finish: 'Check something off first.',
  not_member: "You're not a member of this household.",
}

/**
 * Turns the checked entries into an expense, a trip, price history and pantry stock, and takes
 * them off the list, in one transaction. Returns the new expense's id (for receipts).
 */
export async function finishShoppingTrip(
  client: HomeClient,
  householdId: string,
  input: FinishTripInput,
): Promise<{ tripId: string; expenseId: string }> {
  const { data, error } = await client.rpc('finish_shopping_trip', {
    p_household_id: householdId,
    p_entries: input.lines.map((line) => ({
      id: line.entryId,
      price_minor: line.priceMinor,
      to_pantry: line.toPantry,
    })),
    p_total_minor: input.totalMinor,
    p_category_id: input.categoryId,
    p_paid_on: input.paidOn,
    p_paid_by: input.paidBy,
    p_description: input.description,
    ...(input.notes !== null && { p_notes: input.notes }),
    ...(input.store !== null && { p_store: input.store }),
  })
  if (error) {
    const friendly = FINISH_ERRORS[error.message]
    throw friendly ? new Error(friendly) : error
  }
  const ids = data as { trip_id: string; expense_id: string }
  return { tripId: ids.trip_id, expenseId: ids.expense_id }
}
