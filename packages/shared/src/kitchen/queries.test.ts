import { describe, expect, it } from 'vitest'
import type { HomeClient } from '../client.ts'
import {
  addToShoppingList,
  createKitchenItem,
  DuplicateKitchenItemError,
  listCatalogItems,
  listKitchenConversions,
  searchKitchenItems,
  updateKitchenItem,
} from './queries.ts'

const row = (name: string, normalized: string) => ({
  id: `id-${normalized}`,
  household_id: 'h1',
  name,
  normalized_name: normalized,
  default_unit: 'pcs',
  default_store_tag: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
})

/** A query builder that records calls; each awaited query resolves to the next response. */
function fakeClient(responses: { data: unknown; error: unknown }[]) {
  const calls: [string, ...unknown[]][] = []
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      resolve(responses.shift() ?? { data: null, error: null }),
  }
  for (const method of ['select', 'eq', 'or', 'order', 'limit', 'insert', 'update', 'single']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args])
      return builder
    }
  }
  const client = {
    from: (table: string) => {
      calls.push(['from', table])
      return builder
    },
  } as unknown as HomeClient
  return { client, calls }
}

describe('searchKitchenItems', () => {
  it('ranks the exact item first, then names starting with the search', async () => {
    const { client, calls } = fakeClient([
      {
        data: [
          row('Cherry tomatoes', 'cherry tomato'),
          row('Tomato paste', 'tomato paste'),
          row('Tomatoes', 'tomato'),
        ],
        error: null,
      },
    ])
    const items = await searchKitchenItems(client, 'h1', 'Tomatoes')
    expect(items.map((i) => i.name)).toEqual(['Tomatoes', 'Tomato paste', 'Cherry tomatoes'])
    expect(calls).toContainEqual([
      'or',
      'normalized_name.ilike.%tomatoes%,normalized_name.ilike.%tomato%',
    ])
  })

  it('lists recent items when nothing is typed', async () => {
    const { client, calls } = fakeClient([{ data: [row('Rice', 'rice')], error: null }])
    expect(await searchKitchenItems(client, 'h1', '  ')).toHaveLength(1)
    expect(calls.some(([method]) => method === 'or')).toBe(false)
  })
})

describe('createKitchenItem', () => {
  it('stores the matching key with the name as typed', async () => {
    const { client, calls } = fakeClient([{ data: row('Maggi cubes', 'maggi cube'), error: null }])
    const item = await createKitchenItem(client, 'h1', { name: ' Maggi cubes ' })
    expect(item.normalizedName).toBe('maggi cube')
    expect(calls).toContainEqual([
      'insert',
      {
        household_id: 'h1',
        name: 'Maggi cubes',
        normalized_name: 'maggi cube',
        default_unit: 'pcs',
        default_store_tag: null,
      },
    ])
  })

  it('returns the existing item when the name is already in the catalogue', async () => {
    const { client } = fakeClient([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: row('Tomatoes', 'tomato'), error: null },
    ])
    const item = await createKitchenItem(client, 'h1', { name: 'tomato' })
    expect(item.name).toBe('Tomatoes')
  })

  it('rejects names with nothing to match on', async () => {
    const { client } = fakeClient([])
    await expect(createKitchenItem(client, 'h1', { name: '!!!' })).rejects.toThrow()
  })
})

