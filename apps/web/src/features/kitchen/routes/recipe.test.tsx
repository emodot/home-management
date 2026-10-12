import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { RecipePage } from './recipe'

// Jollof rice for 4, with 8 ingredients.
const ingredients = [
  ['Rice', 3, 'derica'],
  ['Tomatoes', 500, 'g'],
  ['Chicken', 1.5, 'kg'],
  ['Stock', 400, 'ml'],
  ['Tomato paste', 2, 'tin'],
  ['Onions', 3, 'pcs'],
  ['Curry powder', 1, 'sachet'],
  ['Salt', null, 'pcs'],
] as const

const recipe = {
  id: 'r1',
  household_id: 'h1',
  title: 'Jollof rice',
  servings: 4,
  prep_minutes: 20,
  cook_minutes: 60,
  tags: ['Rice'],
  notes: null,
  photo_path: null,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  ingredients: ingredients.map(([name, quantity, unit], i) => ({
    id: `i${i}`,
    household_id: 'h1',
    recipe_id: 'r1',
    item_id: `item-${i}`,
    quantity,
    unit,
    is_optional: false,
    note: null,
    position: i + 1,
    item: { name },
  })),
  steps: [{ id: 's1', household_id: 'h1', recipe_id: 'r1', position: 1, body: 'Cook it.' }],
}

// The pantry has plenty of rice and some tomatoes; rice and tomatoes have prices.
const pantry = [
  { item_id: 'item-0', quantity: 10, unit: 'derica' },
  { item_id: 'item-1', quantity: 200, unit: 'g' },
].map((p, i) => ({
  ...p,
  id: `p${i}`,
  household_id: 'h1',
  location: 'pantry',
  expires_on: null,
  low_stock_threshold: null,
  updated_at: '',
  item: null,
}))
const prices = [
  { item_id: 'item-0', quantity: 1, unit: 'derica', price_minor: 200000, bought_on: '2026-10-01' },
  { item_id: 'item-1', quantity: 1, unit: 'kg', price_minor: 150000, bought_on: '2026-10-01' },
].map((p, i) => ({
  ...p,
  id: `price${i}`,
  household_id: 'h1',
  trip_id: 't1',
  unit_price_minor: p.price_minor / p.quantity,
  store_tag: null,
  created_at: '',
  item: { name: '' },
}))

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => {
  // Looked up when a query runs: the mock is set up before the fixtures above.
  const rows = (table: string): unknown =>
    ({ recipes: recipe, pantry_items: pantry, item_prices: prices })[table] ?? []
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: {
      rpc,
      channel: () => channel,
      removeChannel: () => Promise.resolve('ok'),
      from: (table: string) => {
        const query: Record<string, unknown> = {
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: rows(table), error: null }),
        }
        for (const method of ['select', 'eq', 'maybeSingle', 'order', 'limit']) {
          query[method] = () => query
        }
        return query
      },
    },
  }
})

async function setup(url = '/kitchen/recipes/r1') {
  const app = renderInApp(
    <Suspense fallback={null}>
      <RecipePage />
    </Suspense>,
    { path: '/kitchen/recipes/:recipeId', url },
  )
  await screen.findByRole('heading', { name: 'Jollof rice', level: 2 })
  return { ...app, user: userEvent.setup() }
}

const amounts = () =>
  screen
    .getAllByRole('listitem')
    .filter(
      (li) => li.closest('section')?.getAttribute('aria-labelledby') === 'ingredients-heading',
    )
    // The amount and the name, without the pantry note under it.
    .map(
      (li) =>
        `${li.firstElementChild?.textContent ?? ''}${li.lastElementChild?.firstChild?.textContent ?? ''}`,
    )

describe('RecipePage', () => {
  it('scales its 8 ingredients from 4 to 10 servings', async () => {
    await setup('/kitchen/recipes/r1?servings=10')
    expect(screen.getByRole('group', { name: 'Servings' })).toHaveTextContent('10')
    expect(amounts()).toEqual([
      '7.5 dericasRice',
      '1.25 kgTomatoes',
      '3.75 kgChicken',
      '1 litreStock',
      '5 tinsTomato paste',
      '7.5 piecesOnions',
      '2.5 sachetsCurry powder',
      'to tasteSalt',
    ])
  })

  it("steps the servings and goes back to the recipe's own", async () => {
    const { user, router } = await setup()
    expect(amounts()[0]).toBe('3 dericasRice')
    await user.click(screen.getByRole('button', { name: 'More servings' }))
    expect(router.state.location.search).toBe('?servings=5')
    await waitFor(() => expect(amounts()[0]).toBe('≈ 4 dericasRice'))
    await user.click(await screen.findByRole('button', { name: 'Back to 4' }))
    await waitFor(() => expect(amounts()[0]).toBe('3 dericasRice'))
  })

  it('says what the pantry is short of and adds it to the list', async () => {
    const { user } = await setup()
    expect(screen.getByText("You can't cook this yet").closest('p')).toHaveTextContent(
      "You can't cook this yet: 6 not in the pantry, 1 short",
    )
    expect(screen.getByText('Short: need 300 g more')).toBeVisible()
    rpc.mockResolvedValue({
      data: [{ item_id: 'item-1', status: 'added' }],
      error: null,
    })
    await user.click(screen.getByRole('button', { name: 'Add missing to list' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add missing to the list' })
    // Salt (to taste) is one to buy; nothing optional here, so all 7 are ticked.
    await user.click(within(sheet).getByRole('button', { name: 'Add 7 items to the list' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    const [, args] = rpc.mock.calls[0] as [string, { p_lines: { item_id: string }[] }]
    expect(args.p_lines.map((l) => l.item_id)).toEqual([
      'item-1',
      'item-2',
      'item-3',
      'item-4',
      'item-5',
      'item-6',
      'item-7',
    ])
  })

  it('works out the cost of a pot from the latest prices', async () => {
    await setup()
    const cost = screen.getByRole('region', { name: 'Cost per pot' })
    // 3 derica × ₦2,000 + 0.5 kg × ₦1,500; the rest have no price.
    expect(cost).toHaveTextContent('₦6,750')
    expect(cost).toHaveTextContent(
      'Not counted, no price yet: Chicken, Stock, Tomato paste, Onions, Curry powder.',
    )
  })
})
