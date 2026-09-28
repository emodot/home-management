import { describe, expect, it } from 'vitest'
import type { HomeClient } from '../client.ts'
import { escapeLike, suggestCategoryId } from './expenses.ts'

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLike('50% off_now\\')).toBe('50\\% off\\_now\\\\')
    expect(escapeLike('diesel')).toBe('diesel')
  })
})

/** A query builder that records every call and resolves to `rows`. */
function fakeClient(rows: { category_id: string | null }[]) {
  const calls: [string, ...unknown[]][] = []
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
  }
  for (const method of ['select', 'eq', 'is', 'ilike', 'order', 'limit']) {
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

describe('suggestCategoryId', () => {
  it("returns the vendor's most used category, most recent on ties", async () => {
    const { client, calls } = fakeClient([
      { category_id: 'food' },
      { category_id: 'home' },
      { category_id: 'home' },
      { category_id: 'food' },
      { category_id: null },
    ])
    expect(await suggestCategoryId(client, 'h1', 'SHOPRITE LEKKI')).toBe('food')
    expect(calls).toContainEqual(['ilike', 'description', '%shoprite%'])
    expect(calls).toContainEqual(['eq', 'status', 'confirmed'])
    expect(calls).toContainEqual(['is', 'deleted_at', null])
  })

  it('returns null with no matches or no usable vendor word', async () => {
    expect(await suggestCategoryId(fakeClient([]).client, 'h1', 'Shoprite')).toBeNull()
    const { client, calls } = fakeClient([{ category_id: 'food' }])
    expect(await suggestCategoryId(client, 'h1', 'The Store')).toBeNull()
    expect(calls).toEqual([])
  })
})
