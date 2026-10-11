import { describe, expect, it } from 'vitest'
import type { HomeClient } from '../client.ts'
import { finishShoppingTrip, linesTotalMinor, tripDescription, tripNotes } from './trip.ts'

describe('trip text', () => {
  it('describes the trip by its store', () => {
    expect(tripDescription('Mile 12')).toBe('Shopping at Mile 12')
    expect(tripDescription(null)).toBe('Shopping')
  })

  it('lists what was bought, with prices where there are some', () => {
    expect(
      tripNotes(
        [
          { name: 'Tomatoes', quantity: 2, unit: 'paint_bucket' },
          { name: 'Rice', quantity: 1, unit: 'bag' },
        ],
        [500000, null],
      ),
    ).toBe('Tomatoes (2 paint buckets) ₦5,000 · Rice (1 bag)')
  })

  it('totals the line prices in kobo, ignoring the unpriced', () => {
    expect(linesTotalMinor([500000, null, 150050])).toBe(650050)
    expect(linesTotalMinor([])).toBe(0)
  })
})

describe('finishShoppingTrip', () => {
  const input = {
    lines: [
      { entryId: 'e1', priceMinor: 500000, toPantry: true },
      { entryId: 'e2', priceMinor: null, toPantry: false },
    ],
    totalMinor: 650000,
    categoryId: 'c1',
    paidOn: '2026-10-10',
    paidBy: 'u1',
    store: 'Mile 12',
    description: 'Shopping at Mile 12',
    notes: null,
  }

  it('sends the lines in kobo and returns the new ids', async () => {
    const calls: unknown[] = []
    const client = {
      rpc: (name: string, args: unknown) => {
        calls.push([name, args])
        return Promise.resolve({ data: { trip_id: 't1', expense_id: 'x1' }, error: null })
      },
    } as unknown as HomeClient
    expect(await finishShoppingTrip(client, 'h1', input)).toEqual({ tripId: 't1', expenseId: 'x1' })
    expect(calls).toEqual([
      [
        'finish_shopping_trip',
        {
          p_household_id: 'h1',
          p_entries: [
            { id: 'e1', price_minor: 500000, to_pantry: true },
            { id: 'e2', price_minor: null, to_pantry: false },
          ],
          p_total_minor: 650000,
          p_category_id: 'c1',
          p_paid_on: '2026-10-10',
          p_paid_by: 'u1',
          p_description: 'Shopping at Mile 12',
          p_store: 'Mile 12',
        },
      ],
    ])
  })

  it('explains a list that changed underneath', async () => {
    const client = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'list_changed', code: '40001' } }),
    } as unknown as HomeClient
    await expect(finishShoppingTrip(client, 'h1', input)).rejects.toThrow(/list changed/)
  })
})
