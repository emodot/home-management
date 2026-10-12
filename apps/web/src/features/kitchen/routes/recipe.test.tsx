import { screen } from '@testing-library/react'
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

vi.mock('@/lib/supabase', () => {
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve({ data: recipe, error: null }),
  }
  for (const method of ['select', 'eq', 'maybeSingle']) query[method] = () => query
  return { supabase: { from: () => query } }
})

async function setup(url = '/kitchen/recipes/r1') {
  const app = renderInApp(
    <Suspense fallback={null}>
      <RecipePage />
    </Suspense>,
    { path: '/kitchen/recipes/:recipeId', url },
  )
  await screen.findByRole('heading', { name: 'Jollof rice' })
  return { ...app, user: userEvent.setup() }
}

const amounts = () =>
  screen
    .getAllByRole('listitem')
    .filter(
      (li) => li.closest('section')?.getAttribute('aria-labelledby') === 'ingredients-heading',
    )
    .map((li) => li.textContent)

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
    expect(amounts()[0]).toBe('≈ 4 dericasRice')
    await user.click(screen.getByRole('button', { name: 'Back to 4' }))
    expect(amounts()[0]).toBe('3 dericasRice')
  })
})
