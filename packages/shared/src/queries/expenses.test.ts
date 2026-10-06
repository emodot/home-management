import { describe, expect, it } from 'vitest'
import type { HomeClient } from '../client.ts'
import { createExpenses, escapeLike, findMatchingExpenses, suggestCategoryId } from './expenses.ts'

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLike('50% off_now\\')).toBe('50\\% off\\_now\\\\')
    expect(escapeLike('diesel')).toBe('diesel')
  })
})

/** A query builder that records every call and resolves to `rows`. */
function fakeClient(rows: object[]) {
  const calls: [string, ...unknown[]][] = []
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
  }
  for (const method of ['select', 'eq', 'is', 'ilike', 'in', 'insert', 'order', 'limit']) {
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

const FOOD = '0b6f8f6c-3a8e-4f43-9a51-6f5d0c1f2a11'
const input = (amountMinor: number, description: string) => ({
  amountMinor,
  occurredOn: '2026-09-12',
  categoryId: FOOD,
  description,
  paidBy: null,
  providerId: null,
  notes: null,
})
const created = (id: string, amountMinor: number, description: string) => ({
  id,
  amount_minor: amountMinor,
  occurred_on: '2026-09-12',
  category_id: FOOD,
  description,
})

describe('createExpenses', () => {
  it('inserts every expense in one call and returns ids in input order', async () => {
    const { client, calls } = fakeClient([
      created('b', 2000, 'Diesel'),
      created('a', 1000, 'Shoprite'),
      created('c', 1000, 'Shoprite'),
    ])
    const ids = await createExpenses(client, 'h1', [
      input(1000, ' Shoprite '),
      input(2000, 'Diesel'),
      input(1000, 'Shoprite'),
    ])
    expect(ids).toEqual(['a', 'b', 'c'])
    const inserts = calls.filter(([method]) => method === 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.[1]).toHaveLength(3)
  })

  it('does nothing for an empty batch', async () => {
    const { client, calls } = fakeClient([])
    expect(await createExpenses(client, 'h1', [])).toEqual([])
    expect(calls).toEqual([])
  })
})

describe('findMatchingExpenses', () => {
  const row = (id: string, amount: number, date: string) => ({
    id,
    household_id: 'h1',
    amount_minor: amount,
    currency: 'NGN',
    occurred_on: date,
    category_id: FOOD,
    description: 'Shoprite',
    budget_month: `${date.slice(0, 7)}-01`,
    created_at: '2026-09-12T10:00:00Z',
    updated_at: '2026-09-12T10:00:00Z',
    status: 'confirmed',
  })

  it('keeps only exact amount-and-date pairs', async () => {
    const { client, calls } = fakeClient([
      row('match', 1000, '2026-09-12'),
      row('cross', 1000, '2026-09-13'), // amount of one candidate, date of the other
      row('other', 2000, '2026-09-13'),
    ])
    const found = await findMatchingExpenses(client, 'h1', [
      { amountMinor: 1000, occurredOn: '2026-09-12' },
      { amountMinor: 2000, occurredOn: '2026-09-13' },
    ])
    expect(found.map((e) => e.id)).toEqual(['match', 'other'])
    expect(calls).toContainEqual(['in', 'amount_minor', [1000, 2000]])
    expect(calls).toContainEqual(['is', 'deleted_at', null])
  })
})
