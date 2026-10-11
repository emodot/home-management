import { describe, expect, it } from 'vitest'
import type { HomeClient } from '../client.ts'
import { createKitchenItem, searchKitchenItems } from './queries.ts'

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
  for (const method of ['select', 'eq', 'or', 'order', 'limit', 'insert', 'single']) {
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