describe('addToShoppingList', () => {
  const tomatoes = {
    id: 'item-1',
    householdId: 'h1',
    name: 'Tomatoes',
    normalizedName: 'tomato',
    defaultUnit: 'paint_bucket' as const,
    defaultStoreTag: 'Mile 12',
  }
  const entry = (isChecked: boolean) => ({
    id: 'entry-1',
    household_id: 'h1',
    item_id: 'item-1',
    quantity: '2.00', // numeric can come back as a string
    unit: 'paint_bucket',
    store_tag: 'Mile 12',
    notes: null,
    is_checked: isChecked,
    checked_by: null,
    checked_at: null,
    source: 'manual',
    source_ref: null,
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    item: { name: 'Tomatoes' },
  })

  it('adds the item with its usual unit and store', async () => {
    const { client, calls } = fakeClient([{ data: entry(false), error: null }])
    const result = await addToShoppingList(client, 'h1', tomatoes)
    expect(result.status).toBe('added')
    expect(result.entry).toMatchObject({ name: 'Tomatoes', quantity: 2, unit: 'paint_bucket' })
    expect(calls).toContainEqual([
      'insert',
      {
        household_id: 'h1',
        item_id: 'item-1',
        quantity: 1,
        unit: 'paint_bucket',
        store_tag: 'Mile 12',
        source: 'manual',
      },
    ])
  })

  it('points at the existing entry when the item is already on the list', async () => {
    const { client, calls } = fakeClient([
      { data: null, error: { code: '23505', message: 'duplicate' } },
      { data: entry(false), error: null },
    ])
    expect((await addToShoppingList(client, 'h1', tomatoes)).status).toBe('exists')
    expect(calls.some(([method]) => method === 'update')).toBe(false)
  })

  it('puts a checked-off entry back on the list', async () => {
    const { client, calls } = fakeClient([
      { data: null, error: { code: '23505', message: 'duplicate' } },
      { data: entry(true), error: null },
      { data: entry(false), error: null },
    ])
    const result = await addToShoppingList(client, 'h1', tomatoes)
    expect(result.status).toBe('unchecked')
    expect(result.entry.isChecked).toBe(false)
    expect(calls).toContainEqual(['update', { is_checked: false }])
  })
})

describe('listCatalogItems', () => {
  it("counts each item's prices", async () => {
    const { client } = fakeClient([
      {
        data: [
          { ...row('Rice', 'rice'), prices: [{ count: 3 }] },
          { ...row('Salt', 'salt'), prices: [] },
        ],
        error: null,
      },
    ])
    const items = await listCatalogItems(client, 'h1')
    expect(items.map((i) => [i.name, i.priceCount])).toEqual([
      ['Rice', 3],
      ['Salt', 0],
    ])
  })
})

describe('updateKitchenItem', () => {
  it('renames with a new matching key', async () => {
    const { client, calls } = fakeClient([
      { data: row('Long grain rice', 'long grain rice'), error: null },
    ])
    const item = await updateKitchenItem(
      client,
      { id: 'id-rice', householdId: 'h1' },
      { name: 'Long grain rice', defaultUnit: 'bag', defaultStoreTag: 'Mile 12' },
    )
    expect(item.name).toBe('Long grain rice')
    expect(calls).toContainEqual([
      'update',
      {
        name: 'Long grain rice',
        normalized_name: 'long grain rice',
        default_unit: 'bag',
        default_store_tag: 'Mile 12',
      },
    ])
  })

  it('names the item that already has that name, so they can be merged', async () => {
    const { client } = fakeClient([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: row('Tomatoes', 'tomato'), error: null },
    ])
    const attempt = updateKitchenItem(
      client,
      { id: 'id-tomatos', householdId: 'h1' },
      { name: 'Tomato' },
    )
    await expect(attempt).rejects.toBeInstanceOf(DuplicateKitchenItemError)
    await expect(attempt).rejects.toMatchObject({ existing: { id: 'id-tomato' } })
  })
})

describe('listKitchenConversions', () => {
  it('reads factors stored as text', async () => {
    const { client } = fakeClient([
      {
        data: [{ id: 'c1', item_id: 'id-rice', unit: 'bag', factor: '50.0000', to_unit: 'kg' }],
        error: null,
      },
    ])
    expect(await listKitchenConversions(client, 'h1')).toEqual([
      { id: 'c1', itemId: 'id-rice', unit: 'bag', factor: 50, toUnit: 'kg' },
    ])
  })
})
