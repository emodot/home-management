import { describe, expect, it, vi } from 'vitest'
import type { HomeClient } from '../client.ts'
import { saveRecipe, toRecipe } from './recipe-queries.ts'
import { recipeFormSchema } from './schemas.ts'

describe('saveRecipe', () => {
  it('sends the recipe with its ingredients and steps in order', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'r1', error: null })
    const values = recipeFormSchema.parse({
      title: 'Moi moi',
      servings: '4',
      prepMinutes: '30',
      cookMinutes: '',
      tags: ['Snack'],
      notes: '',
      ingredients: [
        {
          itemId: 'beans',
          name: 'Beans',
          quantity: '1.5',
          unit: 'derica',
          isOptional: false,
          note: '',
        },
        {
          itemId: 'egg',
          name: 'Eggs',
          quantity: '2',
          unit: 'pcs',
          isOptional: true,
          note: 'boiled',
        },
      ],
      steps: [{ body: 'Peel the beans.' }, { body: 'Steam.' }],
    })
    const id = await saveRecipe({ rpc } as unknown as HomeClient, 'h1', null, values)
    expect(id).toBe('r1')
    expect(rpc).toHaveBeenCalledWith('save_recipe', {
      p_household_id: 'h1',
      p_recipe_id: null,
      p_title: 'Moi moi',
      p_servings: 4,
      p_prep_minutes: 30,
      p_cook_minutes: null,
      p_tags: ['Snack'],
      p_notes: null,
      p_ingredients: [
        { item_id: 'beans', quantity: 1.5, unit: 'derica', is_optional: false, note: null },
        { item_id: 'egg', quantity: 2, unit: 'pcs', is_optional: true, note: 'boiled' },
      ],
      p_steps: ['Peel the beans.', 'Steam.'],
    })
  })
})

describe('toRecipe', () => {
  it('orders ingredients and steps by position and reads numbers stored as text', () => {
    const recipe = toRecipe({
      id: 'r1',
      household_id: 'h1',
      title: 'Moi moi',
      servings: 4,
      prep_minutes: null,
      cook_minutes: 60,
      tags: [],
      notes: null,
      photo_path: null,
      created_by: null,
      updated_by: null,
      created_at: '',
      updated_at: '',
      ingredients: [
        {
          id: 'b',
          household_id: 'h1',
          recipe_id: 'r1',
          item_id: 'oil',
          quantity: '0.5' as unknown as number,
          unit: 'litre',
          is_optional: false,
          note: null,
          position: 2,
          item: { name: 'Palm oil' },
        },
        {
          id: 'a',
          household_id: 'h1',
          recipe_id: 'r1',
          item_id: 'beans',
          quantity: null,
          unit: 'derica',
          is_optional: false,
          note: null,
          position: 1,
          item: { name: 'Beans' },
        },
      ],
      steps: [
        { id: 's2', household_id: 'h1', recipe_id: 'r1', position: 2, body: 'Steam.' },
        { id: 's1', household_id: 'h1', recipe_id: 'r1', position: 1, body: 'Blend.' },
      ],
    })
    expect(recipe.ingredients.map((i) => [i.name, i.quantity])).toEqual([
      ['Beans', null],
      ['Palm oil', 0.5],
    ])
    expect(recipe.steps).toEqual(['Blend.', 'Steam.'])
  })
})
