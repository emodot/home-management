import type { MealEntry, RecipeSummary } from '@home/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { MealSheet } from './meal-sheet'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => {
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
  }
  for (const method of ['select', 'eq', 'update', 'delete']) query[method] = () => query
  return { supabase: { from: () => query, rpc } }
})

const recipes: RecipeSummary[] = [
  {
    id: 'r-egusi',
    title: 'Egusi soup',
    servings: 6,
    prepMinutes: null,
    cookMinutes: 90,
    tags: [],
    photoPath: null,
    ingredientCount: 8,
    updatedAt: '',
  },
]

const pot: MealEntry = {
  id: 'm1',
  planId: 'p1',
  date: '2026-10-11',
  slot: 'dinner',
  recipeId: 'r-egusi',
  title: 'Egusi soup',
  servings: 4,
  leftoverOf: null,
  cookedAt: null,
  createdAt: '',
}
const leftover: MealEntry = {
  ...pot,
  id: 'm2',
  date: '2026-10-12',
  slot: 'lunch',
  servings: 2,
  leftoverOf: 'm1',
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 'new-meal', error: null })
})

describe('MealSheet', () => {
  it('plans a recipe whose pot also covers later meals', async () => {
    const onClose = vi.fn()
    renderInApp(
      <MealSheet
        target={{ kind: 'add', date: '2026-10-11', slot: 'dinner' }}
        meals={[]}
        slots={['breakfast', 'lunch', 'dinner']}
        recipes={recipes}
        onCook={() => undefined}
        onClose={onClose}
      />,
    )
    const sheet = await screen.findByRole('dialog', { name: 'Plan Sun 11 · Dinner' })
    const user = userEvent.setup()
    await user.click(within(sheet).getByRole('button', { name: 'Egusi soup' }))
    // Servings start at the recipe's own.
    expect(within(sheet).getByRole('group', { name: 'Servings' })).toHaveTextContent('6')
    await user.click(within(sheet).getByLabelText('Mon 12 · Lunch'))
    await user.click(within(sheet).getByLabelText('Tue 13 · Lunch'))
    await user.click(
      within(sheet).getByRole('button', { name: 'Fewer: Servings for Tue 13 · Lunch' }),
    )
    expect(within(sheet).getByText('One pot for 17: this meal and 2 more.')).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Add to the plan' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('add_meal', {
      p_household_id: 'h1',
      p_date: '2026-10-11',
      p_slot: 'dinner',
      p_recipe_id: 'r-egusi',
      p_title: null,
      p_servings: 6,
      p_leftovers: [
        { date: '2026-10-12', slot: 'lunch', servings: 6 },
        { date: '2026-10-13', slot: 'lunch', servings: 5 },
      ],
    })
  })

  it('plans something written in', async () => {
    renderInApp(
      <MealSheet
        target={{ kind: 'add', date: '2026-10-16', slot: 'dinner' }}
        meals={[]}
        slots={['breakfast', 'lunch', 'dinner']}
        recipes={recipes}
        onCook={() => undefined}
        onClose={() => undefined}
      />,
    )
    const sheet = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.click(within(sheet).getByRole('button', { name: 'Something else' }))
    await user.click(within(sheet).getByRole('button', { name: 'Eat out' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add to the plan' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'add_meal',
        expect.objectContaining({ p_recipe_id: null, p_title: 'Eat out', p_leftovers: [] }),
      ),
    )
  })

  it('shows a pot and its leftovers, and asks before taking them off', async () => {
    renderInApp(
      <MealSheet
        target={{ kind: 'edit', meal: pot }}
        meals={[pot, leftover]}
        slots={['breakfast', 'lunch', 'dinner']}
        recipes={recipes}
        onCook={() => undefined}
        onClose={() => undefined}
      />,
    )
    const sheet = await screen.findByRole('dialog', { name: 'Egusi soup' })
    expect(sheet).toHaveTextContent('One pot for 6, covering 1 more meal.')
    expect(within(sheet).getByLabelText('Mon 12 · Lunch')).toBeChecked()
    const user = userEvent.setup()
    await user.click(within(sheet).getByRole('button', { name: 'Take off the plan' }))
    expect(
      await screen.findByRole('alertdialog', { name: 'Take Egusi soup off the plan?' }),
    ).toHaveTextContent('Its 1 leftover meal goes too.')
  })
})
