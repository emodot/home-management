import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { CatalogItemPage } from './catalog-item'

const row = (id: string, name: string, normalized: string, prices = 0) => ({
  id,
  household_id: 'h1',
  name,
  normalized_name: normalized,
  default_unit: 'tin',
  default_store_tag: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  prices: [{ count: prices }],
})
const typo = row('i-typo', 'Tomatoe paste', 'tomatoe paste', 1)
const tomato = row('i-tomato', 'Tomato paste', 'tomato paste', 3)

const rpc = vi.hoisted(() => vi.fn())
const updates = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/supabase', () => {
  /** Answers by table and by what the query asked for. */
  function respond(table: string, calls: [string, ...unknown[]][]) {
    const called = (method: string) => calls.find(([m]) => m === method)
    if (table !== 'kitchen_items') return { data: [], error: null }
    const update = called('update')
    if (update) {
      updates.push(update[1])
      return { data: null, error: { code: '23505', message: 'duplicate key' } }
    }
    if (called('maybeSingle')) return { data: typo, error: null }
    if (called('single')) return { data: tomato, error: null }
    if (String(called('select')?.[1]).includes('prices'))
      return { data: [tomato, typo], error: null }
    return { data: [], error: null }
  }
  return {
    supabase: {
      rpc,
      from: (table: string) => {
        const calls: [string, ...unknown[]][] = []
        const query: Record<string, unknown> = {
          then: (resolve: (value: unknown) => unknown) => resolve(respond(table, calls)),
        }
        for (const method of ['select', 'eq', 'not', 'or', 'order', 'limit', 'update', 'single']) {
          query[method] = (...args: unknown[]) => {
            calls.push([method, ...args])
            return query
          }
        }
        query.maybeSingle = () => {
          calls.push(['maybeSingle'])
          return query
        }
        return query
      },
    },
  }
})

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: null, error: null })
  updates.length = 0
})

async function setup() {
  const app = renderInApp(
    <Suspense fallback={null}>
      <CatalogItemPage />
    </Suspense>,
    { path: '/kitchen/items/:itemId', url: '/kitchen/items/i-typo' },
  )
  await screen.findByRole('heading', { name: 'Tomatoe paste' })
  return { ...app, user: userEvent.setup() }
}

describe('CatalogItemPage', () => {
  it('offers to merge when renamed to a name another item has', async () => {
    const { user, router } = await setup()
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Tomato paste')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText("There's already an item called Tomato paste.")).toBeVisible()
    expect(updates[0]).toMatchObject({ name: 'Tomato paste', normalized_name: 'tomato paste' })

    await user.click(screen.getByRole('button', { name: 'Merge this into Tomato paste' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Merge Tomatoe paste into Tomato paste?',
    })
    expect(dialog).toHaveTextContent('Its price moves to Tomato paste')
    await user.click(within(dialog).getByRole('button', { name: 'Merge' }))

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('merge_kitchen_items', {
        p_keep: 'i-tomato',
        p_merge: 'i-typo',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/kitchen/items/i-tomato'))
  })

  it('checks a conversion before adding it', async () => {
    const { user } = await setup()
    await user.type(screen.getByLabelText('How many in 1 tin'), '0')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number above zero')
  })
})
