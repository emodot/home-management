import type { Category, Member, ShoppingListItem } from '@home/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { FinishShoppingSheet } from './finish-shopping-sheet'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => {
  // Any table query (the store chips) resolves to no rows.
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
  }
  for (const method of ['select', 'eq', 'not', 'order', 'limit']) query[method] = () => query
  return { supabase: { from: () => query, rpc } }
})

const entry = (
  id: string,
  name: string,
  pricePaidMinor: number | null,
  unit: ShoppingListItem['unit'] = 'pcs',
): ShoppingListItem => ({
  id,
  householdId: 'h1',
  itemId: `item-${id}`,
  name,
  quantity: 1,
  unit,
  storeTag: 'Mile 12',
  notes: null,
  isChecked: true,
  checkedBy: 'u1',
  pricePaidMinor,
  source: 'manual',
  addedBy: 'u1',
  createdAt: '2026-10-01T10:00:00Z',
})

const entries = [
  entry('e1', 'Tomatoes', 500000, 'paint_bucket'),
  entry('e2', 'Rice', 3850000, 'bag'),
  entry('e3', 'Garri', null),
]
const categories = [
  {
    id: 'c-groceries',
    household_id: 'h1',
    name: 'Groceries',
    icon: 'shopping-basket',
    parent_id: null,
    is_archived: false,
    sort_order: 11,
  },
] as Category[]
const members = [
  {
    user_id: 'u1',
    role: 'admin',
    joined_at: '',
    profile: { id: 'u1', full_name: 'Bola Ade', email: 'bola@example.com', avatar_url: null },
  },
] as unknown as Member[]

async function setup() {
  const onClose = vi.fn()
  renderInApp(
    <FinishShoppingSheet
      open
      entries={entries}
      categories={categories}
      members={members}
      onClose={onClose}
    />,
  )
  await screen.findByRole('dialog', { name: 'Finish shopping' })
  return { onClose, user: userEvent.setup() }
}

const total = () => screen.getByLabelText('Total paid')
const confirmButton = () => screen.getByRole('button', { name: /to expenses$/ })

describe('FinishShoppingSheet', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { trip_id: 't1', expense_id: 'x1' }, error: null })
  })

  it('defaults the total to the sum of the prices (unpriced lines count as nothing)', async () => {
    await setup()
    expect(total()).toHaveValue('43,500')
    expect(confirmButton()).toHaveTextContent('Add ₦43,500 to expenses')
  })

  it('keeps following the prices until the total is changed by hand', async () => {
    const { user } = await setup()
    const tomatoes = screen.getByLabelText('Price paid for Tomatoes')
    await user.clear(tomatoes)
    await user.type(tomatoes, '6000')
    expect(total()).toHaveValue('44,500')
  })

  it('lets the total be overridden, and offers the sum back', async () => {
    const { user } = await setup()
    await user.clear(total())
    await user.type(total(), '42000')
    expect(confirmButton()).toHaveTextContent('Add ₦42,000 to expenses')
    expect(screen.getByText(/The prices add up to ₦43,500/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use that' }))
    expect(total()).toHaveValue('43,500')
  })

  it('sends the trip in kobo, with each line’s pantry choice', async () => {
    const { onClose, user } = await setup()
    await user.clear(total())
    await user.type(total(), '42000')
    // Keep the rice out of the pantry.
    const [, rice] = screen.getAllByRole('checkbox', { name: 'Add to pantry' })
    if (!rice) throw new Error('no pantry checkbox for rice')
    await user.click(rice)
    await user.click(confirmButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith(
      'finish_shopping_trip',
      expect.objectContaining({
        p_household_id: 'h1',
        p_total_minor: 4200000,
        p_category_id: 'c-groceries',
        p_paid_by: 'u1',
        p_store: 'Mile 12',
        p_description: 'Shopping at Mile 12',
        p_entries: [
          { id: 'e1', price_minor: 500000, to_pantry: true },
          { id: 'e2', price_minor: 3850000, to_pantry: false },
          { id: 'e3', price_minor: null, to_pantry: true },
        ],
      }),
    )
  })

  it('stays open and sends nothing when the total is missing', async () => {
    const { onClose, user } = await setup()
    await user.clear(screen.getByLabelText('Price paid for Tomatoes'))
    await user.clear(screen.getByLabelText('Price paid for Rice'))
    await user.click(confirmButton())
    expect(await screen.findByText('Enter what you paid in all')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
